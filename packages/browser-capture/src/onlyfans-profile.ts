import { type ChildProcess, spawn } from 'node:child_process'
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

/** Match only the selected conversation, never the chat list or another conversation. */
export function onlyFansChatResponse(url: URL, chatId: string): boolean {
  return (
    url.origin === 'https://onlyfans.com' && url.pathname === `/api2/v2/chats/${chatId}/messages`
  )
}

function onlyFansMessageUrl(item: OnlyFansItem, profile: OnlyFansProfile): string | null {
  return profile.chatId ? `${profile.profileUrl}?firstId=${item.postId}` : null
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

export interface BrowserProfileAdapter {
  name: string
  key: string
  origin: string
  normalize: typeof onlyFansProfile
  isSite: typeof isOnlyFansSite
  items: typeof onlyFansItems
  ownerResponse: (url: URL, username: string) => boolean
  ownerId: (payload: unknown, username: string) => string | null
  feedResponse: (url: URL, ownerId: string) => boolean
  complete: (payload: unknown) => boolean
  postUrl: (item: OnlyFansItem, profile: OnlyFansProfile) => string
  postResponse: (url: URL, item: OnlyFansItem) => boolean
  requiresCookies: boolean
}

const onlyFansAdapter: BrowserProfileAdapter = {
  name: 'OnlyFans',
  key: 'onlyfans',
  origin: 'https://onlyfans.com',
  normalize: onlyFansProfile,
  isSite: isOnlyFansSite,
  items: onlyFansItems,
  ownerResponse: (url, username) =>
    url.origin === 'https://onlyfans.com' && url.pathname === `/api2/v2/users/${username}`,
  ownerId: (payload) => id(record(payload).id),
  feedResponse: (url, ownerId) =>
    url.origin === 'https://onlyfans.com' &&
    url.pathname.startsWith(`/api2/v2/users/${ownerId}/posts`),
  complete: (payload) => record(payload).hasMore === false,
  postUrl: (item, profile) => `https://onlyfans.com/${item.postId}/${profile.username}`,
  postResponse: (url, item) =>
    url.origin === 'https://onlyfans.com' && url.pathname === `/api2/v2/posts/${item.postId}`,
  requiresCookies: true
}

export class OnlyFansProfiles {
  private loginBrowser: ChildProcess | null = null
  private context: BrowserContext | null = null
  private opening: Promise<BrowserContext> | null = null
  private page: Page | null = null
  private active: { username: string; controller: AbortController; done: Promise<void> } | null =
    null
  private downloading = false
  private readonly profiles = new Map<string, OnlyFansProfile>()
  private readonly media = new Map<string, string>()

  readonly adapter: BrowserProfileAdapter
  private readonly storageDir: string
  private readonly defaultDownloadDir: () => string

  constructor(
    storageDir: string,
    defaultDownloadDir: () => string,
    adapter: BrowserProfileAdapter = onlyFansAdapter
  ) {
    this.adapter = adapter
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
    const normalized = this.adapter.normalize(url)
    if (!normalized) {
      throw new Error(`Enter a ${this.adapter.name} profile URL.`)
    }
    let profile = this.profiles.get(normalized.username)
    if (!profile) {
      const filename = path.join(this.storageDir, `${normalized.username}.json`)
      if (existsSync(filename)) {
        profile = OnlyFansProfileSchema.parse(JSON.parse(readFileSync(filename, 'utf8')))
        if (
          profile.username !== normalized.username ||
          profile.profileUrl !== normalized.profileUrl ||
          profile.chatId !== normalized.chatId
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
          const saved: unknown = JSON.parse(readFileSync(path.join(this.storageDir, name), 'utf8'))
          const profile = OnlyFansProfileSchema.parse(saved)
          return [this.get(profile.profileUrl)]
        } catch {
          return []
        }
      })
  }

  private async browser(): Promise<BrowserContext> {
    if (this.context) {
      return this.context
    }
    if (
      this.loginBrowser &&
      this.loginBrowser.exitCode === null &&
      this.loginBrowser.signalCode === null
    ) {
      throw new Error('Close the dedicated login window after signing in, then map the profile.')
    }
    if (!this.opening) {
      this.opening = (async () => {
        const executablePath = resolveBrowserExecutable('chrome')
        if (!executablePath) {
          throw new Error(
            `Install Chrome or Chromium on the VidBee host to open its ${this.adapter.name} session.`
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
      throw new Error(
        `Another ${this.adapter.name} operation is running. Stop it or wait for it to finish.`
      )
    }
    if (input.action === 'open' && this.adapter.key === 'fansly') {
      if (this.context) {
        await this.context.close()
      }
      const executable = resolveBrowserExecutable('chrome')
      if (!executable) {
        throw new Error('Install Chrome or Chromium to sign in.')
      }
      const directory = path.join(this.storageDir, 'browser-session')
      mkdirSync(directory, { recursive: true, mode: 0o700 })
      if (
        !(
          this.loginBrowser &&
          this.loginBrowser.exitCode === null &&
          this.loginBrowser.signalCode === null
        )
      ) {
        const child = spawn(
          executable,
          [`--user-data-dir=${directory}`, '--no-first-run', profile.profileUrl],
          { stdio: 'ignore' }
        )
        this.loginBrowser = child
        await new Promise<void>((resolve, reject) => {
          child.once('spawn', resolve)
          child.once('error', reject)
        })
      }
      this.save(profile)
      return this.get(input.url)
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
    for (const { item, mediaUrl } of this.adapter.items(payload)) {
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
    category: 'media' | 'photos' | 'videos' | 'posts',
    signal: AbortSignal
  ): Promise<void> {
    let page: Page | null = null
    let finished = false
    let lastResponse = Date.now()
    let ownerId: string | null = profile.chatId ?? null
    let closing: Promise<void> | undefined
    const abort = (): void => {
      closing = page
        ?.context()
        .close()
        .catch(() => undefined)
        .finally(() => {
          this.context = null
          this.page = null
        })
    }
    signal.addEventListener('abort', abort, { once: true })
    const pending = new Set<Promise<void>>()
    const handle = async (response: Response): Promise<void> => {
      const url = new URL(response.url())
      if (!profile.chatId && this.adapter.ownerResponse(url, profile.username) && !response.ok()) {
        profile.state = [401, 403].includes(response.status()) ? 'auth-required' : 'error'
        finished = true
        return
      }
      if (!profile.chatId && this.adapter.ownerResponse(url, profile.username) && response.ok()) {
        ownerId = this.adapter.ownerId(await response.json(), profile.username)
        return
      }
      const isFeed = profile.chatId
        ? onlyFansChatResponse(url, profile.chatId)
        : Boolean(ownerId && this.adapter.feedResponse(url, ownerId))
      if (!isFeed) {
        return
      }
      if (!response.ok()) {
        profile.state = [401, 403].includes(response.status()) ? 'auth-required' : 'error'
        profile.error =
          response.status() === 429
            ? `${this.adapter.name} asked to slow down. Stop and retry later.`
            : `${this.adapter.name} could not load this page. Check the dedicated browser.`
        finished = true
        return
      }
      const payload: unknown = await response.json()
      if (record(payload).error || record(payload).success === false) {
        profile.state = 'auth-required'
        finished = true
        return
      }
      this.collect(profile, payload)
      profile.pages += 1
      lastResponse = Date.now()
      finished = this.adapter.complete(payload)
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
      const cookies = this.adapter.requiresCookies
        ? await page.context().cookies(this.adapter.origin)
        : []
      if (
        this.adapter.requiresCookies &&
        !(
          cookies.some((cookie) => cookie.name === 'sess') &&
          cookies.some((cookie) => cookie.name === 'auth_id')
        )
      ) {
        profile.state = 'auth-required'
        return
      }
      page.on('response', listener)
      await page.goto(profile.chatId ? profile.profileUrl : `${profile.profileUrl}/${category}`, {
        waitUntil: 'domcontentloaded',
        timeout: 45_000
      })
      const deadline = Date.now() + 10 * 60 * 1000
      while (!finished && Date.now() < deadline && Date.now() - lastResponse < 20_000) {
        signal.throwIfAborted()
        if (this.adapter.normalize(page.url())?.username !== profile.username) {
          throw new Error('The browser left the mapped profile.')
        }
        await page.evaluate(
          ({ nested, chat }) => {
            const step = Math.max(600, window.innerHeight * 0.8) * (chat ? -1 : 1)
            if (!nested) {
              window.scrollBy(0, step)
              return
            }
            const candidates = [...document.querySelectorAll<HTMLElement>('main, section, div')]
              .filter((element) => {
                const bounds = element.getBoundingClientRect()
                return (
                  bounds.width > 300 &&
                  bounds.height > 200 &&
                  bounds.bottom > 0 &&
                  bounds.top < window.innerHeight &&
                  element.scrollHeight > element.clientHeight + 10 &&
                  /auto|scroll/.test(getComputedStyle(element).overflowY)
                )
              })
              .sort((a, b) => b.scrollHeight - b.clientHeight - (a.scrollHeight - a.clientHeight))
            if (candidates[0]) {
              candidates[0].scrollBy(0, step)
            } else {
              window.scrollBy(0, step)
            }
          },
          {
            nested: this.adapter.key === 'fansly' || Boolean(profile.chatId),
            chat: Boolean(profile.chatId)
          }
        )
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
          : this.loginBrowser &&
              this.loginBrowser.exitCode === null &&
              this.loginBrowser.signalCode === null
            ? 'Close the dedicated login window after signing in, then map the profile.'
            : 'The browser could not finish mapping. Reopen it and retry; saved items are retained.'
      }
    } finally {
      signal.removeEventListener('abort', abort)
      page?.off('response', listener)
      await Promise.allSettled(pending)
      await closing
      if (signal.aborted && profile.state === 'mapping') {
        profile.state = 'partial'
      }
      this.save(profile)
    }
  }

  async enqueue(queue: TaskQueueAPI, raw: OnlyFansDownload): Promise<{ count: number }> {
    if (this.active) {
      throw new Error(`Finish or stop ${this.adapter.name} mapping before downloading.`)
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
    await queue.setMaxPerGroup(`${this.adapter.key}-browser`, 1)
    let count = 0
    for (const item of selected) {
      const directory = path.resolve(input.customDownloadPath || this.defaultDownloadDir())
      const taskId = `${this.adapter.key}_${profile.username}_${item.id}_${createHash('sha256').update(directory).digest('hex').slice(0, 16)}`
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
          groupKey: `${this.adapter.key}-browser`,
          input: {
            kind: item.category === 'videos' ? 'video' : 'social-media',
            url:
              this.adapter.key === 'fansly'
                ? `${profile.profileUrl}/posts`
                : (onlyFansMessageUrl(item, profile) ?? this.adapter.postUrl(item, profile)),
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
      throw new Error(`Finish or stop ${this.adapter.name} mapping before downloading.`)
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
        async (response) => {
          const url = new URL(response.url())
          const matches = profile.chatId
            ? onlyFansChatResponse(url, profile.chatId) ||
              (url.origin === this.adapter.origin &&
                url.pathname === `/api2/v2/chats/${profile.chatId}/messages/${item.postId}`)
            : this.adapter.postResponse(url, item)
          if (!(matches && profile.chatId && response.ok())) {
            return matches
          }
          // A chat can load several message batches; wait for the requested attachment.
          return this.adapter
            .items(await response.json())
            .some(({ item: candidate }) => candidate.id === mediaId)
        },
        { timeout: 30_000 }
      )
      // Register a rejection handler before navigation can fail.
      const responseResult = responsePromise.then(
        (response) => ({ response }),
        () => ({ response: null })
      )
      await page.goto(onlyFansMessageUrl(item, profile) ?? this.adapter.postUrl(item, profile), {
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
      const folder = path.join(destination, this.adapter.name, profile.username, item.category)
      mkdirSync(folder, { recursive: true })
      const target = path.join(folder, `${item.postId}_${item.id}${extension}`)
      const responseMedia = await fetch(mediaUrl, {
        headers: { Referer: `${this.adapter.origin}/` },
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(30 * 60 * 1000)])
      })
      if (!(responseMedia.ok && responseMedia.body)) {
        throw new Error(
          `${this.adapter.name} media download failed (HTTP ${responseMedia.status}). Remap and retry.`
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
    if (!this.profiles.adapter.isSite(ctx.input.url)) {
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
            `Open this ${this.profiles.adapter.name} profile in VidBee and map it using the dedicated browser session.`
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
        const message =
          error instanceof Error ? error.message : `${this.profiles.adapter.name} download failed.`
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
