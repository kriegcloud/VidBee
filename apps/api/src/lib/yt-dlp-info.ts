/**
 * Stateless yt-dlp metadata client used by `videoInfo` and `playlist.info`.
 * Replaces the equivalent calls on `DownloaderCore`, which the API layer
 * no longer instantiates after NEX-131.
 */
import { execSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import type {
  DownloadRuntimeSettings,
  PlaylistInfo,
  VideoFormat,
  VideoInfo
} from '@vidbee/downloader-core'
import {
  buildPlaylistInfoArgs,
  buildVideoInfoArgs,
  mapPlaylistInfo,
  retryTransientYtDlpNetworkError
} from '@vidbee/downloader-core'

interface RawVideoInfo {
  id?: string
  title?: string
  thumbnail?: string | null
  duration?: number | null
  extractor_key?: string | null
  webpage_url?: string | null
  description?: string | null
  view_count?: number | null
  uploader?: string | null
  tags?: unknown
  formats?: Array<{
    format_id?: string | null
    ext?: string | null
    width?: number | null
    height?: number | null
    fps?: number | null
    vcodec?: string | null
    acodec?: string | null
    filesize?: number | null
    filesize_approx?: number | null
    format_note?: string | null
    tbr?: number | null
    quality?: number | null
    protocol?: string | null
    language?: string | null
    video_ext?: string | null
    audio_ext?: string | null
  }>
}

const trim = (v?: string | null): string => v?.trim() ?? ''
const optString = (v: unknown): string | undefined => {
  if (typeof v !== 'string') {
    return undefined
  }
  const t = v.trim()
  return t.length ? t : undefined
}
const optNumber = (v: unknown): number | undefined =>
  typeof v === 'number' && !Number.isNaN(v) ? v : undefined

const optStringArray = (v: unknown): string[] | undefined => {
  if (!Array.isArray(v)) {
    return undefined
  }
  const list = v
    .filter((e): e is string => typeof e === 'string')
    .map((e) => e.trim())
    .filter((e) => e.length > 0)
  return list.length ? list : undefined
}

let cachedYtDlpPath: string | null = null
const resolveYtDlpPath = (): string => {
  if (cachedYtDlpPath && fs.existsSync(cachedYtDlpPath)) {
    return cachedYtDlpPath
  }
  const env = trim(process.env.YTDLP_PATH)
  if (env && fs.existsSync(env)) {
    cachedYtDlpPath = env
    return env
  }
  try {
    const out = execSync(process.platform === 'win32' ? 'where yt-dlp' : 'which yt-dlp', {
      stdio: ['ignore', 'pipe', 'ignore']
    })
      .toString()
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find((s) => s.length > 0)
    if (out && fs.existsSync(out)) {
      cachedYtDlpPath = out
      return out
    }
  } catch {
    /* noop */
  }
  throw new Error('yt-dlp binary not found. Set YTDLP_PATH or install yt-dlp in PATH.')
}

const runYtDlp = (args: string[]): Promise<string> =>
  new Promise((resolve, reject) => {
    const ytDlp = resolveYtDlpPath()
    const child = spawn(ytDlp, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (c) => {
      stdout += c.toString()
    })
    child.stderr.on('data', (c) => {
      stderr += c.toString()
    })
    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0 && stdout.trim()) {
        resolve(stdout)
      } else {
        reject(new Error(stderr.trim() || `yt-dlp exited with code ${code ?? -1}`))
      }
    })
  })

const parseVideoInfoPayload = (stdout: string): RawVideoInfo => {
  try {
    return JSON.parse(stdout) as RawVideoInfo
  } catch (err) {
    const firstLine = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.startsWith('{') || line.startsWith('['))
    if (!firstLine) {
      throw err
    }
    return JSON.parse(firstLine) as RawVideoInfo
  }
}

export async function fetchVideoInfo(
  url: string,
  settings: DownloadRuntimeSettings = {}
): Promise<VideoInfo> {
  const target = url.trim()
  if (!target) {
    throw new Error('URL is required.')
  }
  const args = buildVideoInfoArgs(target, settings)
  const stdout = await retryTransientYtDlpNetworkError(() => runYtDlp(args))
  const raw = parseVideoInfoPayload(stdout)
  const formats: VideoFormat[] = (raw.formats ?? []).map((f) => ({
    formatId: f.format_id ?? 'unknown',
    ext: f.ext ?? 'unknown',
    width: optNumber(f.width),
    height: optNumber(f.height),
    fps: optNumber(f.fps),
    vcodec: optString(f.vcodec),
    acodec: optString(f.acodec),
    filesize: optNumber(f.filesize),
    filesizeApprox: optNumber(f.filesize_approx),
    formatNote: optString(f.format_note),
    tbr: optNumber(f.tbr),
    quality: optNumber(f.quality),
    protocol: optString(f.protocol),
    language: optString(f.language),
    videoExt: optString(f.video_ext),
    audioExt: optString(f.audio_ext)
  }))
  return {
    id: raw.id ?? target,
    title: raw.title ?? target,
    thumbnail: optString(raw.thumbnail),
    duration: optNumber(raw.duration),
    extractorKey: optString(raw.extractor_key),
    webpageUrl: optString(raw.webpage_url),
    description: optString(raw.description),
    viewCount: optNumber(raw.view_count),
    uploader: optString(raw.uploader),
    tags: optStringArray(raw.tags),
    formats
  }
}

export async function fetchPlaylistInfo(
  url: string,
  settings: DownloadRuntimeSettings = {}
): Promise<PlaylistInfo> {
  const target = url.trim()
  if (!target) {
    throw new Error('URL is required.')
  }
  const args = buildPlaylistInfoArgs(target, settings)
  const stdout = await retryTransientYtDlpNetworkError(() => runYtDlp(args))
  return mapPlaylistInfo(JSON.parse(stdout), target)
}
