import { $DesktopId } from '@vidbee/identity/packages'
import { LiteralKit } from '@vidbee/schema/LiteralKit'
import * as Effect from 'effect/Effect'
import * as S from 'effect/Schema'
import { strictObject } from './StrictObject'

const $I = $DesktopId.create('shared/video-localization')

import { TtsModelId } from './Tts.model'

/** Export a named subtitle source without changing the visible transcript. */
/** SubtitleExportInput; structural for legacy construction.
 * **Example** (Reject invalid SubtitleExportInput input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { SubtitleExportInput } from './video-localization.js'
 * strictEqual(S.is(SubtitleExportInput)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const SubtitleExportInput = S.Struct({
  sourceKey: S.String.check(S.isMinLength(1)).check(S.isMaxLength(100)).pipe(S.mutableKey),
  format: LiteralKit(['srt', 'vtt', 'mkv', 'mp4']).pipe(S.mutableKey),
  bilingual: S.Boolean.pipe(S.withDecodingDefault(Effect.succeed(false)), S.mutableKey)
}).pipe(
  strictObject,
  $I.annoteSchema('SubtitleExportInput', {
    description: 'SubtitleExportInput shared boundary data.'
  })
)

/** Generate local speech and fit it to the selected subtitle track. */
/** DubbingInput; structural for legacy construction.
 * **Example** (Reject invalid DubbingInput input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { DubbingInput } from './video-localization.js'
 * strictEqual(S.is(DubbingInput)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const DubbingInput = S.Struct({
  sourceKey: S.String.check(S.isMinLength(1)).check(S.isMaxLength(100)).pipe(S.mutableKey),
  modelId: TtsModelId.pipe(S.optional, S.mutableKey),
  voice: S.Finite.check(S.isInt())
    .check(S.isGreaterThanOrEqualTo(0))
    .check(S.isLessThanOrEqualTo(1_000_000))
    .pipe(S.optional, S.mutableKey),
  reference: S.Struct({
    file: S.String.check(S.isMinLength(1))
      .check(S.isMaxLength(200))
      .check(S.isPattern(/^(?!\/|\\|[A-Za-z]:)(?!.*(?:^|[\\/])\.\.(?:[\\/]|$))[^\n\r]+\.wav$/))
      .pipe(S.mutableKey),
    text: S.String.check(S.isMinLength(1)).check(S.isMaxLength(4000)).pipe(S.optional, S.mutableKey)
  }).pipe(strictObject, S.optional, S.mutableKey),
  background: LiteralKit(['remove', 'separate']).pipe(
    S.withDecodingDefault(Effect.succeed('separate')),
    S.mutableKey
  ),
  maxSpeed: S.Finite.check(S.isGreaterThanOrEqualTo(1))
    .check(S.isLessThanOrEqualTo(2))
    .pipe(S.withDecodingDefault(Effect.succeed(1.5)), S.mutableKey),
  burnSubtitles: S.Boolean.pipe(S.withDecodingDefault(Effect.succeed(false)), S.mutableKey),
  speechOverrides: S.Array(
    S.Struct({
      cueIndex: S.Finite.check(S.isInt())
        .check(S.isGreaterThanOrEqualTo(1))
        .check(S.isLessThanOrEqualTo(50_000))
        .pipe(S.mutableKey),
      originalText: S.String.check(S.isMinLength(1)).check(S.isMaxLength(4000)).pipe(S.mutableKey),
      text: S.Trim.check(S.isMinLength(1)).check(S.isMaxLength(4000)).pipe(S.mutableKey)
    }).pipe(strictObject)
  )
    .pipe(S.mutable)
    .check(S.isMaxLength(50_000))
    .pipe(S.optional, S.mutableKey)
}).pipe(
  strictObject,
  $I.annoteSchema('DubbingInput', {
    description: 'DubbingInput shared boundary data.'
  })
)
/** SubtitleExportInput shared contract.
 * @category utilities
 * @since 0.0.0
 * @example SubtitleExportInput
 */
export type SubtitleExportInput = typeof SubtitleExportInput.Type
/** DubbingInput shared contract.
 * @category utilities
 * @since 0.0.0
 * @example DubbingInput
 */
export type DubbingInput = typeof DubbingInput.Type
