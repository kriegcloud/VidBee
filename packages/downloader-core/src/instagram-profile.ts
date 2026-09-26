import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PRIORITY_USER, type TaskQueueAPI } from '@vidbee/task-queue'
import { killProcessTree } from '@vidbee/task-queue/process'
import type { SourceAdmission } from '@vidbee/task-queue/source-admission'
import { InstagramProfileInspectionSchema } from './schemas'
import type {
  DownloadRuntimeSettings,
  InstagramCategorySummary,
  InstagramInspectionErrorCode,
  InstagramProfileCategory,
  InstagramProfileDownloadInput,
  InstagramProfileDownloadResult,
  InstagramProfileInspection,
  InstagramProfileItem
} from './types'
import { normalizeBrowserCookiesSettingForYtDlp } from './yt-dlp-args'

const DEFAULT_MAX_CACHE_ENTRIES = 20
const INSTAGRAM_PROFILE_GROUP_PREFIX = 'instagram_profile_group_'
const INSTAGRAM_PROFILE_GROUP_KEY = 'instagram-profile'
const INSTAGRAM_USERNAME_PATTERN = /^[A-Za-z0-9._]{1,30}$/
const INVALID_PATH_CHARACTERS = new Set('<>:"/\\|?*')
const INSTAGRAM_HOSTS = new Set([
  'instagram.com',
  'www.instagram.com',
  'm.instagram.com',
  'instagr.am',
  'www.instagr.am'
])
const RESERVED_PROFILE_PATHS = new Set([
  'accounts',
  'about',
  'developer',
  'direct',
  'directory',
  'emails',
  'explore',
  'legal',
  'p',
  'press',
  'privacy',
  'reel',
  'reels',
  'share',
  'stories',
  'tv',
  'web'
])

export const INSTAGRAM_PROFILE_CATEGORIES: readonly InstagramProfileCategory[] = [
  'highlights',
  'posts',
  'reels',
  'tagged',
  'stories'
]

const CATEGORY_LABELS: Record<InstagramProfileCategory, string> = {
  posts: 'Posts',
  reels: 'Reels',
  stories: 'Stories',
  highlights: 'Highlights',
  tagged: 'Tagged'
}

const CATEGORY_ORDERS: Record<InstagramProfileCategory, number> = {
  posts: 0,
  reels: 1,
  stories: 2,
  highlights: 3,
  tagged: 4
}
const DOWNLOAD_CATEGORY_ORDERS: Record<InstagramProfileCategory, number> = {
  stories: 0,
  highlights: 1,
  reels: 2,
  posts: 3,
  tagged: 4
}

export const INSTAGRAM_GALLERY_DL_EXTRACTOR_ARGS = [
  '-o',
  'extractor.instagram.api=rest',
  '-o',
  'extractor.instagram.videos=true',
  '-o',
  'extractor.instagram.static-videos=true',
  '-o',
  'extractor.instagram.previews=false',
  '-o',
  'extractor.instagram.audio=false'
] as const

interface InspectionCacheEntry {
  inspection: InstagramProfileInspection
  categoryUrls: Record<InstagramProfileCategory, string>
}

interface GalleryJsonResult {
  cursor?: string
  exitCode: number | null
  cancelled?: boolean
  stderr: string
  directoryMetadata: Record<string, unknown>[]
  sourceIds: Set<string>
  assetCount: number
  parseError: boolean
  items: Map<string, InstagramProfileItem>
}

export interface InstagramProfileInspectorOptions {
  admission?: SourceAdmission
  completedDownloads?: () => { url: string; category: string; assetCount: number }[]
  storageDir?: string
  resolveBinaryPath: () => string
  resolveExtraArgs?: (settings?: DownloadRuntimeSettings) => readonly string[]
  clock?: () => number
  maxCacheEntries?: number
}

export interface EnqueueInstagramProfileOptions {
  queue: TaskQueueAPI
  inspector: InstagramProfileInspector
  input: InstagramProfileDownloadInput
  defaultDownloadDir: string
}

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

const readString = (
  record: Record<string, unknown> | null,
  ...keys: readonly string[]
): string | undefined => {
  if (!record) {
    return undefined
  }
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value)
    }
  }
  return undefined
}

const resolveUserRecord = (
  metadata: Record<string, unknown> | undefined
): Record<string, unknown> | null => {
  if (!metadata) {
    return null
  }
  return asRecord(metadata.user) ?? asRecord(metadata.owner) ?? metadata
}

