/**
 * Desktop download facade (NEX-131 A段 收尾).
 *
 * Replaces the legacy `download-engine.ts` EventEmitter with a thin shim
 * over the shared TaskQueueAPI. Public surface (`startDownload`,
 * `cancelDownload`, `getActiveDownloads`, etc. + the legacy event names)
 * stays compatible so renderer/IPC handlers are unchanged. Inputs are
 * stuffed into `task.input.options` (per `YtDlpTaskOptions`) and outputs
 * are mapped back through `projectTaskForRenderer`.
 *
 * Live yt-dlp log streaming is wired through the kernel's `log` event
 * (emitted from the executor's `onStd`): we accumulate a capped per-task
 * buffer and replay it via `download-log`. Saved logs for terminal items are
 * read on demand from the persisted attempt tail (`queue.getTaskLog`).
 * `glitchTipEventId` remains a best-effort no-op in this iteration.
 */

import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import {
  enqueueInstagramProfileDownload,
  expandTikTokShortLink,
  type InstagramProfileCategory,
  type InstagramProfileDownloadInput,
  type InstagramProfileDownloadResult,
  type InstagramProfileInspection,
  planPlaylistDownloadOrder,
  playlistEntryGroupKey,
  resolveDownloadTaskKind
} from '@vidbee/downloader-core'
import { FanslyCommandSchema } from '@vidbee/downloader-core/fansly-profile'
import { isMappedProfilePostUrl } from '@vidbee/downloader-core/mapped-profile-source'
import type { OnlyFansCommand, OnlyFansDownload } from '@vidbee/downloader-core/onlyfans-profile'
import { resolveSocialSource, SocialMediaOptionsSchema } from '@vidbee/downloader-core/social-media'
import {
  downloadSocialMedia,
  previewSocialMedia,
  type SocialMediaDownloadRequest
} from '@vidbee/downloader-core/social-media-service'
import {
  isDownloadTaskKind,
  PRIORITY_USER,
  type Task,
  type TaskInput,
  type TaskQueueAPI
} from '@vidbee/task-queue'
import type {
  DownloadItem,
  DownloadOptions,
  DownloadProgress,
  PlaylistDownloadOptions,
  PlaylistDownloadResult,
  PlaylistInfo,
  VideoInfo,
  VideoInfoCommandResult
} from '../../shared/types'
import { buildPendingDownloadItem, hasDisplayMetadata } from '../../shared/utils/pending-download'
import { buildVideoInfoDownloadMetadata } from '../../shared/utils/video-info-metadata'
import { settingsManager } from '../settings'
import { scopedLoggers } from '../utils/logger'
import { toSharedSettings } from './command-utils'
import { shouldSurfaceQueuedDownload } from './download-queue-events'
import { galleryDlManager } from './gallery-dl-manager'
import { applyAutoVideoDownloadPath } from './path-resolver'
import { projectProgressForRenderer, projectTaskForRenderer } from './projection'
import { getSocialProfileManager } from './social-profile-manager'
import { socialSessionManager } from './social-session-manager'
import {
  applyDesktopQueueConcurrency,
  getDesktopFanslyProfiles,
  getDesktopInstagramProfileInspector,
  getDesktopOnlyFansProfiles,
  getDesktopTaskQueue,
  resolveDesktopDownloadDir,
  sourceAdmission,
  startDesktopTaskQueue
} from './task-queue-host'
import { fetchPlaylistInfo, fetchVideoInfo, fetchVideoInfoWithCommand } from './yt-dlp-info'

const logger = scopedLoggers.download

const NON_TERMINAL: ReadonlySet<Task['status']> = new Set([
  'queued',
  'running',
  'processing',
  'paused',
  'retry-scheduled'
])

/** Cap the per-task live log buffer so a long-running download cannot grow it without bound. */
const MAX_LOG_BUFFER = 80_000

