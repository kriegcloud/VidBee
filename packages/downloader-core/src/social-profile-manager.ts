import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from 'node:fs'
import path from 'node:path'
import type { SourceAdmission } from '@vidbee/task-queue/source-admission'
import { mapFacebookProfile } from './facebook-profile-map'
import type { GalleryDlExecutorOptions } from './gallery-dl-executor'
import type { GalleryDlProfileMapRuntime } from './gallery-dl-json-run'
import type { MappedProfilePlatform } from './mapped-profile-source'
import { resolveMappedProfileSource } from './mapped-profile-source'
import { mapPinterestProfile } from './pinterest-profile-map'
import { mapRedGifsProfile } from './redgifs-profile-service'
import { mapSnapchatProfile } from './snapchat-profile-map'
import {
  mapSocialMediaProfile,
  type ProfileMapOptions,
  type SocialMappedItem,
  type SocialMappedProfile,
  SocialMappedProfileSchema,
  type SocialProfileCategory
} from './social-media-service'
import { mapThreadsProfile } from './threads-profile-map'
import type { DownloadRuntimeSettings } from './types'
import { mapVscoProfile } from './vsco-profile-map'

export interface SocialProfileManagerOptions {
  storageDir: string
  runtime: Omit<GalleryDlExecutorOptions, 'defaultDownloadDir'> & { admission?: SourceAdmission }
  resolveYtDlpPath: () => string
}

/**
 * Mappers that already accumulate a post's assets before emitting it; their
 * repeat events replace the saved item instead of adding to it.
 */
const PRE_AGGREGATED: ReadonlySet<MappedProfilePlatform> = new Set<MappedProfilePlatform>([
  'facebook',
  'vsco',
  'threads',
  'pinterest',
  'snapchat'
])

const profileSource = (value: string) => {
  const source = resolveMappedProfileSource(value)
  if (!source) {
    throw new Error(
      'Enter a Facebook, X, TikTok, Redgifs, VSCO, Threads, Pinterest, or Snapchat profile URL.'
    )
  }
  return source
}

export class SocialProfileManager {
  private readonly active = new Map<string, { controller: AbortController; done: Promise<void> }>()
  private readonly options: SocialProfileManagerOptions

  constructor(options: SocialProfileManagerOptions) {
    this.options = options
  }

  private directory(): string {
    return this.options.storageDir
  }

  private filename(platform: string, owner: string): string {
    const hash = createHash('sha256').update(`${platform}:${owner.toLowerCase()}`).digest('hex')
    return path.join(this.directory(), `${hash}.json`)
  }

  private save(profile: SocialMappedProfile): void {
    mkdirSync(this.directory(), { recursive: true, mode: 0o700 })
    profile.updatedAt = Date.now()
    const target = this.filename(profile.platform, profile.owner)
    writeFileSync(`${target}.tmp`, JSON.stringify(profile), { mode: 0o600 })
    renameSync(`${target}.tmp`, target)
  }

  get(url: string): SocialMappedProfile {
    const source = profileSource(url)
    const filename = this.filename(source.platform, source.owner)
    if (!existsSync(filename)) {
      const profile: SocialMappedProfile = {
        profileUrl: source.profileUrl,
        platform: source.platform,
        owner: source.owner,
        categories: {},
        updatedAt: Date.now()
      }
      for (const category of source.categories) {
        profile.categories[category.key] = { state: 'unscanned', items: [] }
      }
      this.save(profile)
      return profile
    }
    const profile = SocialMappedProfileSchema.parse(JSON.parse(readFileSync(filename, 'utf8')))
    if (
      profile.platform !== source.platform ||
      profile.owner.toLowerCase() !== source.owner.toLowerCase()
    ) {
      throw new Error('Saved social profile identity does not match.')
    }
    for (const category of source.categories) {
      profile.categories[category.key] ??= { state: 'unscanned', items: [] }
      if (profile.categories[category.key].state === 'mapping' && !this.active.has(filename)) {
        profile.categories[category.key].state = 'partial'
      }
    }
    return profile
  }

  list(): SocialMappedProfile[] {
    if (!existsSync(this.directory())) {
      return []
    }
    return readdirSync(this.directory())
      .filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
      .flatMap((name) => {
        try {
          const saved = SocialMappedProfileSchema.parse(
            JSON.parse(readFileSync(path.join(this.directory(), name), 'utf8'))
          )
          return [this.get(saved.profileUrl)]
        } catch {
          return []
        }
      })
      .sort((a, b) => a.owner.localeCompare(b.owner))
  }

  async stop(url: string): Promise<SocialMappedProfile> {
    const source = profileSource(url)
    const active = this.active.get(this.filename(source.platform, source.owner))
    if (active) {
      active.controller.abort()
      await active.done
    }
    return this.get(url)
  }

