import type {
  Executor,
  ExecutorContext,
  ExecutorEvents,
  ExecutorFinishEvent,
  ExecutorRun
} from '@vidbee/task-queue'
import { virtualError } from '@vidbee/task-queue'
import { describe, expect, it } from 'vitest'
import { parseNetscapeCookieFile, toPlaywrightCookies } from '../src/cookies'
import { isDrmProtectedMessage, playbackPageUrl } from '../src/drm'
import { DrmFallbackExecutor } from '../src/drm-fallback'
import { encodeSidecarEvent, parseCaptureJob, parseSidecarEvent } from '../src/protocol'
import { evenSize } from '../src/quality'
import { buildRecorderArgs } from '../src/recorder'

describe('playbackPageUrl', () => {
  it('opens the post carousel and keeps the media id for focus', () => {
    expect(playbackPageUrl('https://onlyfans.com/2669829379/kenzeygrey/media/3743089366')).toBe(
      'https://onlyfans.com/2669829379/kenzeygrey?media=3743089366'
    )
  })

  it('opens the chat gallery for a chat media stub', () => {
    expect(playbackPageUrl('https://onlyfans.com/my/chats/chat/123/media/99')).toBe(
      'https://onlyfans.com/my/chats/chat/123/gallery?media=99'
    )
  })
})

describe('isDrmProtectedMessage', () => {
  it('matches yt-dlp DRM failures', () => {
    expect(isDrmProtectedMessage('ERROR: [onlyfans] 1: This video is DRM protected')).toBe(true)
    expect(isDrmProtectedMessage('Requested format is not available')).toBe(false)
  })
})

describe('netscape cookies', () => {
  it('parses HttpOnly rows for Playwright', () => {
    const text = [
      '# Netscape HTTP Cookie File',
      '#HttpOnly_.example.com\tTRUE\t/\tTRUE\t1999999999\tsess\ttest-value'
    ].join('\n')
    const cookies = toPlaywrightCookies(parseNetscapeCookieFile(text))
    expect(cookies).toEqual([
      {
        name: 'sess',
        value: 'test-value',
        domain: 'example.com',
        path: '/',
        expires: 1999999999,
        httpOnly: true,
        secure: true,
        sameSite: 'Lax'
      }
    ])
  })
})

describe('sidecar protocol', () => {
  it('round-trips progress events', () => {
    const line = encodeSidecarEvent({
      type: 'progress',
      percent: 0.25,
      currentTime: 10,
      duration: 40
    })
    expect(parseSidecarEvent(line)).toEqual({
      type: 'progress',
      percent: 0.25,
      currentTime: 10,
      duration: 40
    })
  })

  it('parses a capture job with defaults', () => {
    const job = parseCaptureJob({
      url: 'https://example.com/watch',
      outputPath: '/tmp/out.mp4',
      ffmpegPath: '/usr/bin/ffmpeg'
    })
    expect(job.width).toBe(3840)
    expect(job.height).toBe(3840)
  })
})

describe('ffmpeg recorder args', () => {
  it('grabs the virtual display without audio when Pulse is missing', () => {
    const args = buildRecorderArgs({
      display: ':99',
      width: 1920,
      height: 1080,
      outputPath: '/tmp/out.mp4',
      includeAudio: false
    })
    expect(args).toContain('x11grab')
    expect(args).toContain(':99.0+0,0')
    expect(args).toContain('-an')
    expect(args).toContain('60')
    expect(args).toContain('12')
    expect(args).not.toContain('pulse')
  })

  it('rounds grab size to even dimensions', () => {
    expect(evenSize(1919, 1080)).toEqual({ width: 1920, height: 1080 })
  })
})

const ctx: ExecutorContext = {
  taskId: 't1',
  attemptId: 'a1',
  attemptNumber: 1,
  input: { url: 'https://example.com/watch', kind: 'video' }
}

const drmFinish = (onFinish: ExecutorEvents['onFinish']): void => {
  const event: ExecutorFinishEvent = {
    taskId: ctx.taskId,
    attemptId: ctx.attemptId,
    result: {
      type: 'error',
      error: virtualError('unknown', 'This video is DRM protected'),
      exitCode: 1
    },
    closedAt: Date.now(),
    stdoutTail: '',
    stderrTail: 'This video is DRM protected'
  }
  onFinish(event)
}

describe('DrmFallbackExecutor', () => {
  const noopRun: ExecutorRun = { cancel: async () => undefined, pause: async () => undefined }

  it('starts capture after a DRM failure', async () => {
    let captureRan = false
    const primary: Executor = {
      run(_context, events): ExecutorRun {
        queueMicrotask(() => drmFinish(events.onFinish))
        return noopRun
      }
    }
    const capture: Executor = {
      run(_context, events): ExecutorRun {
        captureRan = true
        queueMicrotask(() => {
          events.onFinish({
            taskId: ctx.taskId,
            attemptId: ctx.attemptId,
            result: {
              type: 'success',
              output: {
                filePath: '/tmp/out.mp4',
                size: 12,
                durationMs: 1000,
                sha256: null
              }
            },
            closedAt: Date.now(),
            stdoutTail: '',
            stderrTail: ''
          })
        })
        return noopRun
      }
    }
    const finished = new Promise<string>((resolve) => {
      new DrmFallbackExecutor(primary, capture, () => true).run(ctx, {
        onSpawn: () => undefined,
        onProgress: () => undefined,
        onStd: () => undefined,
        onFinish: (event) => resolve(event.result.type)
      })
    })
    await expect(finished).resolves.toBe('success')
    expect(captureRan).toBe(true)
  })

  it('keeps the DRM error when capture is unavailable', async () => {
    let captureRan = false
    const primary: Executor = {
      run(_context, events): ExecutorRun {
        queueMicrotask(() => drmFinish(events.onFinish))
        return noopRun
      }
    }
    const capture: Executor = {
      run(): ExecutorRun {
        captureRan = true
        return noopRun
      }
    }
    const finished = new Promise<string>((resolve) => {
      new DrmFallbackExecutor(primary, capture, () => false).run(ctx, {
        onSpawn: () => undefined,
        onProgress: () => undefined,
        onStd: () => undefined,
        onFinish: (event) => resolve(event.result.type)
      })
    })
    await expect(finished).resolves.toBe('error')
    expect(captureRan).toBe(false)
  })
})