const ensureDirectoryExists = (dir?: string): void => {
  if (!dir) {
    return
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs') as typeof import('node:fs')
    fs.mkdirSync(dir, { recursive: true })
  } catch (err) {
    logger.warn('download-facade: failed to ensure download directory', err)
  }
}

const sequentialNextByDir = new Map<string, number>()
const SEQUENTIAL_PREFIX_REGEX = /^(\d+)\./

const scanMaxSequentialIndex = (dir: string): number => {
  let max = -1
  try {
    for (const name of fs.readdirSync(dir)) {
      const match = SEQUENTIAL_PREFIX_REGEX.exec(name)
      if (!match) {
        continue
      }
      const index = Number.parseInt(match[1] ?? '', 10)
      if (Number.isFinite(index) && index > max) {
        max = index
      }
    }
  } catch {
    // A missing or unreadable destination is equivalent to an empty one.
  }
  return max
}

const reserveSequentialIndex = (dir: string): number => {
  const filesystemMax = scanMaxSequentialIndex(dir)
  const reserved = sequentialNextByDir.get(dir) ?? 0
  const next = Math.max(filesystemMax + 1, reserved)
  sequentialNextByDir.set(dir, next + 1)
  return next
}

const applySequentialFilename = (options: DownloadOptions): DownloadOptions => {
  const settings = settingsManager.getAll()
  if (!settings.sequentialFilenames || options.customFilenameTemplate?.trim()) {
    return options
  }
  const dir = options.customDownloadPath?.trim() || settings.downloadPath || ''
  if (!dir) {
    return options
  }
  return { ...options, customFilenameTemplate: `${reserveSequentialIndex(dir)}.%(ext)s` }
}

/** Fill missing title/thumbnail metadata from yt-dlp before a task is queued. */
const hydrateDownloadMetadata = async (options: DownloadOptions): Promise<DownloadOptions> => {
  if (
    hasDisplayMetadata(options) ||
    resolveDownloadTaskKind(options.url, options.type) !== options.type
  ) {
    return options
  }

  try {
    const info = await fetchVideoInfo(options.url)
    const metadata = buildVideoInfoDownloadMetadata(info)
    return {
      ...options,
      title: options.title ?? metadata.title,
      thumbnail: options.thumbnail ?? metadata.thumbnail,
      description: options.description ?? metadata.description,
      channel: options.channel ?? metadata.channel,
      uploader: options.uploader ?? metadata.uploader,
      viewCount: options.viewCount ?? metadata.viewCount,
      duration: options.duration ?? metadata.duration
    }
  } catch (err) {
    logger.warn('download-facade: failed to hydrate video metadata', err)
    return options
  }
}

const buildTaskInput = (id: string, options: DownloadOptions): TaskInput => {
  const settings = settingsManager.getAll()
  const downloadPath = options.customDownloadPath?.trim() || settings.downloadPath || ''
  return {
    url: options.url,
    kind: options.singleVideo ? options.type : resolveDownloadTaskKind(options.url, options.type),
    subscriptionId: options.subscriptionId,
    // Stash renderer-fetched metadata at the canonical TaskInput slots so
    // projectTaskToLegacy round-trips them. Without these, the renderer's
    // optimistic row gets its title/thumbnail/etc. wiped the first time
    // snapshot-changed fires `download:updated` with the bare projection.
    title: options.title,
    thumbnail: options.thumbnail,
    options: {
      type: options.type,
      singleVideo: options.singleVideo,
      socialMedia: resolveSocialSource(options.url)
        ? SocialMediaOptionsSchema.parse(options.socialMedia ?? {})
        : undefined,
      sourceMediaKind:
        resolveSocialSource(options.url) && !options.singleVideo
          ? options.socialMedia?.media === 'images'
            ? 'image'
            : options.socialMedia?.media === 'videos'
              ? 'video'
              : 'mixed'
          : undefined,
      format: options.format,
      audioFormat: options.audioFormat,
      audioFormatIds: options.audioFormatIds,
      startTime: options.startTime,
      endTime: options.endTime,
      customDownloadPath: options.customDownloadPath || downloadPath,
      customFilenameTemplate: options.customFilenameTemplate,
      containerFormat: options.containerFormat,
      // Snapshot the runtime download settings (cookies, proxy, embed flags) at
      // enqueue time. Without these the task-queue executor falls back to empty
      // defaults, so cookie-gated sites (e.g. Bilibili) fail with HTTP 412 and
      // embed/proxy preferences are silently ignored.
      settings: toSharedSettings(settings),
      // Renderer hint: stash original client id for diagnostics; not used
      // for correlation (the kernel id is canonical).
      clientId: id,
      origin: options.origin ?? 'manual',
      tags: options.tags,
      downloadPath,
      // Metadata mirrored back through projectTaskToLegacy → projection.ts
      // so the renderer sees the same fields it saw on optimistic insert.
      description: options.description,
      channel: options.channel,
      uploader: options.uploader,
      viewCount: options.viewCount,
      duration: options.duration,
      selectedFormat: options.selectedFormat,
      batchId: options.batchId,
      batchKind: options.batchId ? 'social-media' : undefined,
      batchTitle: options.batchTitle,
      batchOrder: options.batchOrder
    }
  }
}

