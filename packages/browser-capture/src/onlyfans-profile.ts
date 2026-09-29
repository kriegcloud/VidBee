import { createHash } from 'node:crypto'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync
} from 'node:fs'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { setTimeout as delay } from 'node:timers/promises'
import {
  isOnlyFansSite,
  type OnlyFansCommand,
  OnlyFansCommandSchema,
  type OnlyFansDownload,
  OnlyFansDownloadSchema,
  type OnlyFansItem,
  type OnlyFansProfile,
  OnlyFansProfileSchema,
  onlyFansProfile
} from '@vidbee/downloader-core/onlyfans-profile'
import {
  type Executor,
  type ExecutorContext,
  type ExecutorEvents,
  type ExecutorRun,
  PRIORITY_USER,
  type TaskOutput,
  type TaskQueueAPI,
  virtualError
} from '@vidbee/task-queue'
import type { BrowserContext, Page, Response } from 'playwright-core'
import { resolveBrowserExecutable } from './availability'

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
const id = (value: unknown): string | null =>
  (typeof value === 'string' || typeof value === 'number') && /^\d+$/.test(String(value))
    ? String(value)
    : null

/** Only signed media URLs from the site's CDN are eligible; never send account cookies. */
export function onlyFansMediaUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  try {
    const url = new URL(value)
    return url.protocol === 'https:' &&
      /^cdn\d*\.onlyfans\.com$/.test(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname.startsWith('/files/')
      ? url.href
      : null
  } catch {
    return null
  }
}

/** Extract references only. Signed CDN URLs live in memory and are not saved in profiles. */
export function onlyFansItems(payload: unknown): { item: OnlyFansItem; mediaUrl: string | null }[] {
  const body = record(payload)
  const posts = Array.isArray(body.list) ? body.list : [body]
  const output: { item: OnlyFansItem; mediaUrl: string | null }[] = []
  for (const value of posts) {
    const post = record(value)
    const postId = id(post.id)
    if (!(postId && Array.isArray(post.media))) {
      continue
    }
    for (const raw of post.media) {
      const media = record(raw)
      const mediaId = id(media.id)
      if (!(mediaId && ['photo', 'video'].includes(String(media.type)))) {
        continue
      }
      const files = record(media.files)
      const full = record(files.full)
      const sources = record(media.videoSources)
      const candidate = Object.entries(sources)
        .sort(([a], [b]) => Number(b) - Number(a))
        .map(([, url]) => onlyFansMediaUrl(url))
        .find(Boolean)
      const mediaUrl = onlyFansMediaUrl(full.url) ?? candidate ?? null
      const drm = Object.keys(record(files.drm)).length > 0
      output.push({
        item: {
          id: mediaId,
          postId,
          category: media.type === 'photo' ? 'photos' : 'videos',
          state:
            media.canView === false || post.canViewMedia === false
              ? 'locked'
              : mediaUrl
                ? 'available'
                : drm
                  ? 'drm'
                  : 'locked',
          downloaded: false
        },
        mediaUrl: media.canView === false || post.canViewMedia === false ? null : mediaUrl
      })
    }
  }
  return output
}

async function* readBody(body: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = body.getReader()
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) {
        return
      }
      yield chunk.value
    }
  } finally {
    reader.releaseLock()
  }
}

export class OnlyFansProfiles {
  private context: BrowserContext | null = null
  private opening: Promise<BrowserContext> | null = null
  private page: Page | null = null
  private active: { username: string; controller: AbortController; done: Promise<void> } | null =
    null
  private downloading = false
  private readonly profiles = new Map<string, OnlyFansProfile>()
  private readonly media = new Map<string, string>()

  private readonly storageDir: string
  private readonly defaultDownloadDir: () => string

  constructor(storageDir: string, defaultDownloadDir: () => string) {
    this.storageDir = storageDir
    this.defaultDownloadDir = defaultDownloadDir
  }

  private key(username: string, mediaId: string): string {
    return `${username}/${mediaId}`
  }

  private save(profile: OnlyFansProfile): void {
    mkdirSync(this.storageDir, { recursive: true, mode: 0o700 })
    profile.updatedAt = Date.now()
    const target = path.join(this.storageDir, `${profile.username}.json`)
    writeFileSync(`${target}.tmp`, JSON.stringify(profile), { mode: 0o600 })
    renameSync(`${target}.tmp`, target)
  }

