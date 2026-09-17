import { readFile } from 'node:fs/promises'
import { parseNetscapeCookieFile, toPlaywrightCookies } from './cookies'
import { startVirtualDisplay } from './display'
import { startPlayback } from './player'
import type { CaptureJob } from './protocol'
import { evenSize } from './quality'
import { startRecorder } from './recorder'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Play the page on a virtual display and record it with ffmpeg.
 */
export const runCapture = async (
  job: CaptureJob,
  input: {
    signal: AbortSignal
    onLog: (message: string) => void
    onProgress: (state: { currentTime: number; duration: number; percent: number }) => void
  }
): Promise<{ filePath: string; durationMs: number | null }> => {
  const cookies = job.cookiesPath
    ? toPlaywrightCookies(parseNetscapeCookieFile(await readFile(job.cookiesPath, 'utf8')))
    : []
  if (!job.browserExecutable) {
    throw new Error('No Chromium-family browser found to play DRM media')
  }

  const display = await startVirtualDisplay({ width: job.width, height: job.height })
  input.onLog(`Virtual display ${display.display} ready`)
  let recorder: { stop: () => Promise<void> } | null = null
  let playback: Awaited<ReturnType<typeof startPlayback>> | null = null
  try {
    playback = await startPlayback({
      url: job.url,
      cookies,
      localStorage: job.localStorage,
      executablePath: job.browserExecutable,
      display: display.display,
      pulseSink: display.pulseSink,
      width: job.width,
      height: job.height,
      signal: input.signal
    })
    input.onLog('Waiting for in-browser playback (CDM decrypts in Chromium)')
    const playing = await playback.waitUntilPlaying()
    const durationHint = job.durationHintSec ?? playing.duration
    const native = evenSize(
      playing.width > 0 ? playing.width : job.width,
      playing.height > 0 ? playing.height : job.height
    )
    const grabWidth = Math.min(native.width, job.width)
    const grabHeight = Math.min(native.height, job.height)
    input.onLog(
      `Pinned decoded quality ${grabWidth}x${grabHeight}${playing.method ? ` (${playing.method})` : ''}`
    )
    await sleep(350)
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      DISPLAY: display.display
    }
    if (display.pulseSink) {
      env.PULSE_SINK = display.pulseSink
    }
    const startWithAudio = Boolean(display.pulseSink)
    const recorderInput = {
      ffmpegPath: job.ffmpegPath,
      display: display.display,
      width: grabWidth,
      height: grabHeight,
      outputPath: job.outputPath,
      pulseSink: display.pulseSink,
      fps: playing.fps,
      env
    }
    try {
      recorder = startRecorder({
        ...recorderInput,
        includeAudio: startWithAudio
      })
    } catch (error) {
      if (!startWithAudio) {
        throw error
      }
      input.onLog('Pulse capture failed; recording video only')
      recorder = startRecorder({
        ...recorderInput,
        includeAudio: false
      })
    }
    input.onLog('ffmpeg x11grab started')
    await playback.waitUntilEnded((state) => {
      const duration = state.duration || durationHint || 0
      const percent = duration > 0 ? Math.min(1, state.currentTime / duration) : 0
      input.onProgress({ currentTime: state.currentTime, duration, percent })
    })
    await sleep(400)
  } finally {
    if (recorder) {
      await recorder.stop()
    }
    if (playback) {
      await playback.close()
    }
    await display.stop()
  }
  return {
    filePath: job.outputPath,
    durationMs: job.durationHintSec ? Math.round(job.durationHintSec * 1000) : null
  }
}