class DownloadFacade extends EventEmitter {
  openSocialProfileLogin(url: string) {
    return socialSessionManager.open(url)
  }

  getSocialProfile(url: string) {
    return getSocialProfileManager().get(url)
  }

  listSocialProfiles() {
    return getSocialProfileManager().list()
  }

  mapSocialProfile(url: string, category: string) {
    return getSocialProfileManager().map(url, category, toSharedSettings(settingsManager.getAll()))
  }

  stopSocialProfile(url: string) {
    return getSocialProfileManager().stop(url)
  }

  async downloadSocialProfileItems(
    url: string,
    category: string,
    ids: string[],
    destination?: string
  ) {
    const profile = getSocialProfileManager().get(url)
    const items = profile.categories[category]?.items.filter((item) => ids.includes(item.id)) ?? []
    if (items.length !== new Set(ids).size) {
      throw new Error('Some selected posts are no longer in the saved profile map.')
    }
    if (items.some((item) => !isMappedProfilePostUrl(profile.platform, item.url))) {
      throw new Error('Saved profile contains an invalid post URL.')
    }
    const batchId = `social_profile_${randomUUID()}`
    const batchTitle = `@${profile.owner}`
    if (profile.platform === 'redgifs') {
      this.subscribeOnce()
      await startDesktopTaskQueue()
      for (const [index, item] of items.entries()) {
        const id = randomUUID()
        await this.queue.add({
          id,
          input: buildTaskInput(id, {
            url: item.url,
            type: 'video',
            singleVideo: true,
            title: item.title,
            customDownloadPath: destination,
            batchId,
            batchTitle,
            batchOrder: index
          }),
          priority: PRIORITY_USER
        })
      }
      return { count: items.length }
    }
    let count = 0
    for (const [index, item] of items.entries()) {
      const result = await this.downloadSocialMedia(
        {
          url: item.url,
          customDownloadPath: destination,
          settings: toSharedSettings(settingsManager.getAll())
        },
        { id: batchId, title: batchTitle, order: index }
      )
      count += result.ids.length
    }
    return { count }
  }

  inspectSocialMedia(url: string) {
    return previewSocialMedia(
      url,
      {
        admission: sourceAdmission,
        resolveBinaryPath: () => galleryDlManager.getPath(),
        resolveExtraArgs: (settings, sourceUrl) =>
          galleryDlManager.getRuntimeArgs(settings, sourceUrl)
      },
      toSharedSettings(settingsManager.getAll())
    )
  }

  async downloadSocialMedia(
    request: SocialMediaDownloadRequest,
    batch?: { id: string; title: string; order: number }
  ) {
    this.subscribeOnce()
    await startDesktopTaskQueue()
    return downloadSocialMedia(
      this.queue,
      {
        ...request,
        settings: toSharedSettings(settingsManager.getAll())
      },
      batch
    )
  }