  get(url: string): OnlyFansProfile {
    const normalized = onlyFansProfile(url)
    if (!normalized) {
      throw new Error('Enter an OnlyFans profile URL.')
    }
    let profile = this.profiles.get(normalized.username)
    if (!profile) {
      const filename = path.join(this.storageDir, `${normalized.username}.json`)
      if (existsSync(filename)) {
        profile = OnlyFansProfileSchema.parse(JSON.parse(readFileSync(filename, 'utf8')))
        if (
          profile.username !== normalized.username ||
          profile.profileUrl !== normalized.profileUrl
        ) {
          throw new Error('Saved profile identity does not match.')
        }
        if (profile.state === 'mapping') {
          profile.state = 'partial'
        }
      } else {
        profile = { ...normalized, state: 'idle', updatedAt: Date.now(), pages: 0, items: [] }
      }
      this.profiles.set(normalized.username, profile)
    }
    return structuredClone(profile)
  }

  list(): OnlyFansProfile[] {
    if (!existsSync(this.storageDir)) {
      return []
    }
    return readdirSync(this.storageDir)
      .filter((name) => /^[a-z0-9._-]+\.json$/.test(name))
      .flatMap((name) => {
        try {
          return [this.get(`https://onlyfans.com/${name.slice(0, -5)}`)]
        } catch {
          return []
        }
      })
  }

  private async browser(): Promise<BrowserContext> {
    if (this.context) {
      return this.context
    }
    if (!this.opening) {
      this.opening = (async () => {
        const executablePath = resolveBrowserExecutable('chrome')
        if (!executablePath) {
          throw new Error(
            'Install Chrome or Chromium on the VidBee host to open its OnlyFans session.'
          )
        }
        const { chromium } = await import('playwright-core')
        const directory = path.join(this.storageDir, 'browser-session')
        mkdirSync(directory, { recursive: true, mode: 0o700 })
        const context = await chromium.launchPersistentContext(directory, {
          executablePath,
          headless: false,
          viewport: null,
          ignoreDefaultArgs: ['--enable-automation'],
          args: ['--no-first-run']
        })
        this.context = context
        context.on('close', () => {
          this.context = null
          this.page = null
        })
        return context
      })().finally(() => {
        this.opening = null
      })
    }
    return this.opening
  }

  private async browserPage(): Promise<Page> {
    const context = await this.browser()
    if (!this.page || this.page.isClosed()) {
      this.page = context.pages()[0] ?? (await context.newPage())
    }
    return this.page
  }

