/**
 * GalleryDlExecutor — local-patch addition. Implements the @vidbee/task-queue
 * `Executor` interface using `gallery-dl` for sites yt-dlp can't handle
 * (Instagram image posts & carousels, etc.).
 *
 * Mirrors YtDlpExecutor's lifecycle (onSpawn → onStd* → onFinish) so the
 * orchestrator can treat both interchangeably via `HostRoutingExecutor`.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'

import {
  virtualError,
  type Executor,
  type ExecutorContext,
  type ExecutorEvents,
  type ExecutorRun,
  type TaskOutput
} from '@vidbee/task-queue'

import type { YtDlpTaskOptions } from '@vidbee/downloader-core'

const DEFAULT_KILL_GRACE_MS = 10_000
const STDOUT_TAIL_BYTES = 8 * 1024
const STDERR_TAIL_BYTES = 8 * 1024

const SEQUENTIAL_TEMPLATE_REGEX = /^(\d+)\.%\(ext\)s$/

export interface GalleryDlExecutorOptions {
  /** gallery-dl binary path. Lazy so resolution can defer to runtime. */
  resolveBinaryPath: () => string
  /** Default download dir if a task does not provide one. */
  defaultDownloadDir: string
  /**
   * Returns extra cookie/proxy/etc. flags to splice into the argv. Lazy so
   * the executor picks up live settings on every spawn.
   */
  resolveExtraArgs?: () => readonly string[]
  /** Grace period between SIGTERM and SIGKILL. Default 10s. */
  killGraceMs?: number
  /** Test seam. Defaults to Date.now. */
  clock?: () => number
}

interface TailBuffer {
  append: (text: string) => void
  read: () => string
}

const createTailBuffer = (maxBytes: number): TailBuffer => {
  let buf = ''
  return {
    append(text) {
      buf += text
      if (buf.length > maxBytes * 4) {
        buf = buf.slice(buf.length - maxBytes)
      }
    },
    read() {
      return buf.length > maxBytes ? buf.slice(buf.length - maxBytes) : buf
    }
  }
}

/**
 * Translate the yt-dlp sequential template (`<N>.%(ext)s`) into gallery-dl's
 * Python-format syntax. Carousels expand `{num}` per item so a single
 * reserved index N covers all images in one post without colliding:
 *   single image  → `5.1.webp`
 *   3-up carousel → `5.1.webp`, `5.2.jpg`, `5.3.webp`
 */
const resolveFilenameTemplate = (customFilenameTemplate: string | undefined): string => {
  const trimmed = customFilenameTemplate?.trim() ?? ''
  if (!trimmed) {
    return '{num}.{extension}'
  }
  const seq = SEQUENTIAL_TEMPLATE_REGEX.exec(trimmed)
  if (seq) {
    return `${seq[1]}.{num}.{extension}`
  }
  // Fall back to gallery-dl's default if the template isn't ours — yt-dlp
  // templates use `%(...)s` placeholders that gallery-dl can't interpret.
  return '{num}.{extension}'
}

const buildArgs = (
  url: string,
  downloadDir: string,
  filenameTemplate: string,
  extraArgs: readonly string[]
): string[] => {
  return [
    '--directory',
    downloadDir,
    '--filename',
    filenameTemplate,
    // gallery-dl prints one file path per saved item to stdout — we parse
    // those to populate TaskOutput.filePath. Don't pass --quiet here or
    // those lines disappear and the kernel guard reports the task as
    // `output missing or empty` even on a successful run.
    ...extraArgs,
    url
  ]
}

export class GalleryDlExecutor implements Executor {
  private readonly opts: Required<
    Omit<GalleryDlExecutorOptions, 'resolveExtraArgs'>
  > & {
    resolveExtraArgs?: GalleryDlExecutorOptions['resolveExtraArgs']
  }