const resolveSourceId = (metadata: Record<string, unknown>): string | undefined =>
  readString(metadata, 'post_id', 'post_shortcode', 'media_id', 'id', 'pk')

const parseGalleryJsonMessage = (message: unknown, result: GalleryJsonResult): void => {
  if (!Array.isArray(message) || message.length < 2) {
    result.parseError = true
    return
  }

  const messageType = message[0]
  if (messageType === -1) {
    const error = asRecord(message[1])
    result.stderr += `\n${readString(error, 'error') ?? ''}: ${readString(error, 'message') ?? ''}`
    result.parseError = true
    return
  }

  if (messageType === 2) {
    const metadata = asRecord(message[1])
    if (!metadata) {
      return
    }
    const cursor = readString(metadata, 'vidbee_cursor')
    if (cursor) {
      result.cursor = cursor
    }
    if (result.directoryMetadata.length === 0) {
      result.directoryMetadata.push(metadata)
    }
    const sourceId = resolveSourceId(metadata)
    if (sourceId) {
      result.sourceIds.add(sourceId)
    }
    return
  }

  if (messageType === 3) {
    const metadata = asRecord(message[2])
    if (!metadata) {
      return
    }
    result.assetCount += 1
    const sourceUrl = readString(metadata, 'post_url')
    if (sourceUrl) {
      try {
        const parsed = new URL(sourceUrl)
        if (
          (parsed.hostname === 'www.instagram.com' || parsed.hostname === 'instagram.com') &&
          !parsed.username &&
          !parsed.password &&
          !parsed.port &&
          /^\/(?:p\/|reel\/|tv\/|stories\/)/.test(parsed.pathname)
        ) {
          parsed.search = ''
          parsed.hash = ''
          parsed.protocol = 'https:'
          const mediaId = readString(metadata, 'media_id')
          if (metadata.type === 'story' && mediaId && /^\d+$/.test(mediaId)) {
            parsed.pathname = `${parsed.pathname.replace(/\/$/, '')}/${mediaId}/`
          }
          const itemUrl = parsed.toString()
          const existing = result.items.get(itemUrl)
          result.items.set(itemUrl, {
            id: itemUrl,
            url: itemUrl,
            assetCount: (existing?.assetCount ?? 0) + 1,
            assetIds: [...(existing?.assetIds ?? []), ...(mediaId ? [mediaId] : [])],
            sourceVersion: readString(metadata, 'vidbee_source_version'),
            title: readString(metadata, 'highlight_title', 'description')?.slice(0, 160)
          })
        }
      } catch {
        /* Invalid source references are not persisted. */
      }
    }
    const sourceId = resolveSourceId(metadata)
    if (sourceId) {
      result.sourceIds.add(sourceId)
    }
  }
}

