import { existsSync } from 'node:fs'
import { resolveYtDlpWrapCtor } from '@vidbee/downloader-core/yt-dlp-wrap'
import YTDlpWrap from 'yt-dlp-wrap-plus'
import { scopedLoggers } from '../utils/logger'

const YTDlpWrapCtor = resolveYtDlpWrapCtor<typeof YTDlpWrap>(YTDlpWrap)
type YTDlpWrapInstance = InstanceType<typeof YTDlpWrapCtor>

export interface YtDlpActivation {
  jsRuntimePath: string
  ytDlpPath: string
}

interface YtDlpManagerLogger {
  info: (message: string) => void
  warn: (message: string) => void
}

/**
 * Hold the explicitly activated yt-dlp and JavaScript runtime pair.
 */
export class YtDlpManager {
  private jsRuntimeArgs: string[] = []
  private readonly logger: YtDlpManagerLogger
  private ytdlpInstance: YTDlpWrapInstance | null = null
  private ytdlpPath: string | null = null

  /**
   * Create a manager with an overridable logger for isolated tests.
   */
  constructor(logger: YtDlpManagerLogger = scopedLoggers.engine) {
    this.logger = logger
  }

  /**
   * Atomically switch future commands to a verified kernel pair.
   */
  activate(paths: YtDlpActivation): void {
    const ytdlpInstance = new YTDlpWrapCtor(paths.ytDlpPath)
    const jsRuntimeArgs = this.buildJsRuntimeArgs(paths.jsRuntimePath)
    this.ytdlpPath = paths.ytDlpPath
    this.ytdlpInstance = ytdlpInstance
    this.jsRuntimeArgs = jsRuntimeArgs
    this.logger.info(
      `yt-dlp kernel activated: yt-dlp=${paths.ytDlpPath} node=${paths.jsRuntimePath}`
    )
  }

  /**
   * Return the wrapper bound to the active bundle.
   */
  getInstance(): YTDlpWrapInstance {
    if (!this.ytdlpInstance) {
      throw new Error('yt-dlp kernel is not activated')
    }
    return this.ytdlpInstance
  }

  /**
   * Return the executable path bound to the active bundle.
   */
  getPath(): string {
    if (!this.ytdlpPath) {
      throw new Error('yt-dlp kernel is not activated')
    }
    return this.ytdlpPath
  }

  /**
   * Report whether a verified bundle has been activated.
   */
  isReady(): boolean {
    return Boolean(this.ytdlpPath && this.ytdlpInstance)
  }

  /**
   * Return a defensive copy of the active JavaScript runtime arguments.
   */
  getJsRuntimeArgs(): string[] {
    return [...this.jsRuntimeArgs]
  }

  /**
   * Build `--js-runtimes` for EJS. yt-dlp defaults to Deno; VidBee uses the
   * bundled Node LTS so the installer does not also ship a Deno binary.
   */
  private buildJsRuntimeArgs(managedNodePath: string): string[] {
    const runtime = (process.env.YTDLP_JS_RUNTIME || 'node').trim()
    if (!runtime || runtime === 'none') {
      return []
    }

    const overridePath = process.env.YTDLP_JS_RUNTIME_PATH?.trim()
    if (overridePath && existsSync(overridePath)) {
      return ['--js-runtimes', `${runtime}:${overridePath}`]
    }
    if (overridePath) {
      this.logger.warn(
        `YTDLP_JS_RUNTIME_PATH does not exist; using the managed runtime: ${overridePath}`
      )
    }
    if (runtime === 'node' || runtime === 'deno') {
      return ['--js-runtimes', `${runtime}:${managedNodePath}`]
    }
    return ['--js-runtimes', runtime]
  }
}

export const ytdlpManager = new YtDlpManager()