  constructor(options: GalleryDlExecutorOptions) {
    this.opts = {
      resolveBinaryPath: options.resolveBinaryPath,
      defaultDownloadDir: options.defaultDownloadDir,
      killGraceMs: options.killGraceMs ?? DEFAULT_KILL_GRACE_MS,
      clock: options.clock ?? Date.now,
      resolveExtraArgs: options.resolveExtraArgs
    }
  }

  run(ctx: ExecutorContext, events: ExecutorEvents): ExecutorRun {
    const stdoutTail = createTailBuffer(STDOUT_TAIL_BYTES)
    const stderrTail = createTailBuffer(STDERR_TAIL_BYTES)
    const savedFiles: string[] = []
    let settled = false
    let cancelRequested = false
    let killTimer: NodeJS.Timeout | null = null
    let stdoutCarry = ''

    const finishOnce = (e: Parameters<ExecutorEvents['onFinish']>[0]): void => {
      if (settled) return
      settled = true
      if (killTimer) {
        clearTimeout(killTimer)
        killTimer = null
      }
      events.onFinish(e)
    }

    const opts = (ctx.input.options ?? {}) as YtDlpTaskOptions
    const downloadDir =
      opts.customDownloadPath?.trim() ||
      opts.settings?.downloadPath?.trim() ||
      this.opts.defaultDownloadDir

    const filenameTemplate = resolveFilenameTemplate(opts.customFilenameTemplate)
    const extraArgs = this.opts.resolveExtraArgs ? [...this.opts.resolveExtraArgs()] : []
    const args = buildArgs(ctx.input.url, downloadDir, filenameTemplate, extraArgs)

    let binaryPath: string
    try {
      binaryPath = this.opts.resolveBinaryPath()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      finishOnce({
        taskId: ctx.taskId,
        attemptId: ctx.attemptId,
        result: {
          type: 'error',
          error: virtualError('binary-missing', message),
          exitCode: null
        },
        closedAt: this.opts.clock(),
        stdoutTail: '',
        stderrTail: message
      })
      return makeNoopRun()
    }

    let proc: ChildProcess
    try {
      proc = spawn(binaryPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      finishOnce({
        taskId: ctx.taskId,
        attemptId: ctx.attemptId,
        result: {
          type: 'error',
          error: virtualError('unknown', message),
          exitCode: null
        },
        closedAt: this.opts.clock(),
        stdoutTail: stdoutTail.read(),
        stderrTail: stderrTail.read()
      })
      return makeNoopRun()
    }

    events.onSpawn({
      taskId: ctx.taskId,
      attemptId: ctx.attemptId,
      pid: proc.pid ?? -1,
      pidStartedAt: null,
      // 'yt-dlp' is the only currently-allowed ProcessKind in the schema —
      // reusing it here keeps the projection happy without a kernel change.
      // The host can distinguish gallery-dl tasks via the URL/options.
      kind: 'yt-dlp',
      spawnedAt: this.opts.clock()
    })

    proc.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stdoutTail.append(text)
      // gallery-dl emits one file path per line (sometimes prefixed with `#`
      // for skipped/already-downloaded items). Buffer across chunk
      // boundaries before parsing.
      stdoutCarry += text
      const lines = stdoutCarry.split(/\r?\n/)
      stdoutCarry = lines.pop() ?? ''
      for (const rawLine of lines) {
        const line = rawLine.trimEnd()
        if (line) {
          events.onStd({
            taskId: ctx.taskId,
            attemptId: ctx.attemptId,
            stream: 'stdout',
            line
          })
          const candidate = line.startsWith('# ') ? line.slice(2).trim() : line.trim()
          if (candidate && (candidate.startsWith('/') || /^[A-Za-z]:[\\/]/.test(candidate))) {
            savedFiles.push(candidate)
          }
        }
      }
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderrTail.append(text)
      events.onStd({
        taskId: ctx.taskId,
        attemptId: ctx.attemptId,
        stream: 'stderr',
        line: text.replace(/\r?\n$/, '')
      })
    })

