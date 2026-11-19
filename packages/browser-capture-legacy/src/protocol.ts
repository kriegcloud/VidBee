import * as Result from 'effect/Result'
import { encodeSidecarEvent as encode, parseSidecarEvent as observe, parseCaptureJob as normalize } from '../../browser-capture/src/protocol.js'
export type { CaptureJob } from '../../browser-capture/src/Capture.model.js'
import type { SidecarEvent } from '../../browser-capture/src/Protocol.model.js'
export type { SidecarEvent } from '../../browser-capture/src/Protocol.model.js'

export const encodeSidecarEvent = (event: SidecarEvent): string => {
  const result = encode(event)
  if (Result.isSuccess(result)) return result.success
  // Reconstruct the original JSON failure from retained input, without another read.
  JSON.stringify(event)
  throw new Error(result.failure.legacyMessage)
}
export const parseSidecarEvent = (line: string): SidecarEvent | null => observe(line) as SidecarEvent | null
export const parseCaptureJob = (value: unknown) => {
  const result = normalize(value)
  if (Result.isSuccess(result)) return result.success
  throw new Error(result.failure.legacyMessage)
}
