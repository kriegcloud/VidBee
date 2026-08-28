import { MINIMAL_MODEL_GROUPS, MINIMAL_MODEL_TIERS } from './model-catalog'
import type { ModelManager } from './model-manager'

export interface MinimalModelFillOptions {
  models: ModelManager
  now?: () => number
  schedule?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>
  delaysMs?: readonly number[]
  logger?: { info?: (message: string) => void; warn?: (message: string, err?: unknown) => void }
  /** Called once the boot model set is on disk. */
  onReady?: () => void
}

const DEFAULT_DELAYS = [0, 5_000, 15_000, 45_000, 120_000, 600_000] as const

/**
 * Silently ensure VAD + speaker + Whisper tiny are on disk. Failures retry
 * with backoff and never surface a dialog.
 */
export const startMinimalModelFill = (opts: MinimalModelFillOptions): { stop: () => void } => {
  const delays = opts.delaysMs ?? DEFAULT_DELAYS
  const schedule = opts.schedule ?? setTimeout
  let stopped = false
  let attempt = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  const run = (): void => {
    if (stopped) {
      return
    }
    void opts.models
      .ensureReady({ groups: MINIMAL_MODEL_GROUPS, tiers: MINIMAL_MODEL_TIERS })
      .then(() => {
        opts.logger?.info?.('transcription: minimal model set ready')
        opts.onReady?.()
      })
      .catch((err) => {
        if (stopped) {
          return
        }
        opts.logger?.warn?.('transcription: minimal model fill failed, will retry', err)
        attempt = Math.min(attempt + 1, delays.length - 1)
        timer = schedule(run, delays[attempt] ?? 600_000)
      })
  }

  timer = schedule(run, delays[0] ?? 0)
  return {
    stop: () => {
      stopped = true
      if (timer) {
        clearTimeout(timer)
      }
    }
  }
}
