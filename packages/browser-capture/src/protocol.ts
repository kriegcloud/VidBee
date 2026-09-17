import { VIRTUAL_DISPLAY_SIZE } from './quality'

export type SidecarEvent =
  | { type: 'spawn'; pid: number }
  | { type: 'log'; message: string }
  | {
      type: 'progress'
      percent: number
      currentTime: number
      duration: number
    }
  | {
      type: 'done'
      filePath: string
      size: number
      durationMs: number | null
    }
  | { type: 'error'; message: string }

const EVENT_PREFIX = '__VIDBEE_CAPTURE__'

/** Encode one sidecar event as a stdout line the executor can parse. */
export const encodeSidecarEvent = (event: SidecarEvent): string =>
  `${EVENT_PREFIX}${JSON.stringify(event)}`

/** Parse a sidecar stdout line into an event, or null when it is plain log text. */
export const parseSidecarEvent = (line: string): SidecarEvent | null => {
  const trimmed = line.trim()
  if (!trimmed.startsWith(EVENT_PREFIX)) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(trimmed.slice(EVENT_PREFIX.length))
    if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) {
      return null
    }
    return parsed as SidecarEvent
  } catch {
    return null
  }
}

export interface CaptureJob {
  url: string
  outputPath: string
  ffmpegPath: string
  cookiesPath?: string
  browserExecutable?: string
  width: number
  height: number
  durationHintSec?: number
  localStorage?: Record<string, string>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** Parse a capture job JSON object. */
export const parseCaptureJob = (value: unknown): CaptureJob => {
  if (!isRecord(value)) {
    throw new Error('Capture job must be an object')
  }
  if (typeof value.url !== 'string' || !value.url.trim()) {
    throw new Error('Capture job is missing url')
  }
  if (typeof value.outputPath !== 'string' || !value.outputPath.trim()) {
    throw new Error('Capture job is missing outputPath')
  }
  if (typeof value.ffmpegPath !== 'string' || !value.ffmpegPath.trim()) {
    throw new Error('Capture job is missing ffmpegPath')
  }
  const width =
    typeof value.width === 'number' && value.width > 0 ? value.width : VIRTUAL_DISPLAY_SIZE.width
  const height =
    typeof value.height === 'number' && value.height > 0
      ? value.height
      : VIRTUAL_DISPLAY_SIZE.height
  const localStorage = isRecord(value.localStorage)
    ? Object.fromEntries(
        Object.entries(value.localStorage).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string'
        )
      )
    : undefined
  return {
    url: value.url.trim(),
    outputPath: value.outputPath,
    ffmpegPath: value.ffmpegPath,
    cookiesPath: typeof value.cookiesPath === 'string' ? value.cookiesPath : undefined,
    browserExecutable:
      typeof value.browserExecutable === 'string' ? value.browserExecutable : undefined,
    width,
    height,
    durationHintSec:
      typeof value.durationHintSec === 'number' && value.durationHintSec > 0
        ? value.durationHintSec
        : undefined,
    localStorage
  }
}