const runGalleryJson = (
  binaryPath: string,
  url: string,
  extraArgs: readonly string[],
  sleepBeforeExtraction: boolean,
  signal?: AbortSignal,
  onCheckpoint?: (result: GalleryJsonResult) => void
): Promise<GalleryJsonResult> =>
  new Promise((resolve, reject) => {
    const args = [
      '-J',
      '-o',
      'output.jsonl=false',
      '-o',
      'extractor.instagram.vidbee-inspection=true',
      '--no-input',
      '--no-colors',
      ...INSTAGRAM_GALLERY_DL_EXTRACTOR_ARGS,
      ...(sleepBeforeExtraction ? ['--sleep-extractor', '6.0-12.0'] : []),
      ...extraArgs,
      url
    ]
    const child = spawn(binaryPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: process.platform !== 'win32'
    })
    const result: GalleryJsonResult = {
      exitCode: null,
      stderr: '',
      directoryMetadata: [],
      sourceIds: new Set<string>(),
      assetCount: 0,
      parseError: false,
      items: new Map()
    }
    // DataJob suppresses exception records in JSONL mode while still exiting 0.
    // Read its complete JSON document, with a hard cap and deadline.
    const chunks: Buffer[] = []
    let stdoutBytes = 0
    const stopInspection = (): void => {
      if (!child.pid) {
        return
      }
      try {
        if (process.platform === 'win32') {
          killProcessTree(child.pid, 'SIGKILL')
        } else {
          process.kill(-child.pid, 'SIGKILL')
        }
      } catch {
        // The process group has already exited.
      }
    }
    const timer = setTimeout(
      () => {
        result.parseError = true
        result.stderr += '\nInstagram inspection timed out.'
        stopInspection()
      },
      10 * 60 * 1000
    )
    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length
      if (stdoutBytes > 64 * 1024 * 1024) {
        result.parseError = true
        result.stderr += '\nInstagram inspection exceeded the response size limit.'
        stopInspection()
        return
      }
      chunks.push(chunk)
    })
    let stderrBuffer = ''
    let checkpointAt = 0
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString()
      let newline = stderrBuffer.indexOf('\n')
      while (newline >= 0) {
        const line = stderrBuffer.slice(0, newline)
        stderrBuffer = stderrBuffer.slice(newline + 1)
        if (line.startsWith('VIDBEE_MAP:')) {
          try {
            parseGalleryJsonMessage(JSON.parse(line.slice('VIDBEE_MAP:'.length)), result)
            if (Date.now() - checkpointAt >= 1000 || line.includes('vidbee_cursor')) {
              checkpointAt = Date.now()
              onCheckpoint?.(result)
            }
          } catch {
            result.parseError = true
          }
        } else {
          result.stderr = `${result.stderr}\n${line}`.slice(-16_384)
        }
        newline = stderrBuffer.indexOf('\n')
      }
      if (stderrBuffer.length > 1024 * 1024) {
        result.parseError = true
        stopInspection()
      }
    })
    const abort = (): void => {
      result.cancelled = true
      stopInspection()
    }
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) {
      abort()
    }
    child.once('error', (error) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      reject(error)
    })
    child.once('close', (exitCode) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      result.stderr = `${result.stderr}\n${stderrBuffer}`.slice(-16_384)
      if (result.cancelled) {
        result.exitCode = exitCode
        resolve(result)
        return
      }
      try {
        const messages: unknown = JSON.parse(Buffer.concat(chunks).toString())
        if (Array.isArray(messages)) {
          result.assetCount = 0
          result.sourceIds.clear()
          result.items.clear()
          result.directoryMetadata = []
          for (const message of messages) {
            parseGalleryJsonMessage(message, result)
          }
        } else {
          result.parseError = true
        }
      } catch {
        result.parseError = true
      }
      result.exitCode = exitCode
      resolve(result)
    })
  })

const inspectionFailureCode = (
  stderr: string,
  binaryMissing = false
): InstagramInspectionErrorCode => {
  if (binaryMissing) {
    return 'binary-missing'
  }
  if (/429|too many requests|rate.?limit/i.test(stderr)) {
    return 'rate-limited'
  }
  if (
    /login required|private profile|cookies|redirect to (?:login|challenge)|authentication/i.test(
      stderr
    )
  ) {
    return 'auth-required'
  }
  if (/404|notfound|not found|does not exist/i.test(stderr)) {
    return 'not-found'
  }
  if (/timeout|connection|econn|network|dns/i.test(stderr)) {
    return 'network'
  }
  return 'unavailable'
}

const toCategorySummary = (
  category: InstagramProfileCategory,
  result: GalleryJsonResult
): InstagramCategorySummary => {
  if (result.exitCode !== 0 || result.parseError) {
    const errorCode = inspectionFailureCode(result.stderr)
    return {
      category,
      state: errorCode === 'auth-required' ? 'auth-required' : 'unavailable',
      sourceCount: result.sourceIds.size,
      assetCount: result.assetCount,
      errorCode
    }
  }
  if (result.assetCount === 0) {
    return {
      category,
      state: 'empty',
      sourceCount: 0,
      assetCount: 0
    }
  }
  return {
    category,
    state: 'ready',
    sourceCount: result.sourceIds.size || result.assetCount,
    assetCount: result.assetCount
  }
}

