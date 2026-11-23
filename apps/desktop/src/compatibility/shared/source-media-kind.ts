import * as Native from '../../shared/source-media-kind'
import {
  SourceMediaKind as ReexportSourceMediaKind,
  sourceMediaKind as ReexportsourceMediaKind
} from '../../shared/source-media-kind'

export { ReexportSourceMediaKind as SourceMediaKind, ReexportsourceMediaKind as sourceMediaKind }
/** Preserve the original Error instance unless the missing-stream message requires replacement. */
export function agentUnusableVideoError(error: unknown): Error {
  const failure = Native.agentUnusableVideoError(error)
  return !failure.replace && error instanceof Error ? error : new Error(failure.message)
}
