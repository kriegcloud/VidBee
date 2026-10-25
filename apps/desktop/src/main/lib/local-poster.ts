import { execFile } from 'node:child_process'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { APP_PROTOCOL_SCHEME } from '@shared/constants'
import { app } from 'electron'
import { scopedLoggers } from '../utils/logger'
import { createLimiter, type Limiter } from './concurrency-limiter'
import { ffmpegManager } from './ffmpeg-manager'
import {
  buildPosterArgs,
  type LocalPosterRequest,
  type PosterSource,
  posterSeekPlan,
  resolvePosterSource
} from './local-poster-args'

export type { LocalPosterRequest } from './local-poster-args'

const execFileAsync = promisify(execFile)

/** A still frame should take well under a second; a stuck probe must not pile up. */
const POSTER_TIMEOUT_MS = 20_000
/**
 * ffmpeg renders allowed at once. A history list mounts a screenful of rows
 * plus overscan, each of which may want a poster; this keeps that from
 * becoming dozens of concurrent ffmpeg processes.
 */
const MAX_CONCURRENT_RENDERS = 2

export class LocalPosterCache {
  private cacheDir?: string
  private readonly pending: Map<string, Promise<string | null>> = new Map()
  private readonly userDataOverride?: string
  private readonly limit: Limiter

  constructor(userDataOverride?: string, maxConcurrentRenders = MAX_CONCURRENT_RENDERS) {
    this.userDataOverride = userDataOverride
    this.limit = createLimiter(maxConcurrentRenders)
  }

  private userDataPath(): string {
    return this.userDataOverride ?? app.getPath('userData')
  }

  private ensureCacheDir(): string {
    if (this.cacheDir) {
      return this.cacheDir
    }
    const dir = path.join(this.userDataPath(), 'thumbnails')
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    this.cacheDir = dir
    return dir
  }

  private toAppProtocolUrl(filePath: string): string {
    const relativePath = path.relative(this.userDataPath(), filePath).replace(/\\/g, '/')
    return `${APP_PROTOCOL_SCHEME}${relativePath}`
  }

  /**
   * App-protocol URL of a poster rendered from the task's own saved media, or
   * null when there is nothing on disk to render from.
   */
  async getPosterUrl(request: LocalPosterRequest): Promise<string | null> {
    const source = await resolvePosterSource(request)
    if (!source) {
      return null
    }
    const pending = this.pending.get(source.key)
    if (pending) {
      return pending
    }
    const task = this.produce(source).finally(() => {
      this.pending.delete(source.key)
    })
    this.pending.set(source.key, task)
    return task
  }

  /** Serve a cached poster immediately; only real renders wait for a slot. */
  private async produce(source: PosterSource): Promise<string | null> {
    const target = path.join(this.ensureCacheDir(), `poster-${source.key}.jpg`)
    const existing = await fsPromises.stat(target).catch(() => null)
    if (existing?.isFile() && existing.size > 0) {
      return this.toAppProtocolUrl(target)
    }
    return this.limit(() => this.render(source.path, target))
  }

  private async render(sourcePath: string, target: string): Promise<string | null> {
    // Write to a unique temp name so two rows racing on the same file cannot
    // leave a half-written JPEG behind for the next launch to read.
    const temporary = `${target}.${process.pid}.tmp`
    try {
      const ffmpeg = await ffmpegManager.ensureInitialized()
      for (const seek of posterSeekPlan(sourcePath)) {
        try {
          await execFileAsync(ffmpeg, buildPosterArgs(sourcePath, temporary, seek), {
            timeout: POSTER_TIMEOUT_MS,
            windowsHide: true
          })
        } catch {
          continue
        }
        const written = await fsPromises.stat(temporary).catch(() => null)
        if (written?.isFile() && written.size > 0) {
          await fsPromises.rename(temporary, target)
          return this.toAppProtocolUrl(target)
        }
      }
      await fsPromises.rm(temporary, { force: true })
      return null
    } catch (error) {
      scopedLoggers.thumbnail.debug('Failed to render local poster:', error)
      await fsPromises.rm(temporary, { force: true }).catch(() => undefined)
      return null
    }
  }
}

export const localPosterCache = new LocalPosterCache()
