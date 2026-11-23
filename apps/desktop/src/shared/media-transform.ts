import * as P from 'effect/Predicate'
import { recordFunction } from './RecordFunction.js'
import { strictObject } from './StrictObject'

const $I = $DesktopId.create('shared/media-transform')
// Pure protocol value; the legacy process module exports this same constant.
const FFMPEG_ENCODE_THREADS = '2'

import { $DesktopId } from '@vidbee/identity/packages'
import { LiteralKit } from '@vidbee/schema/LiteralKit'
import * as S from 'effect/Schema'

/** Structured media operations never accept arbitrary process flags or output paths. */
/** MediaTransformInput; structural for legacy construction.
 * **Example** (Reject invalid MediaTransformInput input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { MediaTransformInput } from './media-transform.js'
 * strictEqual(S.is(MediaTransformInput)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const MediaTransformInput = S.Struct({
  parentId: S.String.check(S.isMinLength(1)).check(S.isMaxLength(200)).pipe(S.mutableKey),
  format: LiteralKit(['mp4', 'mkv', 'webm', 'mp3', 'm4a', 'wav', 'flac']).pipe(S.mutableKey),
  startSeconds: S.Finite.check(S.isGreaterThanOrEqualTo(0))
    .check(S.isLessThanOrEqualTo(864_000))
    .pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  durationSeconds: S.Finite.check(S.isGreaterThan(0))
    .check(S.isLessThanOrEqualTo(864_000))
    .pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  height: S.Finite.check(S.isInt())
    .check(S.isGreaterThanOrEqualTo(144))
    .check(S.isLessThanOrEqualTo(4320))
    .check(S.isMultipleOf(2))
    .pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  title: S.String.check(S.isMinLength(1))
    .check(S.isMaxLength(200))
    .pipe(S.UndefinedOr, S.optionalKey, S.mutableKey)
}).pipe(
  strictObject,
  $I.annoteSchema('MediaTransformInput', {
    description: 'MediaTransformInput shared boundary data.'
  })
)
/** MediaTransformInput shared contract.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the MediaTransformInput contract)
 *
 * ```ts
 * import { MediaTransformInput } from './media-transform.js'
 * void MediaTransformInput
 * ```
 *
 */
export type MediaTransformInput = typeof MediaTransformInput.Type

/** Produce deterministic output codecs and optional trim/scale arguments. */
function buildMediaTransformArgsBody(
  input: MediaTransformInput,
  source: string,
  output: string
): string[] {
  const args = ['-nostdin', '-hide_banner', '-n', '-protocol_whitelist', 'file,pipe', '-i', source]
  if (input.startSeconds !== undefined) {
    args.push('-ss', String(input.startSeconds))
  }
  if (input.durationSeconds !== undefined) {
    args.push('-t', String(input.durationSeconds))
  }
  if (
    input.format === 'mp3' ||
    input.format === 'm4a' ||
    input.format === 'wav' ||
    input.format === 'flac'
  ) {
    args.push(
      '-map',
      '0:a:0',
      '-vn',
      '-c:a',
      {
        mp3: 'libmp3lame',
        m4a: 'aac',
        wav: 'pcm_s16le',
        flac: 'flac'
      }[input.format] ?? 'aac'
    )
  } else {
    args.push(
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      '-c:v',
      input.format === 'webm' ? 'libvpx' : 'libx264',
      '-c:a',
      input.format === 'webm' ? 'libopus' : 'aac'
    )
    if (P.isTruthy(input.height)) {
      args.push('-vf', `scale=-2:${input.height}`)
    }
    args.push('-pix_fmt', 'yuv420p')
  }
  if (input.format === 'mp4' || input.format === 'm4a') {
    args.push('-movflags', '+faststart')
  }
  args.push('-threads', FFMPEG_ENCODE_THREADS)
  return [...args, '-progress', 'pipe:1', '-nostats', output]
}

/** Record contract for buildMediaTransformArgs. structural for legacy construction.
 * @category ports
 * @since 0.0.0
 *
 * **Example** (Access the BuildMediaTransformArgsInput contract)
 *
 * ```ts
 * import { BuildMediaTransformArgsInput } from './media-transform.js'
 * void BuildMediaTransformArgsInput
 * ```
 *
 */
export const BuildMediaTransformArgsInput = S.Struct({
  input: S.mutableKey(MediaTransformInput),
  source: S.mutableKey(S.String),
  output: S.mutableKey(S.String)
}).pipe(
  $I.annoteSchema('BuildMediaTransformArgsInput', {
    description:
      'Explicit input record for BuildMediaTransformArgsInput; structural for legacy construction.'
  })
)
/** Schema-derived BuildMediaTransformArgsInput input.
 * @category type-level
 * @since 0.0.0
 */
export type BuildMediaTransformArgsInput = typeof BuildMediaTransformArgsInput.Type
/** buildMediaTransformArgs with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the buildMediaTransformArgs contract)
 *
 * ```ts
 * import { buildMediaTransformArgs } from './media-transform.js'
 * void buildMediaTransformArgs
 * ```
 *
 */
export const buildMediaTransformArgs: {
  (): (input: BuildMediaTransformArgsInput) => string[]
  (input: BuildMediaTransformArgsInput): string[]
} = recordFunction((input: BuildMediaTransformArgsInput): string[] =>
  buildMediaTransformArgsBody(input.input, input.source, input.output)
)
