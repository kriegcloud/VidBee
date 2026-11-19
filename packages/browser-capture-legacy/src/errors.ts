import * as Cause from 'effect/Cause'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'
import * as Capture from '../../browser-capture/src/Capture.errors.js'
import { HostFailure as QueueHostFailure } from '@vidbee/task-queue/TaskQueue.errors'

const unwrap = (error: unknown): unknown => {
  if (error instanceof QueueHostFailure) return unwrap(error.original)
  if (error instanceof Capture.HostFailure) return error.cause
  if (S.is(Capture.CaptureErrorSchema)(error)) return new Error(error.legacyMessage)
  return error
}
export const captureError = (cause: Cause.Cause<unknown>): unknown => {
  const failed = Cause.findErrorOption(cause)
  return unwrap(Option.isSome(failed) ? failed.value : Cause.squash(cause))
}
