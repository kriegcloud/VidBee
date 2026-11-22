import { $DesktopId } from '@vidbee/identity/packages'
import * as S from 'effect/Schema'

const $I = $DesktopId.create('shared/Tts.model')
/** Syntactically valid sherpa model identifier, including unknown families.
 * **Example** (Reject invalid TtsModelId input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { TtsModelId } from './Tts.model.js'
 * strictEqual(S.is(TtsModelId)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 * structural for legacy construction.
 */
export const TtsModelId = S.String.check(S.isPattern(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/)).pipe(
  $I.annoteSchema('TtsModelId', {
    description: 'Sherpa model identifier without a selectable-model whitelist.'
  })
)
/** Decoded model identifier.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the TtsModelId contract)
 *
 * ```ts
 * import { TtsModelId } from './Tts.model.js'
 * void TtsModelId
 * ```
 *
 */
export type TtsModelId = typeof TtsModelId.Type
/** Original provisional speech model default.
 * @category constants
 * @since 0.0.0
 *
 * **Example** (Access the DEFAULT_TTS_MODEL_ID contract)
 *
 * ```ts
 * import { DEFAULT_TTS_MODEL_ID } from './Tts.model.js'
 * void DEFAULT_TTS_MODEL_ID
 * ```
 *
 */
export const DEFAULT_TTS_MODEL_ID: TtsModelId = 'kokoro-multi-lang-v1_0'
