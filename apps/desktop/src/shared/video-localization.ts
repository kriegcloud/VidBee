import { $DesktopId } from '@vidbee/identity/packages'
import { LiteralKit } from '@vidbee/schema/LiteralKit'
import * as Effect from 'effect/Effect'
import * as S from 'effect/Schema'
import * as SchemaTransformation from 'effect/SchemaTransformation'
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
  bilingual: S.UndefinedOr(S.Boolean).pipe(
    S.decodeTo(
      S.Boolean,
      SchemaTransformation.transform({
        decode: (value) => (value === undefined ? false : value),
        encode: (value) => value
      })
    ),
    S.withDecodingDefaultKey(Effect.succeed(false)),
    S.mutableKey
  )
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
  modelId: TtsModelId.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  voice: S.Finite.check(S.isInt())
    .check(S.isGreaterThanOrEqualTo(0))
    .check(S.isLessThanOrEqualTo(1_000_000))
    .pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  reference: S.Struct({
    file: S.String.check(S.isMinLength(1))
      .check(S.isMaxLength(200))
      .check(S.isPattern(/^(?!\/|\\|[A-Za-z]:)(?!.*(?:^|[\\/])\.\.(?:[\\/]|$))[^\n\r]+\.wav$/))
      .pipe(S.mutableKey),
    text: S.String.check(S.isMinLength(1))
      .check(S.isMaxLength(4000))
      .pipe(S.UndefinedOr, S.optionalKey, S.mutableKey)
  }).pipe(strictObject, S.UndefinedOr, S.optionalKey, S.mutableKey),
  background: S.UndefinedOr(LiteralKit(['remove', 'separate'])).pipe(
    S.decodeTo(
      LiteralKit(['remove', 'separate']),
      SchemaTransformation.transform({
        decode: (value) => (value === undefined ? 'separate' : value),
        encode: (value) => value
      })
    ),
    S.withDecodingDefaultKey(Effect.succeed<'remove' | 'separate'>('separate')),
    S.mutableKey
  ),
  maxSpeed: S.Finite.check(S.isGreaterThanOrEqualTo(1))
    .check(S.isLessThanOrEqualTo(2))
    .pipe(
      S.UndefinedOr,
      S.decodeTo(
        S.Finite.check(S.isGreaterThanOrEqualTo(1)).check(S.isLessThanOrEqualTo(2)),
        SchemaTransformation.transform({
          decode: (value) => (value === undefined ? 1.5 : value),
          encode: (value) => value
        })
      ),
      S.withDecodingDefaultKey(Effect.succeed(1.5)),
      S.mutableKey
    ),
  burnSubtitles: S.UndefinedOr(S.Boolean).pipe(
    S.decodeTo(
      S.Boolean,
      SchemaTransformation.transform({
        decode: (value) => (value === undefined ? false : value),
        encode: (value) => value
      })
    ),
    S.withDecodingDefaultKey(Effect.succeed(false)),
    S.mutableKey
  ),
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
    .pipe(S.UndefinedOr, S.optionalKey, S.mutableKey)
}).pipe(
  strictObject,
  $I.annoteSchema('DubbingInput', {
    description: 'DubbingInput shared boundary data.'
  })
)
/** SubtitleExportInput shared contract.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the SubtitleExportInput contract)
 *
 * ```ts
 * import { SubtitleExportInput } from './video-localization.js'
 * void SubtitleExportInput
 * ```
 *
 */
export type SubtitleExportInput = typeof SubtitleExportInput.Type
/** DubbingInput shared contract.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the DubbingInput contract)
 *
 * ```ts
 * import { DubbingInput } from './video-localization.js'
 * void DubbingInput
 * ```
 *
 */
export type DubbingInput = typeof DubbingInput.Type
