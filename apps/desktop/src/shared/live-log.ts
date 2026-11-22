import { $DesktopId } from '@vidbee/identity/packages'
import * as S from 'effect/Schema'
import * as Str from 'effect/String'
import { recordFunction } from './RecordFunction.js'

const $I = $DesktopId.create('shared/live-log')
/** Trailing characters kept for one task's live yt-dlp log in main and the renderer.  * @example LIVE_LOG_CHAR_CAP
 * @category utilities
 * @since 0.0.0
 */
export const LIVE_LOG_CHAR_CAP = 80_000

/** `download:log` payload. `chunk` is only the text appended since the previous event. */

/**
 * Append a log chunk and keep the trailing cap.
 *
 * @param current Text already retained.
 * @param chunk Text to append.
 * @param cap Maximum retained length.
 */
function appendCappedLogBody(current: string, chunk: string, cap: number): string {
  const next = `${current}${chunk}`
  return next.length > cap ? Str.slice(next.length - cap)(next) : next
}

/** DownloadLogIpcPayload shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid DownloadLogIpcPayload input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { DownloadLogIpcPayload } from './live-log.js'
 * strictEqual(S.is(DownloadLogIpcPayload)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const DownloadLogIpcPayload = S.Struct({
  id: S.String.pipe(S.mutableKey),
  chunk: S.String.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('DownloadLogIpcPayload', {
    description: 'DownloadLogIpcPayload shared boundary data.'
  })
)
/** Decoded mutable DownloadLogIpcPayload data.
 * @category type-level
 * @since 0.0.0
 * @example DownloadLogIpcPayload
 */
export type DownloadLogIpcPayload = typeof DownloadLogIpcPayload.Type

/** Record contract for appendCappedLog.
 * @category ports
 * @since 0.0.0
 * @example AppendCappedLogInput
 */
export interface AppendCappedLogInput {
  current: string
  chunk: string
  cap: number
}
/** appendCappedLog with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 * @example appendCappedLog
 */
export const appendCappedLog: {
  (): (input: AppendCappedLogInput) => string
  (input: AppendCappedLogInput): string
} = recordFunction((input: AppendCappedLogInput): string =>
  appendCappedLogBody(input.current, input.chunk, input.cap)
)
