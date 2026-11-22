import { $DesktopId } from '@vidbee/identity/packages'
import { LiteralKit } from '@vidbee/schema/LiteralKit'
import * as S from 'effect/Schema'

const $I = $DesktopId.create('shared/types/ytdlp-kernel')

/**
 * Runtime model for YtDlpKernelState shared values.
 *
 *
 * **Example** (Construct YtDlpKernelState)
 *
 * ```ts
 * import { YtDlpKernelState } from './ytdlp-kernel.js'
 * const value = YtDlpKernelState.make("checking")
 * value // => "checking"
 * ```
 *
 * @category schemas
 * @since 0.0.0
 * structural for legacy construction.
 */
export const YtDlpKernelState = LiteralKit([
  'preparing',
  'checking',
  'installing',
  'up-to-date',
  'retry-scheduled',
  'bundled-fallback',
  'unavailable'
]).pipe($I.annoteSchema('YtDlpKernelState', { description: 'yt-dlp kernel preparation state.' }))
/** Decoded YtDlpKernelState data.
 * @category type-level
 * @since 0.0.0
 * @example YtDlpKernelState
 */
export type YtDlpKernelState = typeof YtDlpKernelState.Type

/**
 * Runtime model for YtDlpKernelPreparationStep shared values.
 *
 *
 * **Example** (Construct YtDlpKernelPreparationStep)
 *
 * ```ts
 * import { YtDlpKernelPreparationStep } from './ytdlp-kernel.js'
 * const value = YtDlpKernelPreparationStep.make(null)
 * value // => null
 * ```
 *
 * @category schemas
 * @since 0.0.0
 * structural for legacy construction.
 */
export const YtDlpKernelPreparationStep = S.NullOr(
  LiteralKit(['copying', 'validating', 'finalizing'])
)
/** Decoded YtDlpKernelPreparationStep data.
 * @category type-level
 * @since 0.0.0
 * @example YtDlpKernelPreparationStep
 */
export type YtDlpKernelPreparationStep = typeof YtDlpKernelPreparationStep.Type

/**
 * Runtime model for YtDlpKernelStatus shared values.
 *
 *
 * **Example** (Construct YtDlpKernelStatus)
 *
 * ```ts
 * import { YtDlpKernelStatus } from './ytdlp-kernel.js'
 * const value = YtDlpKernelStatus.make({ready: false, state: "preparing", source: null, ytDlpVersion: null, nodeVersion: null, progress: null, preparationStep: null, error: null})
 * value.ready // => false
 * ```
 *
 * @category schemas
 * @since 0.0.0
 * structural for legacy construction.
 */
export const YtDlpKernelStatus = S.Struct({
  ready: S.mutableKey(S.Boolean),
  state: S.mutableKey(YtDlpKernelState),
  source: LiteralKit(['managed', 'bundled']).pipe(S.NullOr, S.mutableKey),
  ytDlpVersion: S.String.pipe(S.NullOr, S.mutableKey),
  nodeVersion: S.String.pipe(S.NullOr, S.mutableKey),
  progress: S.Finite.pipe(S.NullOr, S.mutableKey),
  preparationStep: S.mutableKey(YtDlpKernelPreparationStep),
  error: S.String.pipe(S.NullOr, S.mutableKey)
}).pipe(
  $I.annoteSchema('YtDlpKernelStatus', { description: 'YtDlpKernelStatus shared boundary data.' })
)
/** Decoded YtDlpKernelStatus data.
 * @category type-level
 * @since 0.0.0
 * @example YtDlpKernelStatus
 */
export type YtDlpKernelStatus = typeof YtDlpKernelStatus.Type
