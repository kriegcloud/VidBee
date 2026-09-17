import type {
  Executor,
  ExecutorContext,
  ExecutorEvents,
  ExecutorFinishEvent,
  ExecutorRun
} from '@vidbee/task-queue'
import { isBrowserCaptureAvailable } from './availability'
import { DRM_FALLBACK_MESSAGE, isDrmProtectedMessage } from './drm'

const isDrmFinish = (event: ExecutorFinishEvent): boolean => {
  if (event.result.type !== 'error') {
    return false
  }
  return isDrmProtectedMessage(
    `${event.result.error.rawMessage}\n${event.stderrTail}\n${event.stdoutTail}`
  )
}

/**
 * Run yt-dlp (or another primary executor) first. When decoding is impossible
 * because of CDM DRM, fall back to recording headed Chromium on Xvfb.
 */
export class DrmFallbackExecutor implements Executor {
  constructor(
    private readonly primary: Executor,
    private readonly capture: Executor,
    private readonly isAvailable: () => boolean = isBrowserCaptureAvailable
  ) {}

  run(ctx: ExecutorContext, events: ExecutorEvents): ExecutorRun {
    let active: ExecutorRun | null = null
    let captureStarted = false

    const wrapped: ExecutorEvents = {
      onSpawn: events.onSpawn,
      onProgress: events.onProgress,
      onStd: events.onStd,
      onFinish: (event) => {
        if (captureStarted || !isDrmFinish(event) || !this.isAvailable()) {
          events.onFinish(event)
          return
        }
        captureStarted = true
        events.onStd({
          taskId: ctx.taskId,
          attemptId: ctx.attemptId,
          stream: 'stderr',
          line: DRM_FALLBACK_MESSAGE
        })
        active = this.capture.run(ctx, events)
      }
    }

    active = this.primary.run(ctx, wrapped)
    return {
      cancel: (timeout) => active?.cancel(timeout) ?? Promise.resolve(),
      pause: () => active?.pause() ?? Promise.resolve()
    }
  }
}
