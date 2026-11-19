import * as Cause from 'effect/Cause'
import * as Option from 'effect/Option'
import { HostFailure } from '../../downloader-core/src/Downloader.errors.js'
export const executorError = <E>(cause: Cause.Cause<E>): unknown => {
  const error = Cause.findErrorOption(cause)
  if (Option.isSome(error)) return error.value instanceof HostFailure ? error.value.cause : error.value
  return Cause.squash(cause)
}