export const normalizeInstagramProfileUrl = (
  value: string
): { username: string; profileUrl: string } | null => {
  try {
    const parsed = new URL(value)
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.port
    ) {
      return null
    }
    if (!INSTAGRAM_HOSTS.has(parsed.hostname.toLowerCase())) {
      return null
    }
    let segments = parsed.pathname.split('/').filter(Boolean)
    if (segments.length === 2 && segments[0] === 'stories' && segments[1] !== 'highlights') {
      segments = [segments[1]]
    }
    if (
      segments.length === 2 &&
      INSTAGRAM_PROFILE_CATEGORIES.includes(segments[1] as InstagramProfileCategory)
    ) {
      segments = [segments[0]]
    }
    if (segments.length !== 1) {
      return null
    }
    const username = segments[0]
    if (
      !username ||
      RESERVED_PROFILE_PATHS.has(username.toLowerCase()) ||
      !INSTAGRAM_USERNAME_PATTERN.test(username)
    ) {
      return null
    }
    return {
      username: username.toLowerCase(),
      profileUrl: `https://www.instagram.com/${username.toLowerCase()}/`
    }
  } catch {
    return null
  }
}

export const buildInstagramCategoryUrl = (
  username: string,
  category: InstagramProfileCategory
): string => {
  if (category === 'stories') {
    return `https://www.instagram.com/stories/${username}/`
  }
  const extractorPath = category
  return `https://www.instagram.com/${username}/${extractorPath}/`
}

export const buildGalleryDlRuntimeArgs = (
  settings?: DownloadRuntimeSettings
): readonly string[] => {
  const args: string[] = []
  const browser = normalizeBrowserCookiesSettingForYtDlp(settings?.browserForCookies)
  if (browser && browser !== 'none') {
    args.push('--cookies-from-browser', browser)
  }
  const cookiesPath = settings?.cookiesPath?.trim()
  if (cookiesPath) {
    args.push('--cookies', cookiesPath)
  }
  const proxy = settings?.proxy?.trim()
  if (proxy) {
    args.push('--proxy', proxy)
  }
  return args
}

const sanitizePathSegment = (value: string): string => {
  const sanitized = value
    .trim()
    .split('')
    .map((character) => {
      const codePoint = character.charCodeAt(0)
      return codePoint < 32 || INVALID_PATH_CHARACTERS.has(character) ? '_' : character
    })
    .join('')
    .replace(/[.\s]+$/g, '')
  return sanitized || 'instagram-profile'
}

export class InstagramProfileInspector {
  private readonly mapping = new Map<
    AbortController,
    NonNullable<InstagramProfileInspection['mapping']>
  >()
  private readonly controllers = new Map<AbortController, string>()
  private readonly pending = new Map<string, Promise<InstagramProfileInspection>>()
  private inspectionTail: Promise<void> = Promise.resolve()
  private readonly cache = new Map<string, InspectionCacheEntry>()
  private readonly clock: () => number
  private readonly maxCacheEntries: number
  private readonly options: InstagramProfileInspectorOptions

  constructor(options: InstagramProfileInspectorOptions) {
    this.options = options
    this.clock = options.clock ?? Date.now
    this.maxCacheEntries = options.maxCacheEntries ?? DEFAULT_MAX_CACHE_ENTRIES
  }

  list(): Pick<
    InstagramProfileInspection,
    'inspectionId' | 'profile' | 'totalSourceCount' | 'totalAssetCount' | 'mapping'
  >[] {
    const ids = new Set(this.cache.keys())
    if (this.options.storageDir) {
      try {
        for (const filename of readdirSync(this.options.storageDir)) {
          if (/^instagram_[a-f0-9]{64}\.json$/.test(filename)) {
            ids.add(filename.slice(0, -5))
          }
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error
        }
      }
    }
    const profiles: Pick<
      InstagramProfileInspection,
      'inspectionId' | 'profile' | 'totalSourceCount' | 'totalAssetCount' | 'mapping'
    >[] = []
    for (const id of ids) {
      const entry = this.get(id)
      if (entry) {
        const { inspectionId, profile, totalSourceCount, totalAssetCount } = entry.inspection
        profiles.push({
          inspectionId,
          profile: { ...profile },
          totalSourceCount,
          totalAssetCount,
          mapping: this.withMapping(entry.inspection).mapping
        })
      }
    }
    return profiles.sort((a, b) => a.profile.username.localeCompare(b.profile.username))
  }