    proc.on('close', (code: number | null) => {
      const closedAt = this.opts.clock()
      const stdout = stdoutTail.read()
      const stderr = stderrTail.read()

      if (cancelRequested) {
        finishOnce({
          taskId: ctx.taskId,
          attemptId: ctx.attemptId,
          result: { type: 'cancelled' },
          closedAt,
          stdoutTail: stdout,
          stderrTail: stderr
        })
        return
      }

      if (code === 0) {
        const filePath = savedFiles[0] ?? ''
        let realSize = 0
        if (filePath) {
          try {
            if (existsSync(filePath)) realSize = statSync(filePath).size
          } catch {
            /* ignore */
          }
        }
        const output: TaskOutput = {
          filePath,
          size: realSize,
          durationMs: null,
          sha256: null,
          formatId: null
        }
        finishOnce({
          taskId: ctx.taskId,
          attemptId: ctx.attemptId,
          result: { type: 'success', output },
          closedAt,
          stdoutTail: stdout,
          stderrTail: stderr
        })
        return
      }

      finishOnce({
        taskId: ctx.taskId,
        attemptId: ctx.attemptId,
        result: {
          type: 'error',
          error: virtualError('unknown', stderr || `gallery-dl exited with code ${code ?? -1}`),
          exitCode: code ?? null
        },
        closedAt,
        stdoutTail: stdout,
        stderrTail: stderr
      })
    })

    proc.on('error', (err: Error) => {
      const closedAt = this.opts.clock()
      if (cancelRequested) {
        finishOnce({
          taskId: ctx.taskId,
          attemptId: ctx.attemptId,
          result: { type: 'cancelled' },
          closedAt,
          stdoutTail: stdoutTail.read(),
          stderrTail: stderrTail.read()
        })
        return
      }
      finishOnce({
        taskId: ctx.taskId,
        attemptId: ctx.attemptId,
        result: {
          type: 'error',
          error: virtualError('unknown', err.message),
          exitCode: null
        },
        closedAt,
        stdoutTail: stdoutTail.read(),
        stderrTail: stderrTail.read()
      })
    })

    const cancel = async (timeout?: number): Promise<void> => {
      if (settled) return
      cancelRequested = true
      const grace = timeout ?? this.opts.killGraceMs
      try {
        proc.kill('SIGTERM')
      } catch {
        /* noop */
      }
      if (killTimer) clearTimeout(killTimer)
      if (grace > 0) {
        killTimer = setTimeout(() => {
          try {
            proc.kill('SIGKILL')
          } catch {
            /* noop */
          }
        }, grace)
      } else {
        try {
          proc.kill('SIGKILL')
        } catch {
          /* noop */
        }
      }
    }

    return {
      cancel,
      pause: () => cancel(this.opts.killGraceMs)
    }
  }
}

const makeNoopRun = (): ExecutorRun => ({
  cancel: async () => {
    /* noop */
  },
  pause: async () => {
    /* noop */
  }
})

const GALLERY_DL_HOSTS = [
  'instagram.com',
  'instagr.am',
  'cdninstagram.com'
] as const

export const shouldUseGalleryDl = (url: string): boolean => {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return GALLERY_DL_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))
  } catch {
    return false
  }
}

/**
 * Per-attempt routing wrapper. Delegates to gallery-dl for image-host URLs
 * and to the supplied yt-dlp executor for everything else. Both arms share
 * the kernel's task lifecycle, so the orchestrator doesn't know which tool
 * actually ran.
 */
export class HostRoutingExecutor implements Executor {
  constructor(
    private readonly ytDlp: Executor,
    private readonly galleryDl: Executor
  ) {}

  run(ctx: ExecutorContext, events: ExecutorEvents): ExecutorRun {
    return shouldUseGalleryDl(ctx.input.url)
      ? this.galleryDl.run(ctx, events)
      : this.ytDlp.run(ctx, events)
  }
}