  async command(raw: OnlyFansCommand): Promise<OnlyFansProfile> {
    const input = OnlyFansCommandSchema.parse(raw)
    const snapshot = this.get(input.url)
    const profile = this.profiles.get(snapshot.username)
    if (!profile) {
      throw new Error('Saved profile is unavailable.')
    }
    if (input.action === 'get') {
      return snapshot
    }
    if (input.action === 'stop') {
      if (this.active?.username === profile.username) {
        this.active.controller.abort()
        await this.active.done
      }
      return this.get(input.url)
    }
    if (this.active || this.downloading) {
      throw new Error('Another OnlyFans operation is running. Stop it or wait for it to finish.')
    }
    if (input.action === 'open') {
      const page = await this.browserPage()
      await page.goto(profile.profileUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 })
      await page.bringToFront()
      this.save(profile)
      return this.get(input.url)
    }
    const controller = new AbortController()
    profile.state = 'mapping'
    profile.category = input.category
    profile.pages = 0
    profile.error = undefined
    this.save(profile)
    const done = this.map(profile, input.category, controller.signal).finally(() => {
      this.active = null
    })
    this.active = { username: profile.username, controller, done }
    return this.get(input.url)
  }

  private collect(profile: OnlyFansProfile, payload: unknown): void {
    const items = new Map(profile.items.map((item) => [item.id, item]))
    for (const { item, mediaUrl } of onlyFansItems(payload)) {
      const previous = items.get(item.id)
      items.set(item.id, { ...item, downloaded: previous?.downloaded ?? false })
      if (mediaUrl) {
        this.media.set(this.key(profile.username, item.id), mediaUrl)
      }
    }
    profile.items = [...items.values()]
    this.save(profile)
  }

  private async map(
    profile: OnlyFansProfile,
    category: 'photos' | 'videos',
    signal: AbortSignal
  ): Promise<void> {
    let page: Page | null = null
    let finished = false
    let lastResponse = Date.now()
    let ownerId: string | null = null
    const abort = (): void => {
      void page?.close().catch(() => undefined)
    }
    signal.addEventListener('abort', abort, { once: true })
    const pending = new Set<Promise<void>>()
    const handle = async (response: Response): Promise<void> => {
      const url = new URL(response.url())
      if (url.origin !== 'https://onlyfans.com') {
        return
      }
      if (url.pathname === `/api2/v2/users/${profile.username}` && response.ok()) {
        ownerId = id(record(await response.json()).id)
        return
      }
      if (!(ownerId && url.pathname.startsWith(`/api2/v2/users/${ownerId}/posts`))) {
        return
      }
      if (!response.ok()) {
        profile.state = [401, 403].includes(response.status()) ? 'auth-required' : 'error'
        profile.error =
          response.status() === 429
            ? 'OnlyFans asked to slow down. Stop and retry later.'
            : 'OnlyFans could not load this page. Check the dedicated browser.'
        finished = true
        return
      }
      const payload: unknown = await response.json()
      if (record(payload).error) {
        profile.state = 'auth-required'
        finished = true
        return
      }
      this.collect(profile, payload)
      profile.pages += 1
      lastResponse = Date.now()
      finished = record(payload).hasMore === false
    }
    const listener = (response: Response): void => {
      const work = handle(response)
        .catch(() => {
          profile.state = 'error'
          profile.error = 'Could not read the profile response. The saved map has been retained.'
          finished = true
        })
        .finally(() => pending.delete(work))
      pending.add(work)
    }
    try {
      page = await this.browserPage()
      const cookies = await page.context().cookies('https://onlyfans.com')
      if (
        !(
          cookies.some((cookie) => cookie.name === 'sess') &&
          cookies.some((cookie) => cookie.name === 'auth_id')
        )
      ) {
        profile.state = 'auth-required'
        return
      }
      page.on('response', listener)
      await page.goto(`${profile.profileUrl}/${category}`, {
        waitUntil: 'domcontentloaded',
        timeout: 45_000
      })
      const deadline = Date.now() + 10 * 60 * 1000
      while (!finished && Date.now() < deadline && Date.now() - lastResponse < 20_000) {
        signal.throwIfAborted()
        if (onlyFansProfile(page.url())?.username !== profile.username) {
          throw new Error('The browser left the mapped profile.')
        }
        await page.evaluate(() => window.scrollBy(0, Math.max(600, window.innerHeight * 0.8)))
        await delay(1500, undefined, { signal })
      }
      if (profile.state === 'mapping') {
        profile.state = finished ? 'complete' : 'partial'
      }
    } catch {
      if (profile.state === 'mapping') {
        profile.state = signal.aborted ? 'partial' : 'error'
        profile.error = signal.aborted
          ? undefined
          : 'The browser could not finish mapping. Reopen it and retry; saved items are retained.'
      }
    } finally {
      signal.removeEventListener('abort', abort)
      page?.off('response', listener)
      await Promise.allSettled(pending)
      if (signal.aborted && profile.state === 'mapping') {
        profile.state = 'partial'
      }
      this.save(profile)
    }
  }

  async enqueue(queue: TaskQueueAPI, raw: OnlyFansDownload): Promise<{ count: number }> {
    if (this.active) {
      throw new Error('Finish or stop OnlyFans mapping before downloading.')
    }
    const input = OnlyFansDownloadSchema.parse(raw)
    const profile = this.get(input.url)
    const wanted = new Set(input.itemIds)
    const selected = profile.items.filter(
      (item) => wanted.has(item.id) && item.state === 'available'
    )
    if (selected.length !== wanted.size) {
      throw new Error('Select available mapped media. Locked and DRM media cannot be downloaded.')
    }
    await queue.setMaxPerGroup('onlyfans-browser', 1)
    let count = 0
    for (const item of selected) {
      const directory = path.resolve(input.customDownloadPath || this.defaultDownloadDir())
      const taskId = `onlyfans_${profile.username}_${item.id}_${createHash('sha256').update(directory).digest('hex').slice(0, 16)}`
      const existing = queue.get(taskId)
      if (existing && !['failed', 'cancelled'].includes(existing.status)) {
        continue
      }
      if (existing) {
        await queue.retryManual(taskId)
      } else {
        await queue.add({
          id: taskId,
          priority: PRIORITY_USER,
          groupKey: 'onlyfans-browser',
          input: {
            kind: item.category === 'videos' ? 'video' : 'social-media',
            url: `https://onlyfans.com/${item.postId}/${profile.username}`,
            title: `@${profile.username} · ${item.category} · ${item.id}`,
            options: {
              onlyFansProfile: profile.profileUrl,
              onlyFansMediaId: item.id,
              customDownloadPath: directory
            }
          }
        })
      }
      count += 1
    }
    return { count }
  }

  async download(
    profileUrl: string,
    mediaId: string,
    destination: string,
    signal: AbortSignal,
    progress: (bytes: number, total: number) => void
  ): Promise<{ filePath: string; size: number }> {
    if (this.active || this.downloading) {
      throw new Error('Finish or stop OnlyFans mapping before downloading.')
    }
    const snapshot = this.get(profileUrl)
    const profile = this.profiles.get(snapshot.username)
    if (!profile) {
      throw new Error('Saved profile is unavailable.')
    }
    const item = profile.items.find((entry) => entry.id === mediaId && entry.state === 'available')
    if (!item) {
      throw new Error('Map this available media before downloading.')
    }
    this.downloading = true
    try {
      signal.throwIfAborted()
      const page = await this.browserPage()
      // Refresh expiring CDN URLs through a normal site navigation in the same session.
      const responsePromise = page.waitForResponse(
        (response) => {
          const url = new URL(response.url())
          return (
            url.origin === 'https://onlyfans.com' &&
            url.pathname === `/api2/v2/posts/${item.postId}`
          )
        },
        { timeout: 30_000 }
      )
      // Register a rejection handler before navigation can fail.
      const responseResult = responsePromise.then(
        (response) => ({ response }),
        () => ({ response: null })
      )
      await page.goto(`https://onlyfans.com/${item.postId}/${profile.username}`, {
        waitUntil: 'domcontentloaded',
        timeout: 45_000
      })
      const { response } = await responseResult
      if (!response?.ok()) {
        throw new Error('Open the dedicated browser and check your login and access to this post.')
      }
      this.media.delete(this.key(profile.username, mediaId))
      this.collect(profile, await response.json())
      const mediaUrl = this.media.get(this.key(profile.username, mediaId))
      if (!mediaUrl) {
        throw new Error('This media is locked or has no downloadable original.')
      }
      signal.throwIfAborted()
      const extension = path.extname(new URL(mediaUrl).pathname).toLowerCase()
      if (!/^\.(?:jpe?g|png|webp|gif|mp4|mov|m4v)$/.test(extension)) {
        throw new Error('Unsupported original media format.')
      }
      const folder = path.join(destination, 'OnlyFans', profile.username, item.category)
      mkdirSync(folder, { recursive: true })
      const target = path.join(folder, `${item.postId}_${item.id}${extension}`)
      const responseMedia = await fetch(mediaUrl, {
        headers: { Referer: 'https://onlyfans.com/' },
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(30 * 60 * 1000)])
      })
      if (!(responseMedia.ok && responseMedia.body)) {
        throw new Error(
          `OnlyFans media download failed (HTTP ${responseMedia.status}). Remap and retry.`
        )
      }
      const contentType = responseMedia.headers.get('content-type') ?? ''
      if (!/^(?:image\/|video\/|application\/octet-stream)/i.test(contentType)) {
        throw new Error('The server returned a page instead of a media file.')
      }
      let bytes = 0
      const total = Number(responseMedia.headers.get('content-length')) || 0
      const meter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          bytes += chunk.length
          progress(bytes, total)
          callback(null, chunk)
        }
      })
      await pipeline(
        Readable.from(readBody(responseMedia.body)),
        meter,
        createWriteStream(`${target}.part`),
        { signal }
      )
      if (!bytes || (total && bytes !== total)) {
        throw new Error('The downloaded file is incomplete.')
      }
      renameSync(`${target}.part`, target)
      const saved = profile.items.find((entry) => entry.id === mediaId)
      if (saved) {
        saved.downloaded = true
      }
      this.save(profile)
      return { filePath: target, size: statSync(target).size }
    } finally {
      this.downloading = false
    }
  }

  async stop(): Promise<void> {
    this.active?.controller.abort()
    await this.active?.done
    await this.context?.close()
  }
}