  private withMapping(inspection: InstagramProfileInspection): InstagramProfileInspection {
    const completed = this.options.completedDownloads?.() ?? []
    let changed = false
    for (const category of inspection.categories) {
      for (const item of category.items ?? []) {
        if (
          !item.downloaded &&
          completed.some(
            (task) =>
              task.url === item.url &&
              task.category === category.category &&
              task.assetCount === item.assetCount
          )
        ) {
          item.downloaded = true
          changed = true
        }
      }
    }
    if (changed) {
      const entry = this.cache.get(inspection.inspectionId)
      if (entry) {
        this.save(entry)
      }
    }
    const snapshot = structuredClone(inspection)
    snapshot.mapping = undefined
    for (const [controller, url] of this.controllers) {
      if (!controller.signal.aborted && url === inspection.profile.profileUrl) {
        const mapping = this.mapping.get(controller)
        if (mapping) {
          snapshot.mapping = { ...mapping }
        }
        if (mapping?.state === 'running') {
          break
        }
      }
    }
    return snapshot
  }

  async stop(): Promise<void> {
    for (const controller of this.controllers.keys()) {
      controller.abort()
    }
    await Promise.allSettled(this.pending.values())
  }

  cancel(url: string): boolean {
    const normalized = normalizeInstagramProfileUrl(url)
    if (!normalized) {
      throw new Error('Enter a valid Instagram profile URL.')
    }
    let cancelled = false
    for (const [controller, profileUrl] of this.controllers) {
      if (profileUrl === normalized.profileUrl) {
        controller.abort()
        cancelled = true
      }
    }
    return cancelled
  }

  inspect(
    url: string,
    settings?: DownloadRuntimeSettings,
    requestedCategories?: readonly InstagramProfileCategory[]
  ): Promise<InstagramProfileInspection> {
    const normalized = normalizeInstagramProfileUrl(url)
    if (!normalized) {
      return Promise.reject(new Error('Enter a valid Instagram profile URL.'))
    }
    if (requestedCategories?.length === 0) {
      return this.scan(normalized.profileUrl, settings, [])
    }
    const key = JSON.stringify([normalized.profileUrl, settings, requestedCategories])
    const existing = this.pending.get(key)
    if (existing) {
      return existing
    }
    // Multiple dialogs can request scans while earlier work is still running.
    // Serialize scans and share identical in-flight requests to avoid request bursts.
    const controller = new AbortController()
    this.controllers.set(controller, normalized.profileUrl)
    const mapping: NonNullable<InstagramProfileInspection['mapping']> = {
      category: requestedCategories?.[0] ?? INSTAGRAM_PROFILE_CATEGORIES[0],
      state: 'queued'
    }
    this.mapping.set(controller, mapping)
    const prepared = this.scan(normalized.profileUrl, settings, [])
    const previousTail = this.inspectionTail
    const stopped = new Promise<void>((resolve) => {
      controller.signal.addEventListener('abort', () => resolve(), { once: true })
    })
    const request = Promise.all([prepared, Promise.race([previousTail, stopped])])
      .then(() =>
        this.scan(normalized.profileUrl, settings, requestedCategories, controller.signal, mapping)
      )
      .finally(() => {
        this.controllers.delete(controller)
        this.mapping.delete(controller)
        this.pending.delete(key)
      })
    this.pending.set(key, request)
    // Cancelling a queued scan must not release another profile's active scan.
    this.inspectionTail = Promise.allSettled([previousTail, request]).then(() => {})
    return request.then((inspection) => this.withMapping(inspection))
  }

