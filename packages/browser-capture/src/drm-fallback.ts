import type {
  Executor,
  ExecutorContext,
  ExecutorEvents,
  ExecutorFinishEvent,
  ExecutorRun
} from '@vidbee/task-queue'
import { isBrowserCaptureAvailable } from './availability'
import {
  BROWSER_CAPTURE_REQUESTED_MESSAGE,
  BROWSER_CAPTURE_UNAVAILABLE_MESSAGE,
  DRM_FALLBACK_MESSAGE,
  isDrmProtectedMessage
} from './drm'

const isDrmFinish = (event: ExecutorFinishEvent): boolean => {
  if (event.result.type !== 'error') {
    return false
  }
  return isDrmProtectedMessage(
    `${event.result.error.rawMessage}\n${event.stderrTail}\n${event.stdoutTail}`
  )
}

const isCaptureRequested = (ctx: ExecutorContext): boolean =>
  ctx.input.options?.browserCapture === true

/**
 * Run yt-dlp (or another primary executor) first. When decoding is impossible
 * because of CDM DRM, fall back to recording headed Chromium on Xvfb.
 *
 * A task created with `options.browserCapture: true` skips the primary and
 * records the playback page directly, provided capture is available here.
 */
export class DrmFallbackExecutor implements Executor {
  constructor(
    private readonly primary: Executor,
    private readonly capture: Executor,
    private readonly isAvailable: () => boolean = isBrowserCaptureAvailable
  ) {}

  run(ctx: ExecutorContext, events: ExecutorEvents): ExecutorRun {
    if (isCaptureRequested(ctx)) {
      const available = this.isAvailable()
      events.onStd({
        taskId: ctx.taskId,
        attemptId: ctx.attemptId,
        stream: 'stderr',
        line: available ? BROWSER_CAPTURE_REQUESTED_MESSAGE : BROWSER_CAPTURE_UNAVAILABLE_MESSAGE
      })
      if (available) {
        return this.capture.run(ctx, events)
      }
    }

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
