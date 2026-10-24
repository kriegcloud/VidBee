import { spawn } from 'node:child_process'
import type { SourceAdmission } from '@vidbee/task-queue/source-admission'
import { buildGalleryDlRuntimeArgs } from './instagram-profile'
import { mapPlaylistInfo } from './playlist-plan'
import type { SocialMappedItem } from './social-media-service'
import type { DownloadRuntimeSettings } from './types'
import { buildPlaylistInfoArgs } from './yt-dlp-args'

const MAX_OUTPUT_BYTES = 32 * 1024 * 1024
const MAX_ERROR_BYTES = 4096
const MAP_TIMEOUT_MS = 10 * 60 * 1000
const PHOTO_ID = /^\d+$/

export interface FacebookProfileMapRuntime {
  admission?: SourceAdmission
  resolveGalleryDlPath: () => string
  resolveYtDlpPath: () => string
  resolveGalleryDlArgs?: (settings?: DownloadRuntimeSettings, url?: string) => readonly string[]
}

const runJson = (
  binary: string,
  args: string[],
  signal: AbortSignal,
  onLine?: (line: string) => void
): Promise<{ stdout: string; error?: string; complete: boolean }> =>
  new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      windowsHide: true
    })
    let stdout = ''
    let stderr = ''
    let pending = ''
    let exceeded = false
    let timedOut = false
    const stop = () => {
      if (child.pid) {
        try {
          process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGKILL')
        } catch {
          // The process has already exited.
        }
      }
    }
    const timer = setTimeout(() => {
      timedOut = true
      stop()
    }, MAP_TIMEOUT_MS)
    signal.addEventListener('abort', stop, { once: true })
    child.stdout?.on('data', (data: Buffer) => {
      const chunk = data.toString('utf8')
      if (stdout.length + chunk.length > MAX_OUTPUT_BYTES) {
        exceeded = true
        stop()
        return
      }
      if (!onLine) {
        stdout += chunk
        return
      }
      pending += chunk
      let lineEnd = pending.indexOf('\n')
      while (lineEnd !== -1) {
        onLine(pending.slice(0, lineEnd))
        pending = pending.slice(lineEnd + 1)
        lineEnd = pending.indexOf('\n')
      }
      stdout += chunk
    })
    child.stderr?.on('data', (data: Buffer) => {
      stderr = `${stderr}${data.toString('utf8')}`.slice(-MAX_ERROR_BYTES)
    })
    child.once('error', (failure) => {
      clearTimeout(timer)
      signal.removeEventListener('abort', stop)
      reject(failure)
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      signal.removeEventListener('abort', stop)
      if (pending && onLine) {
        onLine(pending)
      }
      const error = timedOut
        ? 'Facebook mapping timed out.'
        : exceeded
          ? 'Facebook mapping exceeded its output limit.'
          : code !== 0 && !signal.aborted
            ? stderr.trim() || `Facebook mapper exited with code ${code}.`
            : undefined
      resolve({ stdout, error, complete: code === 0 && !signal.aborted && !exceeded })
    })
  })

/** Map stable photo/reel links; signed media URLs and cookies never enter the saved profile. */
const mapFacebookProfileUnchecked = async (
  url: string,
  category: 'photos' | 'albums' | 'reels',
  owner: string,
  runtime: FacebookProfileMapRuntime,
  settings: DownloadRuntimeSettings | undefined,
  signal: AbortSignal,
  onItem: (item: SocialMappedItem) => void
): Promise<{ complete: boolean; error?: string }> => {
  if (category === 'reels') {
    const result = await runJson(
      runtime.resolveYtDlpPath(),
      buildPlaylistInfoArgs(url, settings ?? {}),
      signal
    )
    if (!result.complete) {
      return { complete: false, error: result.error }
    }
    const playlist = mapPlaylistInfo(JSON.parse(result.stdout), url)
    for (const entry of playlist.entries) {
      onItem({
        id: entry.id,
        url: entry.url,
        author: owner,
        title: entry.title,
        images: 0,
        videos: 1
      })
    }
    return { complete: true }
  }
  let mappedCount = 0
  const onLine = (line: string) => {
    let message: unknown
    try {
      message = JSON.parse(line)
    } catch {
      return
    }
    if (!(Array.isArray(message) && message[0] === 3)) {
      return
    }
    const metadata: unknown = message[2]
    if (!(metadata && typeof metadata === 'object' && 'id' in metadata)) {
      return
    }
    const id = String(metadata.id)
    if (!PHOTO_ID.test(id)) {
      return
    }
    mappedCount += 1
    onItem({
      id,
      url: `https://www.facebook.com/photo/?fbid=${id}`,
      author: owner,
      images: 1,
      videos: 0
    })
  }
  const extraArgs =
    runtime.resolveGalleryDlArgs?.(settings, url) ?? buildGalleryDlRuntimeArgs(settings)
  const result = await runJson(
    runtime.resolveGalleryDlPath(),
    [
      '--config-ignore',
      '--no-input',
      '--no-colors',
      '-j',
      '-o',
      'output.jsonl=true',
      '--sleep-request',
      '1',
      '--sleep-429',
      '60',
      '--retries',
      '1',
      ...extraArgs,
      url
    ],
    signal,
    onLine
  )
  if (result.complete && mappedCount === 0) {
    return {
      complete: false,
      error: 'No accessible Facebook photos were found. Check profile access and cookie settings.'
    }
  }
  return { complete: result.complete, error: result.error }
}

export const mapFacebookProfile = async (
  url: string,
  category: 'photos' | 'albums' | 'reels',
  owner: string,
  runtime: FacebookProfileMapRuntime,
  settings: DownloadRuntimeSettings | undefined,
  signal: AbortSignal,
  onItem: (item: SocialMappedItem) => void
): Promise<{ complete: boolean; error?: string }> => {
  const release = await runtime.admission?.acquire(url, signal)
  try {
    return await mapFacebookProfileUnchecked(
      url,
      category,
      owner,
      runtime,
      settings,
      signal,
      onItem
    )
  } finally {
    release?.()
  }
}
