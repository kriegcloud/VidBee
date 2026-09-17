import { type ChildProcess, spawn } from 'node:child_process'
import {
  CAPTURE_AUDIO_BITRATE_K,
  CAPTURE_FPS,
  CAPTURE_X264_CRF
} from './quality'

export interface RecorderHandle {
  stop: () => Promise<void>
}

/** Build ffmpeg argv that grabs an X11 screen and optional Pulse monitor. */
export const buildRecorderArgs = (input: {
  display: string
  width: number
  height: number
  outputPath: string
  pulseSink?: string
  includeAudio: boolean
  fps?: number
}): string[] => {
  const fps = input.fps && input.fps >= 24 ? Math.min(60, Math.round(input.fps)) : CAPTURE_FPS
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-thread_queue_size',
    '4096',
    '-f',
    'x11grab',
    '-draw_mouse',
    '0',
    '-video_size',
    `${input.width}x${input.height}`,
    '-framerate',
    String(fps),
    '-i',
    `${input.display}.0+0,0`
  ]
  if (input.includeAudio && input.pulseSink) {
    args.push('-thread_queue_size', '4096', '-f', 'pulse', '-i', `${input.pulseSink}.monitor`)
  }
  args.push(
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    String(CAPTURE_X264_CRF),
    '-pix_fmt',
    'yuv420p',
    '-profile:v',
    'high',
    '-movflags',
    '+faststart'
  )
  if (input.includeAudio && input.pulseSink) {
    args.push(
      '-c:a',
      'aac',
      '-b:a',
      `${CAPTURE_AUDIO_BITRATE_K}k`,
      '-ar',
      '48000',
      '-ac',
      '2'
    )
  } else {
    args.push('-an')
  }
  args.push(input.outputPath)
  return args
}

const stopFfmpeg = (child: ChildProcess): Promise<void> =>
  new Promise((resolve) => {
    if (!child.pid) {
      resolve()
      return
    }
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        /* gone */
      }
      resolve()
    }, 4000)
    child.once('close', () => {
      clearTimeout(timer)
      resolve()
    })
    try {
      child.stdin?.write('q')
    } catch {
      /* ignore */
    }
    try {
      child.kill('SIGINT')
    } catch {
      clearTimeout(timer)
      resolve()
    }
  })

/**
 * Start an ffmpeg x11grab recorder pointed at the virtual display.
 */
export const startRecorder = (input: {
  ffmpegPath: string
  display: string
  width: number
  height: number
  outputPath: string
  pulseSink?: string
  includeAudio: boolean
  fps?: number
  env?: NodeJS.ProcessEnv
}): RecorderHandle => {
  const args = buildRecorderArgs(input)
  const child = spawn(input.ffmpegPath, args, {
    env: input.env,
    stdio: ['pipe', 'ignore', 'pipe']
  })
  if (!child.pid) {
    throw new Error('Failed to start ffmpeg recorder')
  }
  return {
    stop: () => stopFfmpeg(child)
  }
}
