import { $DesktopId } from '@vidbee/identity/packages'
import * as S from 'effect/Schema'

const $I = $DesktopId.create('shared/types/player')

/**
 * Runtime model for PlayerAttachInput shared values.
 *
 *
 * **Example** (Construct PlayerAttachInput)
 *
 * ```ts
 * import { PlayerAttachInput } from './player.js'
 * const value = PlayerAttachInput.make({filePath: "/fixture/video.mp4"})
 * value.filePath // => "/fixture/video.mp4"
 * ```
 *
 * @category schemas
 * @since 0.0.0
 * structural for legacy construction.
 */
export const PlayerAttachInput = S.Struct({
  filePath: S.mutableKey(S.String)
}).pipe(
  $I.annoteSchema('PlayerAttachInput', { description: 'PlayerAttachInput shared boundary data.' })
)
/** Decoded PlayerAttachInput data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the PlayerAttachInput contract)
 *
 * ```ts
 * import { PlayerAttachInput } from './player.js'
 * void PlayerAttachInput
 * ```
 *
 */
export type PlayerAttachInput = typeof PlayerAttachInput.Type

/**
 * Runtime model for PlayerAttachResult shared values.
 *
 *
 * **Example** (Construct PlayerAttachResult)
 *
 * ```ts
 * import { PlayerAttachResult } from './player.js'
 * const value = PlayerAttachResult.make({playablePath: "/fixture/video.mp4"})
 * value.playablePath // => "/fixture/video.mp4"
 * ```
 *
 * @category schemas
 * @since 0.0.0
 * structural for legacy construction.
 */
export const PlayerAttachResult = S.Struct({
  playablePath: S.mutableKey(S.String),
  reason: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey)
}).pipe(
  $I.annoteSchema('PlayerAttachResult', { description: 'PlayerAttachResult shared boundary data.' })
)
/** Decoded PlayerAttachResult data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the PlayerAttachResult contract)
 *
 * ```ts
 * import { PlayerAttachResult } from './player.js'
 * void PlayerAttachResult
 * ```
 *
 */
export type PlayerAttachResult = typeof PlayerAttachResult.Type
