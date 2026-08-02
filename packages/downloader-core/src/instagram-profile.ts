import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

import { PRIORITY_USER, type TaskQueueAPI } from '@vidbee/task-queue'
import type {
  DownloadRuntimeSettings,
  InstagramCategorySummary,
  InstagramInspectionErrorCode,
  InstagramProfileCategory,
  InstagramProfileDownloadInput,
  InstagramProfileDownloadResult,
  InstagramProfileInspection
} from './types'
import { normalizeBrowserCookiesSettingForYtDlp } from './yt-dlp-args'

const INSPECTION_TTL_MS = 15 * 60 * 1000
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
  'posts',
  'reels',
  'stories',
  'highlights',
  'tagged'
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
const INSTAGRAM_POST_FILTER = "type == 'post'"

interface InspectionCacheEntry {
  inspection: InstagramProfileInspection
  categoryUrls: Record<InstagramProfileCategory, string>
}

interface GalleryJsonResult {
  exitCode: number | null
  stderr: string
  directoryMetadata: Record<string, unknown>[]
  sourceIds: Set<string>
  assetCount: number
  parseError: boolean
}

export interface InstagramProfileInspectorOptions {
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

const readBoolean = (
  record: Record<string, unknown> | null,
  ...keys: readonly string[]
): boolean | undefined => {
  if (!record) {
    return undefined
  }
  for (const key of keys) {
    if (typeof record[key] === 'boolean') {
      return record[key]
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

const parseGalleryJsonLine = (rawLine: string, result: GalleryJsonResult): void => {
  const line = rawLine.trim()
  if (!line) {
    return
  }

  let message: unknown
  try {
    message = JSON.parse(line)
  } catch {
    result.parseError = true
    return
  }
  if (!Array.isArray(message) || message.length < 2) {
    result.parseError = true
    return
  }

  const messageType = message[0]
  if (messageType === -1) {
    result.parseError = true
    return
  }

  if (messageType === 2) {
    const metadata = asRecord(message[1])
    if (!metadata) {
      return
    }
    result.directoryMetadata.push(metadata)
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
  sleepBeforeExtraction: boolean
): Promise<GalleryJsonResult> =>
  new Promise((resolve, reject) => {
    const args = [
      '-J',
      '-o',
      'output.jsonl=true',
      '--no-input',
      '--no-colors',
      '-o',
      'extractor.instagram.api=rest',
      '-o',
      'extractor.instagram.videos=true',
      '-o',
      'extractor.instagram.static-videos=false',
      '-o',
      'extractor.instagram.previews=false',
      '-o',
      'extractor.instagram.audio=false',
      ...(sleepBeforeExtraction ? ['--sleep-extractor', '6.0-12.0'] : []),
      ...extraArgs,
      url
    ]
    const child = spawn(binaryPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })
    const result: GalleryJsonResult = {
      exitCode: null,
      stderr: '',
      directoryMetadata: [],
      sourceIds: new Set<string>(),
      assetCount: 0,
      parseError: false
    }
    let stdoutCarry = ''

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutCarry += chunk.toString()
      const lines = stdoutCarry.split(/\r?\n/)
      stdoutCarry = lines.pop() ?? ''
      for (const line of lines) {
        parseGalleryJsonLine(line, result)
      }
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      result.stderr += chunk.toString()
      if (result.stderr.length > 16_384) {
        result.stderr = result.stderr.slice(-16_384)
      }
    })
    child.once('error', reject)
    child.once('close', (exitCode) => {
      if (stdoutCarry.trim()) {
        parseGalleryJsonLine(stdoutCarry, result)
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
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null
    }
    if (!INSTAGRAM_HOSTS.has(parsed.hostname.toLowerCase())) {
      return null
    }
    const segments = parsed.pathname.split('/').filter(Boolean)
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
      username,
      profileUrl: `https://www.instagram.com/${username}/`
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
  const extractorPath = category === 'posts' ? 'photos' : category
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
  private readonly cache = new Map<string, InspectionCacheEntry>()
  private readonly clock: () => number
  private readonly maxCacheEntries: number
  private readonly options: InstagramProfileInspectorOptions

  constructor(options: InstagramProfileInspectorOptions) {
    this.options = options
    this.clock = options.clock ?? Date.now
    this.maxCacheEntries = options.maxCacheEntries ?? DEFAULT_MAX_CACHE_ENTRIES
  }

  async inspect(
    url: string,
    settings?: DownloadRuntimeSettings
  ): Promise<InstagramProfileInspection> {
    const normalized = normalizeInstagramProfileUrl(url)
    if (!normalized) {
      throw new Error('Enter a valid Instagram profile URL.')
    }

    let binaryPath: string
    try {
      binaryPath = this.options.resolveBinaryPath()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`gallery-dl binary not found: ${message}`)
    }
    const extraArgs =
      this.options.resolveExtraArgs?.(settings) ?? buildGalleryDlRuntimeArgs(settings)
    const infoUrl = `https://www.instagram.com/${normalized.username}/info/`
    const infoResult = await runGalleryJson(binaryPath, infoUrl, extraArgs, false)
    const infoMetadata = infoResult.directoryMetadata[0]
    const userRecord = resolveUserRecord(infoMetadata)

    const categoryUrls = Object.fromEntries(
      INSTAGRAM_PROFILE_CATEGORIES.map((category) => [
        category,
        buildInstagramCategoryUrl(normalized.username, category)
      ])
    ) as Record<InstagramProfileCategory, string>

    const categories: InstagramCategorySummary[] = []
    for (const category of INSTAGRAM_PROFILE_CATEGORIES) {
      try {
        const categoryArgs =
          category === 'posts' ? [...extraArgs, '--filter', INSTAGRAM_POST_FILTER] : extraArgs
        const result = await runGalleryJson(binaryPath, categoryUrls[category], categoryArgs, true)
        categories.push(toCategorySummary(category, result))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        categories.push({
          category,
          state: 'unavailable',
          sourceCount: 0,
          assetCount: 0,
          errorCode: inspectionFailureCode(message, /ENOENT|not found/i.test(message))
        })
      }
    }

    const totalSourceCount = categories.reduce((total, category) => total + category.sourceCount, 0)
    const totalAssetCount = categories.reduce((total, category) => total + category.assetCount, 0)
    const now = this.clock()
    const inspection: InstagramProfileInspection = {
      inspectionId: randomUUID(),
      expiresAt: now + INSPECTION_TTL_MS,
      complete: categories.every(
        (category) => category.state === 'ready' || category.state === 'empty'
      ),
      profile: {
        username:
          readString(userRecord, 'username') ??
          readString(infoMetadata ?? null, 'username') ??
          normalized.username,
        profileUrl: normalized.profileUrl,
        displayName:
          readString(userRecord, 'full_name', 'fullname') ??
          readString(infoMetadata ?? null, 'full_name', 'fullname'),
        avatarUrl:
          readString(userRecord, 'profile_pic_url_hd', 'profile_pic_url', 'profile_pic_url_web') ??
          readString(
            infoMetadata ?? null,
            'profile_pic_url_hd',
            'profile_pic_url',
            'profile_pic_url_web'
          ),
        isPrivate:
          readBoolean(userRecord, 'is_private') ?? readBoolean(infoMetadata ?? null, 'is_private')
      },
      categories,
      totalSourceCount,
      totalAssetCount
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
    return inspection
  }

  get(inspectionId: string): InspectionCacheEntry | null {
    const entry = this.cache.get(inspectionId)
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
      if (summary?.state !== 'ready' || summary.assetCount === 0) {
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
    const result = await queue.add({
      input: {
        url: cached.categoryUrls[summary.category],
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
          galleryDlFilter: summary.category === 'posts' ? INSTAGRAM_POST_FILTER : undefined,
          expectedAssetCount: summary.assetCount,
          batchId: groupId,
          batchKind: 'instagram-profile',
          batchTitle: `@${cached.inspection.profile.username}`,
          batchCategory: summary.category,
          batchOrder: CATEGORY_ORDERS[summary.category],
          batchSourceCount: summary.sourceCount,
          batchAssetCount: summary.assetCount,
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
      sourceCount: summary.sourceCount,
      assetCount: summary.assetCount
    })
  }

  return {
    groupId,
    username: cached.inspection.profile.username,
    totalSourceCount: selectedSummaries.reduce((total, summary) => total + summary.sourceCount, 0),
    totalAssetCount: selectedSummaries.reduce((total, summary) => total + summary.assetCount, 0),
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
