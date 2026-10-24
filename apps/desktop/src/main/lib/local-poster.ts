import { execFile } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { APP_PROTOCOL_SCHEME } from '@shared/constants'
import { app } from 'electron'
import { scopedLoggers } from '../utils/logger'
import { ffmpegManager } from './ffmpeg-manager'
import {
  buildPosterArgs,
  isPosterSource,
  isVideoSource,
  VIDEO_SEEK_SECONDS
} from './local-poster-args'

const execFileAsync = promisify(execFile)

/** A still frame should take well under a second; a stuck probe must not pile up. */
const POSTER_TIMEOUT_MS = 20_000

/**
 * The first media file in a collection's output directory, in name order, so a
 * multi-file post shows its own first asset rather than nothing.
 *
 * @param directory Directory the task wrote into.
 */
const firstMediaInDirectory = async (directory: string): Promise<string | null> => {
  let entries: string[]
  try {
    entries = await fsPromises.readdir(directory)
  } catch {
    return null
  }
  const names: string[] = []
  for (const entry of entries) {
    if (!isPosterSource(entry)) {
      continue
    }
    const info = await fsPromises.stat(path.join(directory, entry)).catch(() => null)
    if (info?.isFile()) {
      names.push(entry)
    }
  }
  names.sort((left, right) => left.localeCompare(right))
  const first = names[0]
  return first ? path.join(directory, first) : null
}

export interface LocalPosterRequest {
  /** The task's own saved file, when the renderer managed to resolve one. */
  filePath?: string | null
  /** A collection's output directory, used when there is no single file. */
  directory?: string | null
}

export class LocalPosterCache {
  private cacheDir?: string
  private readonly pending: Map<string, Promise<string | null>> = new Map()
  private readonly userDataOverride?: string

  constructor(userDataOverride?: string) {
    this.userDataOverride = userDataOverride
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
    const source = await this.resolveSource(request)
    if (!source) {
      return null
    }
    const pending = this.pending.get(source.key)
    if (pending) {
      return pending
    }
    const task = this.render(source).finally(() => {
      this.pending.delete(source.key)
    })
    this.pending.set(source.key, task)
    return task
  }

  /**
   * Pick the file to render from and key it by identity plus mtime, so a
   * re-downloaded file replaces its poster instead of reusing a stale one.
   */
  private async resolveSource(
    request: LocalPosterRequest
  ): Promise<{ key: string; path: string } | null> {
    const candidate =
      request.filePath && isPosterSource(request.filePath)
        ? request.filePath
        : request.directory
          ? await firstMediaInDirectory(request.directory)
          : null
    if (!candidate) {
      return null
    }
    try {
      const info = await fsPromises.stat(candidate)
      if (!(info.isFile() && info.size > 0)) {
        return null
      }
      const key = crypto
        .createHash('sha1')
        .update(`${candidate}:${info.mtimeMs}:${info.size}`)
        .digest('hex')
      return { key, path: candidate }
    } catch {
      return null
    }
  }

  private async render(source: { key: string; path: string }): Promise<string | null> {
    const target = path.join(this.ensureCacheDir(), `poster-${source.key}.jpg`)
    try {
      const existing = await fsPromises.stat(target)
      if (existing.isFile() && existing.size > 0) {
        return this.toAppProtocolUrl(target)
      }
    } catch {
      // Not rendered yet.
    }
    try {
      const ffmpeg = await ffmpegManager.ensureInitialized()
      // Write to a unique temp name so two rows racing on the same file cannot
      // leave a half-written JPEG behind for the next launch to read.
      const temporary = `${target}.${process.pid}.tmp`
      // A clip shorter than the seek yields no frame, so fall back to frame one.
      for (const seek of isVideoSource(source.path) ? [VIDEO_SEEK_SECONDS, 0] : [0]) {
        try {
          await execFileAsync(ffmpeg, buildPosterArgs(source.path, temporary, seek), {
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
      return null
    }
  }
}

export const localPosterCache = new LocalPosterCache()
