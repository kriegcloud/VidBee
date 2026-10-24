import { spawn } from 'node:child_process'
import type { SourceAdmission } from '@vidbee/task-queue/source-admission'
import type { DownloadRuntimeSettings } from './types'

const MAX_OUTPUT_BYTES = 32 * 1024 * 1024
const MAX_ERROR_BYTES = 4096
const MAP_TIMEOUT_MS = 10 * 60 * 1000

/** Binaries and cookie arguments a profile mapper needs from its host. */
export interface GalleryDlProfileMapRuntime {
  admission?: SourceAdmission
  resolveGalleryDlPath: () => string
  resolveYtDlpPath: () => string
  resolveGalleryDlArgs?: (settings?: DownloadRuntimeSettings, url?: string) => readonly string[]
}

export interface GalleryDlJsonRun {
  stdout: string
  error?: string
  complete: boolean
}

/**
 * Run a mapper binary that streams newline-delimited JSON, bounded by output
 * size and wall clock so a runaway traversal cannot exhaust memory.
 */
export const runGalleryDlJson = (
  binary: string,
  args: string[],
  signal: AbortSignal,
  label: string,
  onLine?: (line: string) => void
): Promise<GalleryDlJsonRun> =>
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
        ? `${label} mapping timed out.`
        : exceeded
          ? `${label} mapping exceeded its output limit.`
          : code !== 0 && !signal.aborted
            ? stderr.trim() || `${label} mapper exited with code ${code}.`
            : undefined
      resolve({ stdout, error, complete: code === 0 && !signal.aborted && !exceeded })
    })
  })

/** Arguments shared by every gallery-dl traversal that only reads metadata. */
export const GALLERY_DL_MAP_ARGS = [
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
  '1'
] as const

/**
 * Metadata of one `Message.Url` event from a `-j --output.jsonl` traversal.
 * gallery-dl writes each event as `[type, url, metadata]`; type 3 is a URL.
 */
export const galleryDlUrlMetadata = (line: string): Record<string, unknown> | null => {
  let message: unknown
  try {
    message = JSON.parse(line)
  } catch {
    return null
  }
  if (!(Array.isArray(message) && message[0] === 3)) {
    return null
  }
  const metadata: unknown = message[2]
  return metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : null
}
