import { $DesktopId } from '@vidbee/identity/packages'
import { LiteralKit } from '@vidbee/schema/LiteralKit'
import * as S from 'effect/Schema'

const $I = $DesktopId.create('shared/source-media-kind')

import { mediaKindFromName } from '@vidbee/ui/lib/ingest'

/** Source category; structural for legacy construction.
 * **Example** (Reject invalid SourceMediaKind input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { SourceMediaKind } from './source-media-kind.js'
 * strictEqual(S.is(SourceMediaKind)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const SourceMediaKind = LiteralKit(['audio', 'video']).pipe(
  $I.annoteSchema('SourceMediaKind', { description: 'Player source category.' })
)
/** SourceMediaKind shared contract.
 * @category utilities
 * @since 0.0.0
 * @example SourceMediaKind
 */
export type SourceMediaKind = typeof SourceMediaKind.Type

/**
 * Classify a download as audio-only or video from the same signals the player uses.
 * @example sourceMediaKind
 * @category utilities
 * @since 0.0.0
 */
export function sourceMediaKind(input: {
  type?: string | null
  filePath?: string | null
  savedFileName?: string | null
  url?: string | null
}): SourceMediaKind {
  if (input.type === 'audio') {
    return 'audio'
  }
  for (const name of [input.filePath, input.savedFileName, input.url]) {
    if (
      name !== undefined &&
      name !== null &&
      name.length > 0 &&
      mediaKindFromName(name) === 'audio'
    ) {
      return 'audio'
    }
  }
  return 'video'
}

/** Turn a missing-video-stream failure into a non-retryable tool error.  * @example agentUnusableVideoError
 * @category utilities
 * @since 0.0.0
 */
export function agentUnusableVideoError(error: unknown): SourceMediaFailure {
  const message = error instanceof Error ? error.message : String(error)
  const replace =
    /does not contain any stream|matches no streams|Output file is empty|Media output is empty/i.test(
      message
    )
  return {
    message: replace
      ? 'This source has no usable video frames. Write a text-only answer and do not retry capture_frames or create_clip.'
      : message,
    replace
  }
}
/** Strict error mapping decision; structural for legacy construction.
 * **Example** (Reject invalid SourceMediaFailure input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { SourceMediaFailure } from './source-media-kind.js'
 * strictEqual(S.is(SourceMediaFailure)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const SourceMediaFailure = S.Struct({
  message: S.String.pipe(S.mutableKey),
  replace: S.Boolean.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('SourceMediaFailure', {
    description: 'Failure message and legacy identity mapping.'
  })
)
/** SourceMediaFailure shared contract.
 * @category utilities
 * @since 0.0.0
 * @example SourceMediaFailure
 */
export type SourceMediaFailure = typeof SourceMediaFailure.Type
