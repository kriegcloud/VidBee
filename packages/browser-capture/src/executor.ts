import { type ChildProcess, spawn } from 'node:child_process'
import { mkdir, mkdtemp, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { DownloadRuntimeSettings, YtDlpTaskOptions } from '@vidbee/downloader-core'
import { parseBrowserCookiesSetting } from '@vidbee/downloader-core/browser-cookies-setting'
import { getBrowserProfileCandidates } from '@vidbee/downloader-core/cookie-browser-paths'
import { sanitizePathSegment } from '@vidbee/downloader-core/output-path'
import {
  type ClassifiedError,
  type Executor,
  type ExecutorContext,
  type ExecutorEvents,
  type ExecutorRun,
  type TaskOutput,
  virtualError
} from '@vidbee/task-queue'
import { killProcessTree } from '@vidbee/task-queue/process'
import {
  DEFAULT_CAPTURE_SIZE,
  isBrowserCaptureAvailable,
  resolveBrowserExecutable,
  userHomeDir
} from './availability'
import { readLocalStorageValue } from './local-storage'
import { type CaptureJob, parseSidecarEvent } from './protocol'

export interface BrowserCaptureExecutorOptions {
  resolveSidecarScript: () => string
  resolveFfmpegPath: () => string
  defaultDownloadDir: string
  execPath?: string
  execArgv?: string[]
  killGraceMs?: number
  env?: NodeJS.ProcessEnv
}

const DEFAULT_KILL_GRACE_MS = 10_000
const STDOUT_TAIL_BYTES = 8 * 1024
const STDERR_TAIL_BYTES = 8 * 1024

const createTailBuffer = (maxBytes: number) => {
  let buffer = ''
  return {
    append(text: string) {
      buffer += text
      if (buffer.length > maxBytes * 4) {
        buffer = buffer.slice(buffer.length - maxBytes)
      }
    },
    read() {
      return buffer.length > maxBytes ? buffer.slice(buffer.length - maxBytes) : buffer
    }
  }
}

type LineTail = ReturnType<typeof createTailBuffer>

const readTaskOptions = (ctx: ExecutorContext): YtDlpTaskOptions => {
  const options = ctx.input.options
  return options && typeof options === 'object' ? (options as YtDlpTaskOptions) : {}
}

const classifyCaptureError = (message: string): ClassifiedError => {
  const text = message.toLowerCase()
  if (text.includes('xvfb') || text.includes('ffmpeg') || text.includes('browser found')) {
    return virtualError('binary-missing', message)
  }
  if (text.includes('sign in') || text.includes('login') || text.includes('cookie')) {
    return virtualError('auth-required', message)
  }
  if (text.includes('cancel')) {
    return virtualError('cancelled-by-user', message)
  }
  return virtualError('unknown', message)
}

const resolveOutputPath = async (
  ctx: ExecutorContext,
  options: YtDlpTaskOptions,
  defaultDownloadDir: string
): Promise<string> => {
  const settings = options.settings
  const directory =
    options.customDownloadPath?.trim() ||
    settings?.downloadPath?.trim() ||
    options.downloadPath?.trim() ||
    defaultDownloadDir
  await mkdir(directory, { recursive: true })
  const title = sanitizePathSegment(ctx.input.title || options.title || 'video') || 'video'
  const dest = path.join(directory, `${title} (browser capture).mp4`)
  try {
    await stat(dest)
    return path.join(directory, `${title} (browser capture) ${Date.now()}.mp4`)
  } catch {
    return dest
  }
}

const resolveBcToken = async (settings?: DownloadRuntimeSettings): Promise<string | null> => {
  const browser = parseBrowserCookiesSetting(settings?.browserForCookies).browser
  const names =
    browser && browser !== 'none'
      ? [browser]
      : ['brave', 'chrome', 'chromium', 'edge', 'vivaldi', 'opera']
  const home = userHomeDir()
  for (const name of names) {
    for (const profile of getBrowserProfileCandidates(process.platform, home, name)) {
      const token = await readLocalStorageValue(profile, 'bcTokenSha')
      if (token) {
        return token
      }
    }
  }
  return null
}

const makeNoopRun = (): ExecutorRun => ({
  cancel: async () => undefined,
  pause: async () => undefined
})

/**
 * Spawn the headed-browser sidecar and record the virtual display with ffmpeg.
 */
export class BrowserCaptureExecutor implements Executor {
  private readonly opts: BrowserCaptureExecutorOptions

  constructor(options: BrowserCaptureExecutorOptions) {
    this.opts = options
  }

  run(ctx: ExecutorContext, events: ExecutorEvents): ExecutorRun {
    if (!isBrowserCaptureAvailable()) {
      const error = virtualError(
        'binary-missing',
        'In-browser capture needs Linux, Xvfb, and Chrome/Brave/Edge with Widevine.'
      )
      queueMicrotask(() => {
        events.onFinish({
          taskId: ctx.taskId,
          attemptId: ctx.attemptId,
          result: { type: 'error', error, exitCode: null },
          closedAt: Date.now(),
          stdoutTail: '',
          stderrTail: error.rawMessage
        })
      })
      return makeNoopRun()
    }

    const abort = new AbortController()
    let child: ChildProcess | null = null
    let settled = false
    const stdoutTail = createTailBuffer(STDOUT_TAIL_BYTES)
    const stderrTail = createTailBuffer(STDERR_TAIL_BYTES)

    const finishOnce = (
      result:
        | { type: 'success'; output: TaskOutput }
        | { type: 'error'; error: ClassifiedError; exitCode: number | null }
        | { type: 'cancelled' }
    ): void => {
      if (settled) {
        return
      }
      settled = true
      events.onFinish({
        taskId: ctx.taskId,
        attemptId: ctx.attemptId,
        result,
        closedAt: Date.now(),
        stdoutTail: stdoutTail.read(),
        stderrTail: stderrTail.read()
      })
    }

    queueMicrotask(() => {
      void this.execute(
        ctx,
        events,
        abort,
        (proc) => {
          child = proc
        },
        stdoutTail,
        stderrTail
      )
        .then((output) => {
          finishOnce({ type: 'success', output })
        })
        .catch((error: unknown) => {
          if (abort.signal.aborted) {
            finishOnce({ type: 'cancelled' })
            return
          }
          const message = error instanceof Error ? error.message : String(error)
          finishOnce({
            type: 'error',
            error: classifyCaptureError(message),
            exitCode: 1
          })
        })
    })

    const cancel = async (timeout?: number): Promise<void> => {
      abort.abort()
      killProcessTree(child?.pid, 'SIGTERM')
      const grace = timeout ?? this.opts.killGraceMs ?? DEFAULT_KILL_GRACE_MS
      await new Promise((resolve) => setTimeout(resolve, Math.min(grace, 2000)))
      if (!settled) {
        killProcessTree(child?.pid, 'SIGKILL')
      }
    }

    return {
      cancel,
      pause: () => cancel()
    }
  }

  private async execute(
    ctx: ExecutorContext,
    events: ExecutorEvents,
    abort: AbortController,
    attach: (child: ChildProcess) => void,
    stdoutTail: LineTail,
    stderrTail: LineTail
  ): Promise<TaskOutput> {
    const options = readTaskOptions(ctx)
    const settings = options.settings
    const ffmpegPath = this.opts.resolveFfmpegPath()
    const browserExecutable = resolveBrowserExecutable(settings?.browserForCookies)
    if (!browserExecutable) {
      throw new Error('No Chromium-family browser found to play DRM media')
    }
    const outputPath = await resolveOutputPath(ctx, options, this.opts.defaultDownloadDir)
    const bcToken = await resolveBcToken(settings)
    const job: CaptureJob = {
      url: ctx.input.url,
      outputPath,
      ffmpegPath,
      cookiesPath: settings?.cookiesPath?.trim() || undefined,
      browserExecutable,
      width: DEFAULT_CAPTURE_SIZE.width,
      height: DEFAULT_CAPTURE_SIZE.height,
      durationHintSec: typeof options.duration === 'number' ? options.duration : undefined,
      localStorage: bcToken ? { bcTokenSha: bcToken } : undefined
    }
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'vidbee-capture-'))
    const jobPath = path.join(tmp, 'job.json')
    await writeFile(jobPath, `${JSON.stringify(job)}\n`)

    const execPath = this.opts.execPath ?? process.execPath
    const args = [...(this.opts.execArgv ?? []), this.opts.resolveSidecarScript(), '--job', jobPath]
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...this.opts.env,
      ELECTRON_RUN_AS_NODE: '1'
    }
    const child = spawn(execPath, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    if (!child.pid) {
      throw new Error('Failed to spawn browser-capture sidecar')
    }
    attach(child)
    events.onSpawn({
      taskId: ctx.taskId,
      attemptId: ctx.attemptId,
      pid: child.pid,
      pidStartedAt: null,
      kind: 'ffmpeg',
      spawnedAt: Date.now()
    })

    abort.signal.addEventListener('abort', () => {
      killProcessTree(child.pid, 'SIGTERM')
    })

    let ticks = 0
    const captureResult: {
      filePath?: string
      durationMs?: number | null
      error?: string
    } = {}

    const handleLine = (stream: 'stdout' | 'stderr', line: string): void => {
      if (stream === 'stdout') {
        stdoutTail.append(`${line}\n`)
      } else {
        stderrTail.append(`${line}\n`)
      }
      const event = parseSidecarEvent(line)
      if (!event) {
        if (line.trim()) {
          events.onStd({
            taskId: ctx.taskId,
            attemptId: ctx.attemptId,
            stream,
            line
          })
        }
        return
      }
      if (event.type === 'log') {
        events.onStd({
          taskId: ctx.taskId,
          attemptId: ctx.attemptId,
          stream: 'stdout',
          line: event.message
        })
        return
      }
      if (event.type === 'progress') {
        ticks += 1
        events.onProgress({
          taskId: ctx.taskId,
          attemptId: ctx.attemptId,
          enteredProcessing: event.percent > 0.95,
          progress: {
            percent: event.percent,
            bytesDownloaded: null,
            bytesTotal: null,
            speedBps: null,
            etaMs:
              event.duration > event.currentTime
                ? Math.round((event.duration - event.currentTime) * 1000)
                : null,
            ticks
          }
        })
        return
      }
      if (event.type === 'done') {
        captureResult.filePath = event.filePath
        captureResult.durationMs = event.durationMs
        return
      }
      if (event.type === 'error') {
        captureResult.error = event.message
      }
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString().split(/\r?\n/)) {
        handleLine('stdout', line)
      }
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString().split(/\r?\n/)) {
        handleLine('stderr', line)
      }
    })

    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code) => resolve(code))
    })
    if (captureResult.error) {
      throw new Error(captureResult.error)
    }
    if (abort.signal.aborted) {
      throw new Error('Capture cancelled')
    }
    const filePath = captureResult.filePath
    if (!filePath || exitCode !== 0) {
      throw new Error(stderrTail.read() || `browser-capture sidecar exited ${exitCode ?? -1}`)
    }
    const info = await stat(filePath)
    return {
      filePath,
      size: info.size,
      durationMs: captureResult.durationMs ?? null,
      sha256: null,
      formatId: 'browser-capture'
    }
  }
}