  private subscribed = false
  /** Accumulated live yt-dlp output per active task, replayed to the renderer via `download-log`. */
  private readonly logBuffers = new Map<string, string>()
  /** Starts that have been shown in the list but are still hydrating metadata. */
  private readonly pendingStarts = new Map<string, { cancelled: boolean }>()

  private get queue(): TaskQueueAPI {
    return getDesktopTaskQueue()
  }

  private subscribeOnce(): void {
    if (this.subscribed) {
      return
    }
    this.subscribed = true
    const queue = this.queue
    queue.on('snapshot-changed', (event) => {
      if (!isDownloadTaskKind(event.task.kind)) {
        return
      }
      const item = projectTaskForRenderer(event.task)
      this.emit('download-updated', item.id, item)
    })
    queue.on('transition', (event) => {
      const task = queue.get(event.taskId)
      if (!(task && isDownloadTaskKind(task.kind))) {
        return
      }
      const item = projectTaskForRenderer(task)
      switch (event.to) {
        case 'queued':
          if (shouldSurfaceQueuedDownload(event.from)) {
            this.logBuffers.delete(event.taskId)
            this.emit('download-queued', item)
          }
          break
        case 'running':
          this.emit('download-started', event.taskId)
          break
        case 'completed':
          this.logBuffers.delete(event.taskId)
          this.emit('download-completed', event.taskId)
          break
        case 'failed': {
          this.logBuffers.delete(event.taskId)
          const message = task.lastError?.rawMessage ?? 'Download failed'
          this.emit('download-error', event.taskId, new Error(message))
          break
        }
        case 'cancelled':
          this.logBuffers.delete(event.taskId)
          this.emit('download-cancelled', event.taskId)
          break
        default:
          // paused / retry-scheduled / processing surface via download-updated.
          break
      }
    })
    queue.on('progress', (event) => {
      const task = queue.get(event.taskId)
      if (!task) {
        return
      }
      const progress = projectProgressForRenderer(task)
      if (progress) {
        this.emit('download-progress', event.taskId, progress as DownloadProgress)
      }
    })
    // Stream live yt-dlp output: append each line to a capped per-task buffer and
    // replay the full buffer so the renderer's log panel mirrors the legacy contract.
    queue.on('log', (event) => {
      const next = `${this.logBuffers.get(event.taskId) ?? ''}${event.line}\n`
      const buffer = next.length > MAX_LOG_BUFFER ? next.slice(next.length - MAX_LOG_BUFFER) : next
      this.logBuffers.set(event.taskId, buffer)
      this.emit('download-log', event.taskId, buffer)
    })
  }

  // ───────────── Stateless metadata ─────────────

  resolveUrl(url: string): Promise<string> {
    return expandTikTokShortLink(url)
  }

  getVideoInfo(url: string): Promise<VideoInfo> {
    return fetchVideoInfo(url)
  }

  getVideoInfoWithCommand(url: string): Promise<VideoInfoCommandResult> {
    return fetchVideoInfoWithCommand(url)
  }

  getPlaylistInfo(url: string): Promise<PlaylistInfo> {
    return fetchPlaylistInfo(url)
  }

  fanslyProfileCommand(input: OnlyFansCommand) {
    return getDesktopFanslyProfiles().command(FanslyCommandSchema.parse(input))
  }
  listFanslyProfiles() {
    return getDesktopFanslyProfiles().list()
  }
  async downloadFanslyProfile(input: OnlyFansDownload) {
    this.subscribeOnce()
    await startDesktopTaskQueue()
    return getDesktopFanslyProfiles().enqueue(this.queue, input)
  }

  onlyFansProfileCommand(input: OnlyFansCommand) {
    return getDesktopOnlyFansProfiles().command(input)
  }

  listOnlyFansProfiles() {
    return getDesktopOnlyFansProfiles().list()
  }

  async downloadOnlyFansProfile(input: OnlyFansDownload) {
    this.subscribeOnce()
    await startDesktopTaskQueue()
    return getDesktopOnlyFansProfiles().enqueue(this.queue, input)
  }