  private async scan(
    url: string,
    settings?: DownloadRuntimeSettings,
    requestedCategories?: readonly InstagramProfileCategory[],
    signal?: AbortSignal,
    mapping?: NonNullable<InstagramProfileInspection['mapping']>
  ): Promise<InstagramProfileInspection> {
    const normalized = normalizeInstagramProfileUrl(url)
    if (!normalized) {
      throw new Error('Enter a valid Instagram profile URL.')
    }

    const inspectionId = `instagram_${createHash('sha256').update(normalized.username).digest('hex')}`
    const cached = this.get(inspectionId)
    const categoryUrls = Object.fromEntries(
      INSTAGRAM_PROFILE_CATEGORIES.map((category) => [
        category,
        buildInstagramCategoryUrl(normalized.username, category)
      ])
    ) as Record<InstagramProfileCategory, string>
    const inspection: InstagramProfileInspection = cached?.inspection ?? {
      inspectionId,
      expiresAt: Number.MAX_SAFE_INTEGER,
      complete: false,
      profile: { username: normalized.username, profileUrl: normalized.profileUrl },
      categories: INSTAGRAM_PROFILE_CATEGORIES.map((category) => ({
        category,
        state: 'unscanned',
        sourceCount: 0,
        assetCount: 0,
        items: []
      })),
      totalSourceCount: 0,
      totalAssetCount: 0
    }
    const selected = requestedCategories ?? INSTAGRAM_PROFILE_CATEGORIES
    this.save({ inspection, categoryUrls })
    if (selected.length === 0 || signal?.aborted) {
      return this.withMapping(inspection)
    }
    const binaryPath = this.options.resolveBinaryPath()
    const extraArgs =
      this.options.resolveExtraArgs?.(settings) ?? buildGalleryDlRuntimeArgs(settings)
    for (const category of selected) {
      if (signal?.aborted) {
        break
      }
      if (!INSTAGRAM_PROFILE_CATEGORIES.includes(category)) {
        throw new Error('Unsupported Instagram category.')
      }
      const previous = inspection.categories.find((entry) => entry.category === category)
      const incremental =
        previous?.incremental || previous?.state === 'ready' || previous?.state === 'empty'
      let summary: InstagramCategorySummary
      try {
        const categoryArgs = [
          ...extraArgs,
          '-o',
          `extractor.instagram.vidbee-inspection-category=${category}`,
          ...(this.options.storageDir
            ? [
                '-o',
                `extractor.instagram.vidbee-known-profile=${path.join(this.options.storageDir, `${inspectionId}.json`)}`
              ]
            : [])
        ]
        if (mapping) {
          mapping.category = category
          mapping.state = 'queued'
        }
        const release = this.options.admission
          ? await this.options.admission.acquire(url, signal)
          : () => {}
        if (!release || signal?.aborted) {
          release?.()
          break
        }
        if (mapping) {
          mapping.state = 'running'
        }
        let result: GalleryJsonResult
        try {
          result = await runGalleryJson(
            binaryPath,
            categoryUrls[category],
            categoryArgs,
            true,
            signal,
            (progress) => {
              const discovered = new Map((previous?.items ?? []).map((item) => [item.id, item]))
              for (const item of progress.items.values()) {
                const id = `${category}:${item.id}`
                const prior = discovered.get(id)
                if (!prior || item.assetCount >= prior.assetCount) {
                  discovered.set(id, { ...item, id })
                }
              }
              const items = [...discovered.values()]
              const partial: InstagramCategorySummary = {
                category,
                incremental,
                state: 'cancelled',
                items,
                cursor: progress.cursor ?? previous?.cursor,
                sourceCount: items.length,
                assetCount: items.reduce((total, item) => total + item.assetCount, 0),
                mappedAt: this.clock()
              }
              inspection.categories = inspection.categories.map((entry) =>
                entry.category === category ? partial : entry
              )
              inspection.complete = false
              inspection.totalSourceCount = inspection.categories.reduce(
                (total, entry) => total + entry.sourceCount,
                0
              )
              inspection.totalAssetCount = inspection.categories.reduce(
                (total, entry) => total + entry.assetCount,
                0
              )
              this.save({ inspection, categoryUrls })
            }
          )
        } finally {
          release()
        }
        summary = result.cancelled
          ? {
              category,
              state: 'cancelled',
              sourceCount: 0,
              assetCount: 0,
              cursor: result.cursor ?? previous?.cursor
            }
          : toCategorySummary(category, result)
        summary.incremental = incremental
        const items = [...result.items.values()].map((item) => ({
          ...item,
          id: `${category}:${item.id}`
        }))
        // A failed refresh must not destroy references discovered by an earlier scan.
        const merged = new Map((previous?.items ?? []).map((item) => [item.id, item]))
        for (const item of items) {
          const prior = merged.get(item.id)
          if (result.cancelled && prior && prior.assetCount > item.assetCount) {
            continue
          }
          const sameMedia = prior?.assetIds?.length
            ? JSON.stringify([...prior.assetIds].sort()) ===
              JSON.stringify([...(item.assetIds ?? [])].sort())
            : prior?.assetCount === item.assetCount
          merged.set(item.id, { ...item, downloaded: sameMedia && prior?.downloaded })
        }
        summary.items = [...merged.values()]
        if (summary.state === 'unavailable' || summary.state === 'auth-required') {
          summary.cursor = result.cursor ?? previous?.cursor
        }
        if (summary.items.length) {
          if (summary.state === 'empty') {
            summary.state = 'ready'
          }
          summary.sourceCount = summary.items.length
          summary.assetCount = summary.items.reduce((total, item) => total + item.assetCount, 0)
        }
        summary.mappedAt = this.clock()
        const user = resolveUserRecord(result.directoryMetadata[0])
        inspection.profile.displayName =
          readString(user, 'full_name', 'fullname') ?? inspection.profile.displayName
        inspection.profile.avatarUrl =
          readString(user, 'profile_pic_url_hd', 'profile_pic_url') ?? inspection.profile.avatarUrl
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        summary = {
          ...previous,
          category,
          state: 'unavailable',
          sourceCount: previous?.sourceCount ?? 0,
          assetCount: previous?.assetCount ?? 0,
          errorCode: inspectionFailureCode(message, /ENOENT|not found/i.test(message))
        }
      }
      inspection.categories = INSTAGRAM_PROFILE_CATEGORIES.map((key) =>
        key === category
          ? summary
          : (inspection.categories.find((entry) => entry.category === key) ?? {
              category: key,
              state: 'unscanned',
              sourceCount: 0,
              assetCount: 0,
              items: []
            })
      )
      inspection.complete = inspection.categories.every(
        (entry) => entry.state === 'ready' || entry.state === 'empty'
      )
      inspection.totalSourceCount = inspection.categories.reduce(
        (total, entry) => total + entry.sourceCount,
        0
      )
      inspection.totalAssetCount = inspection.categories.reduce(
        (total, entry) => total + entry.assetCount,
        0
      )
      this.save({ inspection, categoryUrls })
    }
    this.pruneExpired()
    while (this.cache.size >= this.maxCacheEntries) {
      const oldestKey = this.cache.keys().next().value as string | undefined
      if (!oldestKey) {
        break
      }
      this.cache.delete(oldestKey)
    }
    this.cache.set(inspection.inspectionId, { inspection, categoryUrls })
    return this.withMapping(inspection)
  }

