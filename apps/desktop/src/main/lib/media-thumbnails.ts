import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { app } from 'electron'
import type { MediaThumbnailRequest, MediaThumbnailResult } from '../../shared/types/media-assets'
import { scopedLoggers } from '../utils/logger'
import { ffmpegManager } from './ffmpeg-manager'
import { classifyMediaPath } from './media-inventory'

const dimensionsPattern = /Stream[^\r\n]*Video:[^\r\n]*?\b([1-9]\d*)x([1-9]\d*)\b/
const inFlight = new Map<string, Promise<MediaThumbnailResult>>()
const failures = new Set<string>()
const pending: {
  run: () => Promise<MediaThumbnailResult>
  finish: (result: MediaThumbnailResult) => void
}[] = []
let active = 0
let codecPromise: Promise<'webp' | 'jpg'> | undefined

const logFailure = (key: string, error: unknown): void => {
  if (failures.has(key) || failures.size >= 256) {
    return
  }
  failures.add(key)
  scopedLoggers.thumbnail.debug('Media thumbnail unavailable', { key, error: String(error) })
}

const runFfmpeg = (binary: string, args: string[]): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(binary, ['-hide_banner', '-nostdin', ...args], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe']
    })
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, 20_000)
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 65_536) {
        stderr += chunk.toString()
      }
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0 && !timedOut) {
        resolve(stderr)
      } else {
        reject(
          new Error(timedOut ? 'Thumbnail process timed out' : `ffmpeg exited ${code}: ${stderr}`)
        )
      }
    })
  })

/** Probe the bundled encoder once; builds without libwebp use JPEG. */
const detectCodec = async (binary: string): Promise<'webp' | 'jpg'> => {
  const directory = await mkdtemp(join(tmpdir(), 'vidbee-webp-'))
  try {
    const sample = join(directory, 'sample.ppm')
    await writeFile(sample, Buffer.concat([Buffer.from('P6\n2 2\n255\n'), Buffer.alloc(12, 128)]))
    try {
      await runFfmpeg(binary, [
        '-i',
        sample,
        '-frames:v',
        '1',
        '-c:v',
        'libwebp',
        '-quality',
        '75',
        join(directory, 'sample.webp')
      ])
      return 'webp'
    } catch {
      return 'jpg'
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

const generate = async (req: MediaThumbnailRequest, key: string): Promise<MediaThumbnailResult> => {
  const directory = join(app.getPath('userData'), 'media-thumbs')
  const metadataPath = join(directory, `${key}.json`)
  for (const extension of ['webp', 'jpg']) {
    const destination = join(directory, `${key}.${extension}`)
    try {
      const metadata: unknown = JSON.parse(await readFile(metadataPath, 'utf8'))
      if (
        (await stat(destination)).size > 0 &&
        metadata &&
        typeof metadata === 'object' &&
        'width' in metadata &&
        'height' in metadata &&
        typeof metadata.width === 'number' &&
        typeof metadata.height === 'number'
      ) {
        return {
          url: `vidbee://media-thumbs/${key}.${extension}`,
          width: metadata.width,
          height: metadata.height
        }
      }
    } catch {
      /* A partial or stale cache entry is regenerated. */
    }
  }
  const binary = await ffmpegManager.ensureInitialized()
  codecPromise ??= detectCodec(binary)
  const extension = await codecPromise
  await mkdir(directory, { recursive: true })
  const destination = join(directory, `${key}.${extension}`)
  const temporary = join(directory, `${key}.tmp.${extension}`)
  const seek = classifyMediaPath(req.path) === 'video' ? ['-ss', '1'] : []
  const encoding =
    extension === 'webp' ? ['-c:v', 'libwebp', '-quality', '75'] : ['-c:v', 'mjpeg', '-q:v', '3']
  try {
    const args = [
      '-i',
      req.path,
      '-vf',
      `scale=w='min(iw,${req.size})':h='min(ih,${req.size})':force_original_aspect_ratio=decrease`,
      '-frames:v',
      '1',
      ...encoding,
      '-y',
      temporary
    ]
    let stderr = await runFfmpeg(binary, [...seek, ...args])
    // Seeking one second can pass EOF on very short clips.
    if (seek.length && !(await stat(temporary)).size) {
      stderr = await runFfmpeg(binary, ['-ss', '0', ...args])
    }
    const dimensions = dimensionsPattern.exec(stderr)
    if (!(dimensions && (await stat(temporary)).size)) {
      throw new Error('Thumbnail or source dimensions missing')
    }
    const metadata = { width: Number(dimensions[1]), height: Number(dimensions[2]) }
    await rename(temporary, destination)
    await writeFile(metadataPath, JSON.stringify(metadata))
    return { url: `vidbee://media-thumbs/${key}.${extension}`, ...metadata }
  } finally {
    await rm(temporary, { force: true })
  }
}

const drain = (): void => {
  while (active < 3 && pending.length) {
    const job = pending.shift()
    if (!job) {
      return
    }
    active += 1
    void (async () => {
      try {
        job.finish(await job.run())
      } finally {
        active -= 1
        drain()
      }
    })()
  }
}

export const cancelPendingMediaThumbnails = (): void => {
  for (const job of pending.splice(0)) {
    job.finish({ url: null })
  }
}

export const getMediaThumbnail = async (
  req: MediaThumbnailRequest
): Promise<MediaThumbnailResult> => {
  if (!isAbsolute(req.path)) {
    return { url: null }
  }
  const size = req.size <= 256 ? 256 : 512
  const key = createHash('sha1').update(`${req.path}|${req.mtimeMs}|${size}`).digest('hex')
  const existing = inFlight.get(key)
  if (existing) {
    return existing
  }
  const result = new Promise<MediaThumbnailResult>((finish) => {
    pending.push({
      finish,
      run: async () => {
        try {
          const info = await stat(req.path)
          if (!info.isFile() || info.mtimeMs !== req.mtimeMs) {
            throw new Error('Source missing or modified')
          }
          return await generate({ ...req, size }, key)
        } catch (error) {
          logFailure(key, error)
          return { url: null }
        }
      }
    })
  })
  inFlight.set(key, result)
  drain()
  try {
    return await result
  } finally {
    inFlight.delete(key)
  }
}