  listInstagramProfiles() {
    return getDesktopInstagramProfileInspector().list()
  }

  cancelInstagramProfileMapping(url: string): boolean {
    return getDesktopInstagramProfileInspector().cancel(url)
  }

  inspectInstagramProfile(
    url: string,
    categories?: InstagramProfileCategory[]
  ): Promise<InstagramProfileInspection> {
    const settings = toSharedSettings(settingsManager.getAll())
    return getDesktopInstagramProfileInspector().inspect(url, settings, categories)
  }

  // ───────────── Queue control ─────────────

  startDownload(id: string, options: DownloadOptions): boolean {
    this.subscribeOnce()
    // Show the row immediately. Bilibili (and similar) metadata probes can
    // take tens of seconds; the list must not wait on that hydration.
    this.emit('download-queued', buildPendingDownloadItem(id, options))
    const pending = { cancelled: false }
    this.pendingStarts.set(id, pending)
    void (async () => {
      try {
        await startDesktopTaskQueue()
        if (pending.cancelled) {
          return
        }
        // Share-sheet links hide whether the post is a video or a photo set.
        const resolvedOptions = { ...options, url: await expandTikTokShortLink(options.url) }
        if (pending.cancelled) {
          return
        }
        const hydratedOptions = await hydrateDownloadMetadata(resolvedOptions)
        if (pending.cancelled) {
          return
        }
        const pathResolvedOptions =
          resolveSocialSource(hydratedOptions.url) && !hydratedOptions.singleVideo
            ? hydratedOptions
            : applyAutoVideoDownloadPath(hydratedOptions, settingsManager.getAll())
        const finalOptions = applySequentialFilename(pathResolvedOptions)
        ensureDirectoryExists(finalOptions.customDownloadPath)
        // Pass the renderer-generated id through so optimistic-UI rows merge
        // with the real task instead of showing as two separate entries.
        await this.queue.add({
          id,
          input: buildTaskInput(id, finalOptions),
          groupKey:
            resolveSocialSource(finalOptions.url) && !finalOptions.singleVideo
              ? `social:${resolveSocialSource(finalOptions.url)?.platform}`
              : undefined,
          priority: PRIORITY_USER
        })
        if (pending.cancelled) {
          await this.queue.cancel(id, 'user')
        }
      } catch (err) {
        if (pending.cancelled) {
          return
        }
        logger.error('download-facade: startDownload failed', err)
        const message = err instanceof Error ? err : new Error(String(err))
        this.emit('download-error', id, message)
      } finally {
        this.pendingStarts.delete(id)
      }
    })()
    return true
  }

  /**
   * Cancel a download and acknowledge it only after the terminal state is durable.
   *
   * @param id Download / task id.
   * @returns Whether the task existed and its cancellation was persisted.
   */
  async cancelDownload(id: string): Promise<boolean> {
    this.subscribeOnce()
    const pending = this.pendingStarts.get(id)
    if (pending) {
      pending.cancelled = true
      this.pendingStarts.delete(id)
      this.emit('download-cancelled', id)
      return true
    }
    if (!this.queue.get(id)) {
      return false
    }
    try {
      await this.queue.cancel(id, 'user')
      return true
    } catch (err) {
      logger.error('download-facade: cancelDownload failed', err)
      return false
    }
  }

  /** Cancel the current queue snapshot, including starts not yet persisted. */
  async cancelAllDownloads(): Promise<{ cancelled: number; failed: number }> {
    const ids = new Set([
      ...this.getActiveDownloads().map((item) => item.id),
      ...this.pendingStarts.keys()
    ])
    let cancelled = 0
    let failed = 0
    for (const id of ids) {
      if (await this.cancelDownload(id)) {
        cancelled += 1
      } else {
        const task = this.queue.get(id)
        if (task && NON_TERMINAL.has(task.status)) {
          failed += 1
        }
      }
    }
    return { cancelled, failed }
  }