  /** Each platform's traversal; all of them stream post references only. */
  private startMapping(
    platform: MappedProfilePlatform,
    url: string,
    category: string,
    owner: string,
    runtime: GalleryDlProfileMapRuntime,
    settings: DownloadRuntimeSettings | undefined,
    signal: AbortSignal,
    onItem: (item: SocialMappedItem) => void,
    options: ProfileMapOptions
  ): Promise<{ complete: boolean; error?: string }> {
    if (platform === 'facebook') {
      return mapFacebookProfile(
        url,
        category as 'photos' | 'albums' | 'reels',
        owner,
        runtime,
        settings,
        signal,
        onItem
      )
    }
    if (platform === 'pinterest') {
      return mapPinterestProfile(url, owner, runtime, settings, signal, onItem)
    }
    if (platform === 'vsco') {
      return mapVscoProfile(url, owner, runtime, settings, signal, onItem)
    }
    if (platform === 'threads') {
      return mapThreadsProfile(url, owner, runtime, settings, signal, onItem, options)
    }
    if (platform === 'snapchat') {
      return mapSnapchatProfile(
        owner,
        category === 'spotlight' ? 'spotlight' : 'stories',
        runtime,
        settings,
        signal,
        onItem
      )
    }
    if (platform === 'redgifs') {
      return mapRedGifsProfile(
        url,
        this.options.resolveYtDlpPath,
        this.options.runtime.admission,
        signal,
        onItem
      )
    }
    return mapSocialMediaProfile(url, this.options.runtime, settings, signal, onItem, options)
  }

  /**
   * Map a category and resolve once the traversal settles. `incremental` stops
   * X, TikTok and Threads after a run of already-saved posts; subscription
   * checks use it so each check reads only the newest part of a timeline.
   */
  async mapAndWait(
    url: string,
    category: string,
    settings?: DownloadRuntimeSettings,
    options: { incremental?: boolean; signal?: AbortSignal } = {}
  ): Promise<SocialMappedProfile> {
    const source = profileSource(url)
    const filename = this.filename(source.platform, source.owner)
    // A mapping the user started from the dialog finishes first.
    await this.active.get(filename)?.done
    this.map(url, category, settings, { incremental: options.incremental })
    const active = this.active.get(filename)
    const stop = () => active?.controller.abort()
    options.signal?.addEventListener('abort', stop, { once: true })
    try {
      await active?.done
    } finally {
      options.signal?.removeEventListener('abort', stop)
    }
    return this.get(url)
  }

  map(
    url: string,
    category: string,
    settings?: DownloadRuntimeSettings,
    options: { incremental?: boolean } = {}
  ): SocialMappedProfile {
    const source = profileSource(url)
    const selected = source.categories.find((entry) => entry.key === category)
    if (!selected) {
      throw new Error('Unsupported profile category.')
    }
    const filename = this.filename(source.platform, source.owner)
    if (this.active.has(filename)) {
      throw new Error('This profile is already mapping. Stop it or wait for completion.')
    }
    const profile = this.get(url)
    const mapped = profile.categories[category] as SocialProfileCategory
    // Stopping early is only safe once a full traversal has completed;
    // otherwise an interrupted first map would never reach older posts.
    const canStopEarly = options.incremental === true && mapped.state === 'complete'
    mapped.state = 'mapping'
    mapped.error = undefined
    this.save(profile)
    const controller = new AbortController()
    const items = new Map(mapped.items.map((item) => [item.id, item]))
    const seenThisRun = new Map<string, SocialMappedItem>()
    const onItem = (entry: SocialMappedItem) => {
      const current = seenThisRun.get(entry.id)
      const next =
        current && !PRE_AGGREGATED.has(source.platform)
          ? {
              ...current,
              url: entry.images ? entry.url : current.url,
              images: current.images + entry.images,
              videos: current.videos + entry.videos
            }
          : entry
      seenThisRun.set(entry.id, next)
      items.set(entry.id, next)
      mapped.items = [...items.values()]
      this.save(profile)
    }
    const mapperRuntime = {
      admission: this.options.runtime.admission,
      resolveGalleryDlPath: this.options.runtime.resolveBinaryPath,
      resolveYtDlpPath: this.options.resolveYtDlpPath,
      resolveGalleryDlArgs: this.options.runtime.resolveExtraArgs
    }
    const knownIds =
      canStopEarly && mapped.items.length > 0 ? mapped.items.map((item) => item.id) : undefined
    const mapping = this.startMapping(
      source.platform,
      selected.url,
      category,
      source.owner,
      mapperRuntime,
      settings,
      controller.signal,
      onItem,
      { knownIds }
    )
    const done = mapping
      .then((result) => {
        mapped.state = result.complete
          ? 'complete'
          : result.error?.includes('AuthRequired')
            ? 'auth-required'
            : 'partial'
        mapped.error = result.error
        this.save(profile)
      })
      .catch((failure: unknown) => {
        mapped.state = controller.signal.aborted ? 'partial' : 'error'
        mapped.error = failure instanceof Error ? failure.message : String(failure)
        this.save(profile)
      })
      .finally(() => {
        this.active.delete(filename)
      })
    this.active.set(filename, { controller, done })
    return structuredClone(profile)
  }
}