  private save(entry: InspectionCacheEntry): void {
    this.cache.set(entry.inspection.inspectionId, entry)
    if (!this.options.storageDir) {
      return
    }
    mkdirSync(this.options.storageDir, { recursive: true, mode: 0o700 })
    const target = path.join(this.options.storageDir, `${entry.inspection.inspectionId}.json`)
    const temporary = `${target}.${randomUUID()}.tmp`
    writeFileSync(temporary, JSON.stringify(entry.inspection), { mode: 0o600 })
    renameSync(temporary, target)
  }

  get(inspectionId: string): InspectionCacheEntry | null {
    let entry = this.cache.get(inspectionId)
    if (!entry && this.options.storageDir && /^instagram_[a-f0-9]{64}$/.test(inspectionId)) {
      try {
        const inspection = InstagramProfileInspectionSchema.parse(
          JSON.parse(
            readFileSync(path.join(this.options.storageDir, `${inspectionId}.json`), 'utf8')
          )
        )
        entry = {
          inspection,
          categoryUrls: Object.fromEntries(
            INSTAGRAM_PROFILE_CATEGORIES.map((category) => [
              category,
              buildInstagramCategoryUrl(inspection.profile.username, category)
            ])
          ) as Record<InstagramProfileCategory, string>
        }
        this.cache.set(inspectionId, entry)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw new Error(
            'Saved Instagram profile could not be read. Restore its backup before rescanning.'
          )
        }
      }
    }
    if (!entry) {
      return null
    }
    if (entry.inspection.expiresAt <= this.clock()) {
      this.cache.delete(inspectionId)
      return null
    }
    return entry
  }

  private pruneExpired(): void {
    const now = this.clock()
    for (const [id, entry] of this.cache) {
      if (entry.inspection.expiresAt <= now) {
        this.cache.delete(id)
      }
    }
  }
}