  /**
   * Pause a queued or in-flight download without removing the row.
   *
   * @param id Download / task id.
   * @returns false when the id is not in the queue.
   */
  pauseDownload(id: string): boolean {
    this.subscribeOnce()
    if (!this.queue.get(id)) {
      return false
    }
    void this.queue.pause(id, 'user').catch((err) => {
      logger.error('download-facade: pauseDownload failed', err)
    })
    return true
  }

  /**
   * Resume a paused download by re-queuing it for a new executor run.
   *
   * @param id Download / task id.
   * @returns false when the id is not in the queue.
   */
  resumeDownload(id: string): boolean {
    this.subscribeOnce()
    if (!this.queue.get(id)) {
      return false
    }
    void this.queue.resume(id).catch((err) => {
      logger.error('download-facade: resumeDownload failed', err)
    })
    return true
  }

  /**
   * Requeue a failed or cancelled task in place. Returns false when the id
   * is missing or not in a retryable terminal state.
   */
  async retryDownload(id: string): Promise<boolean> {
    this.subscribeOnce()
    await startDesktopTaskQueue()
    const task = this.queue.get(id)
    if (task?.kind === 'social-media' && task.status === 'completed') {
      await this.queue.add({
        input: {
          ...task.input,
          options: { ...task.input.options, settings: toSharedSettings(settingsManager.getAll()) }
        },
        groupKey: task.groupKey
      })
      return true
    }
    if (!task || (task.status !== 'failed' && task.status !== 'cancelled')) {
      return false
    }
    // Retry with current authentication; preserve the task's format and destination.
    const options = task.input.options ?? {}
    const previousSettings = (options.settings ?? {}) as Record<string, unknown>
    const current = toSharedSettings(settingsManager.getAll())
    await this.queue.retryManual(id, {
      ...options,
      settings: {
        ...previousSettings,
        browserForCookies: current.browserForCookies,
        cookiesPath: current.cookiesPath,
        proxy: current.proxy
      }
    })
    return true
  }

