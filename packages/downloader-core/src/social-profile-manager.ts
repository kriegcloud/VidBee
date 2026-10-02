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
import type { GalleryDlExecutorOptions } from './gallery-dl-executor'
import { resolveMappedProfileSource } from './mapped-profile-source'
import { mapRedGifsProfile } from './redgifs-profile-service'
import {
  mapSocialMediaProfile,
  type SocialMappedItem,
  type SocialMappedProfile,
  SocialMappedProfileSchema,
  type SocialProfileCategory
} from './social-media-service'
import type { DownloadRuntimeSettings } from './types'

export interface SocialProfileManagerOptions {
  storageDir: string
  runtime: Omit<GalleryDlExecutorOptions, 'defaultDownloadDir'> & { admission?: SourceAdmission }
  resolveYtDlpPath: () => string
}

const profileSource = (value: string) => {
  const source = resolveMappedProfileSource(value)
  if (!source) {
    throw new Error('Enter an X, TikTok, or Redgifs profile URL.')
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

  map(url: string, category: string, settings?: DownloadRuntimeSettings): SocialMappedProfile {
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
    mapped.state = 'mapping'
    mapped.error = undefined
    this.save(profile)
    const controller = new AbortController()
    const items = new Map(mapped.items.map((item) => [item.id, item]))
    const seenThisRun = new Map<string, SocialMappedItem>()
    const onItem = (entry: SocialMappedItem) => {
      const current = seenThisRun.get(entry.id)
      const next = current
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
    const mapping =
      source.platform === 'redgifs'
        ? mapRedGifsProfile(
            selected.url,
            this.options.resolveYtDlpPath,
            this.options.runtime.admission,
            controller.signal,
            onItem
          )
        : mapSocialMediaProfile(
            selected.url,
            this.options.runtime,
            settings,
            controller.signal,
            onItem
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