export const enqueueInstagramProfileDownload = async ({
  queue,
  inspector,
  input,
  defaultDownloadDir
}: EnqueueInstagramProfileOptions): Promise<InstagramProfileDownloadResult> => {
  const cached = inspector.get(input.inspectionId)
  if (!cached) {
    throw new Error('Instagram profile inspection expired. Scan the profile again.')
  }

  const selectedCategories = Array.from(new Set(input.categories))
  const selectedSummaries = selectedCategories
    .map((category) => {
      const summary = cached.inspection.categories.find(
        (candidate) => candidate.category === category
      )
      if (
        !summary ||
        (summary.state !== 'ready' && !summary.items?.length) ||
        summary.assetCount === 0
      ) {
        throw new Error(`Instagram category "${category}" is not ready to download.`)
      }
      return summary
    })
    .sort(
      (left, right) =>
        DOWNLOAD_CATEGORY_ORDERS[left.category] - DOWNLOAD_CATEGORY_ORDERS[right.category]
    )

  const groupId = `${INSTAGRAM_PROFILE_GROUP_PREFIX}${Date.now()}_${randomUUID().slice(0, 8)}`
  const groupKey = INSTAGRAM_PROFILE_GROUP_KEY
  await queue.setMaxPerGroup(groupKey, 1)

  const username = sanitizePathSegment(cached.inspection.profile.username)
  const baseDownloadDir =
    input.customDownloadPath?.trim() || input.settings?.downloadPath?.trim() || defaultDownloadDir
  const profileDirectory = path.join(baseDownloadDir, 'Instagram', username)
  const tasks: InstagramProfileDownloadResult['tasks'] = []

  for (const summary of selectedSummaries) {
    const categoryLabel = CATEGORY_LABELS[summary.category]
    const outputDirectory = path.join(profileDirectory, categoryLabel)
    const isHighlights = summary.category === 'highlights'
    const references = summary.items?.length
      ? summary.items
      : [
          {
            id: summary.category,
            downloaded: false,
            url: cached.categoryUrls[summary.category],
            assetCount: summary.assetCount
          }
        ]
    for (const reference of references) {
      if (reference.downloaded) {
        continue
      }
      if (input.itemIds && !input.itemIds.includes(reference.id)) {
        continue
      }
      const id = `instagram_item_${createHash('sha256')
        .update(
          JSON.stringify([
            input.inspectionId,
            summary.category,
            reference.id,
            reference.assetCount,
            path.resolve(outputDirectory)
          ])
        )
        .digest('hex')}`
      const existing = queue.get(id)
      if (existing && !['failed', 'cancelled'].includes(existing.status)) {
        continue
      }
      if (existing && ['failed', 'cancelled'].includes(existing.status)) {
        await queue.retryManual(id, { ...existing.input.options, settings: input.settings })
      }
      const result = await queue.add({
        id,
        input: {
          url: reference.url,
          kind: 'instagram-profile-category',
          title: `@${cached.inspection.profile.username} · ${categoryLabel}`,
          thumbnail: cached.inspection.profile.avatarUrl,
          options: {
            type: 'video',
            customDownloadPath: outputDirectory,
            settings: input.settings,
            galleryDlBaseDirectory: isHighlights ? profileDirectory : undefined,
            galleryDlDirectorySegments: isHighlights
              ? [categoryLabel, '{highlight_title}']
              : undefined,
            galleryDlDirectoryTemplate: outputDirectory,
            galleryDlFilenameTemplate: '{date:%Y-%m-%d}_{media_id}.{extension}',
            expectedAssetCount: reference.assetCount,
            batchId: groupId,
            batchKind: 'instagram-profile',
            batchTitle: `@${cached.inspection.profile.username}`,
            batchCategory: summary.category,
            batchOrder: CATEGORY_ORDERS[summary.category],
            batchSourceCount: 1,
            batchAssetCount: reference.assetCount,
            downloadPath: outputDirectory
          }
        },
        priority: PRIORITY_USER,
        groupKey,
        maxAttempts: 3
      })
      tasks.push({
        downloadId: result.id,
        category: summary.category,
        sourceCount: 1,
        assetCount: reference.assetCount
      })
    }
  }

  return {
    groupId,
    username: cached.inspection.profile.username,
    totalSourceCount: tasks.reduce((total, task) => total + task.sourceCount, 0),
    totalAssetCount: tasks.reduce((total, task) => total + task.assetCount, 0),
    tasks
  }
}

export const restoreInstagramProfileGroupCaps = async (queue: TaskQueueAPI): Promise<void> => {
  const groupKeys = new Set<string>()
  let cursor: string | null = null
  do {
    const page = queue.list({ limit: 200, cursor })
    for (const task of page.tasks) {
      if (task.kind === 'instagram-profile-category') {
        groupKeys.add(task.groupKey)
      }
    }
    cursor = page.nextCursor
  } while (cursor)

  for (const groupKey of groupKeys) {
    await queue.setMaxPerGroup(groupKey, 1)
  }
}