  async startPlaylistDownload(options: PlaylistDownloadOptions): Promise<PlaylistDownloadResult> {
    this.subscribeOnce()
    await startDesktopTaskQueue()
    const playlist = await this.getPlaylistInfo(options.url)
    const groupId = `playlist_group_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    if (playlist.entryCount === 0) {
      logger.warn('Playlist has no entries:', options.url)
      return {
        groupId,
        playlistId: playlist.id,
        playlistTitle: playlist.title,
        type: options.type,
        totalCount: 0,
        startIndex: 0,
        endIndex: 0,
        entries: []
      }
    }

    let selected: PlaylistInfo['entries']
    if (options.entryIds && options.entryIds.length > 0) {
      const ids = new Set(options.entryIds)
      selected = playlist.entries.filter((e) => ids.has(e.id))
    } else {
      const requestedStart = Math.max((options.startIndex ?? 1) - 1, 0)
      const requestedEnd = options.endIndex
        ? Math.min(options.endIndex - 1, playlist.entryCount - 1)
        : playlist.entryCount - 1
      const rangeStart = Math.min(requestedStart, requestedEnd)
      const rangeEnd = Math.max(requestedStart, requestedEnd)
      selected = playlist.entries.slice(rangeStart, rangeEnd + 1)
    }

    const settings = settingsManager.getAll()
    const resolvedDownloadPath =
      options.customDownloadPath?.trim() ||
      path.join(settings.downloadPath, 'Playlists', sanitizePathSegment(playlist.title))
    ensureDirectoryExists(resolvedDownloadPath)

    const entries: PlaylistDownloadResult['entries'] = []
    const playlistGroupKey = `playlist:${groupId}`
    for (const entry of planPlaylistDownloadOrder(selected)) {
      try {
        const result = await this.queue.add({
          input: {
            url: entry.url,
            kind: options.type === 'audio' ? 'audio' : 'video',
            title: entry.title,
            thumbnail: entry.thumbnail,
            playlistId: groupId,
            playlistIndex: entry.index,
            options: {
              type: options.type,
              format: options.format,
              audioFormat: options.type === 'audio' ? options.format : undefined,
              customDownloadPath: resolvedDownloadPath,
              containerFormat: options.containerFormat,
              // Same runtime settings (cookies, proxy, embed flags) as single
              // downloads, otherwise playlist entries ignore them too.
              settings: toSharedSettings(settings),
              title: entry.title,
              thumbnail: entry.thumbnail,
              playlistTitle: playlist.title,
              playlistSize: selected.length,
              mediaKind: entry.mediaKind,
              origin: 'manual'
            }
          },
          priority: PRIORITY_USER,
          groupKey: playlistEntryGroupKey(entry, playlistGroupKey)
        })
        entries.push({
          downloadId: result.id,
          entryId: entry.id,
          title: entry.title,
          url: entry.url,
          index: entry.index
        })
      } catch (err) {
        logger.error('download-facade: failed to enqueue playlist entry', { entry, err })
      }
    }

    return {
      groupId,
      playlistId: playlist.id,
      playlistTitle: playlist.title,
      type: options.type,
      totalCount: selected.length,
      startIndex: selected[0]?.index ?? 0,
      endIndex: selected.at(-1)?.index ?? 0,
      entries
    }
  }

  async startInstagramProfileDownload(
    input: InstagramProfileDownloadInput
  ): Promise<InstagramProfileDownloadResult> {
    this.subscribeOnce()
    await startDesktopTaskQueue()
    const settings = toSharedSettings(settingsManager.getAll())
    return enqueueInstagramProfileDownload({
      queue: this.queue,
      inspector: getDesktopInstagramProfileInspector(),
      input: {
        ...input,
        settings
      },
      defaultDownloadDir: resolveDesktopDownloadDir()
    })
  }

  // ───────────── Read-only ─────────────

  getQueueStatus(): { active: number; pending: number } {
    const stats = this.queue.stats()
    return { active: stats.running, pending: stats.queued }
  }

  getActiveDownloads(): DownloadItem[] {
    const active: DownloadItem[] = []
    let cursor: string | null = null
    do {
      const page = this.queue.list({ limit: 200, cursor })
      for (const t of page.tasks) {
        if (NON_TERMINAL.has(t.status) && isDownloadTaskKind(t.kind)) {
          active.push(projectTaskForRenderer(t))
        }
      }
      cursor = page.nextCursor
    } while (cursor)
    return active.sort((a, b) => b.createdAt - a.createdAt)
  }

  // ───────────── Lifecycle (no-ops; the kernel handles persistence + recovery) ─────────────

  restoreActiveDownloads(): void {
    // TaskQueueAPI.start() already replays in-flight tasks into paused('crash-recovery');
    // explicit restore is unnecessary now.
    this.subscribeOnce()
  }

  flushDownloadSession(): void {
    // SqlitePersistAdapter writes synchronously on transition; nothing to flush.
  }

  /**
   * Refresh scheduler caps after a download-concurrency setting change.
   *
   * @param max Requested download cap; ignored when not a positive number.
   */
  updateMaxConcurrent(max: number): void {
    if (typeof max !== 'number' || max <= 0) {
      return
    }
    applyDesktopQueueConcurrency()
  }

  /**
   * Best-effort: legacy `updateDownloadInfo` was used to stamp
   * `glitchTipEventId` on a task. The kernel doesn't expose a way to patch
   * `task.input.options` after add, so we drop the call with a debug log.
   * Sentry breadcrumbs still record the event; only the per-task
   * decoration is missing.
   */
  updateDownloadInfo(id: string, updates: Partial<DownloadItem>): void {
    if (Object.keys(updates).length === 0) {
      return
    }
    logger.debug('download-facade: updateDownloadInfo dropped', { id, updates })
  }
}

const sanitizePathSegment = (value: string): string =>
  value
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'Playlist'

export const downloadEngine = new DownloadFacade()