/** Route OnlyFans ahead of yt-dlp, including old queued URLs, so Chrome cookies never leave Chrome. */
export class OnlyFansBrowserExecutor implements Executor {
  private readonly profiles: OnlyFansProfiles
  private readonly fallback: Executor
  private readonly defaultDirectory: () => string

  constructor(profiles: OnlyFansProfiles, fallback: Executor, defaultDirectory: () => string) {
    this.profiles = profiles
    this.fallback = fallback
    this.defaultDirectory = defaultDirectory
  }

  run(ctx: ExecutorContext, events: ExecutorEvents): ExecutorRun {
    if (!isOnlyFansSite(ctx.input.url)) {
      return this.fallback.run(ctx, events)
    }
    const controller = new AbortController()
    const done = (async () => {
      await Promise.resolve()
      events.onSpawn({
        taskId: ctx.taskId,
        attemptId: ctx.attemptId,
        pid: process.pid,
        pidStartedAt: Date.now(),
        kind: 'ai-worker',
        spawnedAt: Date.now()
      })
      try {
        const options = ctx.input.options
        if (
          typeof options?.onlyFansProfile !== 'string' ||
          typeof options.onlyFansMediaId !== 'string'
        ) {
          throw new Error(
            'Open this OnlyFans profile in VidBee and map it using the dedicated browser session.'
          )
        }
        const output = await this.profiles.download(
          options.onlyFansProfile,
          options.onlyFansMediaId,
          typeof options.customDownloadPath === 'string'
            ? options.customDownloadPath
            : this.defaultDirectory(),
          controller.signal,
          (bytes, total) =>
            events.onProgress({
              taskId: ctx.taskId,
              attemptId: ctx.attemptId,
              enteredProcessing: false,
              progress: {
                percent: total ? bytes / total : null,
                bytesDownloaded: bytes,
                bytesTotal: total || null,
                speedBps: null,
                etaMs: null,
                ticks: Date.now()
              }
            })
        )
        const completed: TaskOutput = { ...output, durationMs: null, sha256: null }
        if (ctx.input.kind === 'social-media') {
          const manifestPath = `${output.filePath}.manifest.json`
          const summary = {
            posts: 1,
            images: 1,
            videos: 0,
            downloaded: 1,
            existing: 0,
            failed: 0,
            totalSize: output.size,
            reason: 'exhausted' as const,
            manifestPath,
            startedAt: Date.now(),
            finishedAt: Date.now()
          }
          writeFileSync(manifestPath, JSON.stringify({ files: [output.filePath], ...summary }), {
            mode: 0o600
          })
          completed.outputDirectory = path.dirname(output.filePath)
          completed.fileCount = 1
          completed.collectionSummary = summary
        }
        events.onFinish({
          taskId: ctx.taskId,
          attemptId: ctx.attemptId,
          closedAt: Date.now(),
          stdoutTail: '',
          stderrTail: '',
          result: { type: 'success', output: completed }
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'OnlyFans download failed.'
        events.onFinish({
          taskId: ctx.taskId,
          attemptId: ctx.attemptId,
          closedAt: Date.now(),
          stdoutTail: '',
          stderrTail: '',
          result: controller.signal.aborted
            ? { type: 'cancelled' }
            : { type: 'error', error: virtualError('auth-required', message), exitCode: null }
        })
      }
    })()
    const cancel = async (): Promise<void> => {
      controller.abort()
      await done
    }
    return { cancel, pause: cancel }
  }
}
