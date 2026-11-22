import { $DesktopId } from '@vidbee/identity/packages'
import { LiteralKit } from '@vidbee/schema/LiteralKit'
import * as A from 'effect/Array'
import * as O from 'effect/Option'
import * as P from 'effect/Predicate'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import * as Str from 'effect/String'
import { SharedOperationError } from './AgentFailure.model'
import * as Sparse from './ArrayHelpers.js'
import { recordFunction } from './RecordFunction'
import { TtsModelId as ReexportTtsModelId, TtsModelId } from './Tts.model'

export { ReexportTtsModelId as TtsModelId }

const $I = $DesktopId.create('shared/tts-models')

/** TTS_FAMILIES shared contract.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the TTS_FAMILIES contract)
 *
 * ```ts
 * import { TTS_FAMILIES } from './tts-models.js'
 * void TTS_FAMILIES
 * ```
 *
 */
export const TTS_FAMILIES = [
  'vits',
  'matcha',
  'kokoro',
  'kitten',
  'zipvoice',
  'pocket',
  'supertonic'
] as const
/** TtsModelId shared contract.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Load tts-models helpers)
 *
 * ```ts
 * import * as Shared from './tts-models.js'
 * void Shared
 * ```
 *
 */

/** Preserve existing defaults and verified metadata as optional overrides, never a selectable-model whitelist. */
const TTS_PRESETS = [
  {
    id: 'kokoro-multi-lang-v1_0',
    name: 'Kokoro v1.0',
    family: 'kokoro',
    description: 'Multilingual local speech with 53 voices. The original default model.',
    downloadBytes: 349_886_476,
    sha256: '60703707bc05ccd48d60e1eb723f38b07d6e474795a0b6a588d7220400e0f7a4',
    voiceCount: 53,
    languages: [
      {
        code: 'en',
        defaultVoice: 0
      },
      {
        code: 'zh',
        defaultVoice: 48
      },
      {
        code: 'es',
        defaultVoice: 28,
        lang: 'es'
      },
      {
        code: 'fr',
        defaultVoice: 30,
        lang: 'fr'
      },
      {
        code: 'hi',
        defaultVoice: 31,
        lang: 'hi'
      },
      {
        code: 'it',
        defaultVoice: 35,
        lang: 'it'
      },
      {
        code: 'pt',
        defaultVoice: 42,
        lang: 'pt-br'
      }
    ]
  },
  {
    id: 'kokoro-int8-multi-lang-v1_1',
    name: 'Kokoro v1.1 INT8',
    family: 'kokoro',
    description: 'Chinese and English speech with 103 voices and quantized local weights.',
    downloadBytes: 147_052_523,
    sha256: '259c9c8bc906d6078e4e0570421885dabb68b539c2f970fcbb890a58eeaf3e9c',
    voiceCount: 103,
    languages: [
      {
        code: 'en',
        defaultVoice: 0
      },
      {
        code: 'zh',
        defaultVoice: 3
      }
    ]
  },
  {
    id: 'vits-melo-tts-zh_en',
    name: 'MeloTTS Chinese + English',
    family: 'vits',
    description:
      'Bilingual local speech with one voice. English pronunciation is limited to words in the model lexicon.',
    downloadBytes: 167_006_755,
    sha256: 'e58351ed7149f290a54534538badd4077cdbe6fddc964b24d0bee870415d1514',
    voiceCount: 1,
    languages: [
      {
        code: 'en',
        defaultVoice: 0
      },
      {
        code: 'zh',
        defaultVoice: 0
      }
    ]
  }
] as const satisfies readonly TtsModelDefinition[]
/** DEFAULT_TTS_MODEL_ID shared contract.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the DEFAULT_TTS_MODEL_ID contract)
 *
 * ```ts
 * import { DEFAULT_TTS_MODEL_ID } from './tts-models.js'
 * void DEFAULT_TTS_MODEL_ID
 * ```
 *
 */
export const DEFAULT_TTS_MODEL_ID: TtsModelId = TTS_PRESETS[0].id

/** Classify model families rather than maintaining a whitelist of individual model IDs.
 *
 * **Example** (Access the ttsModelFamily contract)
 *
 * ```ts
 * import { ttsModelFamily } from './tts-models.js'
 * void ttsModelFamily
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export function ttsModelFamily(id: string): TtsFamily | null {
  for (const family of TTS_FAMILIES) {
    if (Str.includes(family)(id)) {
      return family
    }
  }
  return Str.startsWith('nabra-')(id) ? 'kokoro' : null
}

/** Derive language hints from official release naming without inventing a language for unknown datasets. */
function modelLanguages(
  id: string,
  family: TtsFamily,
  languageOf: (code: string) => string
): string[] {
  if (family === 'supertonic') {
    return Str.includes('supertonic-3-')(id)
      ? [
          'ar',
          'bg',
          'hr',
          'cs',
          'da',
          'nl',
          'en',
          'et',
          'fi',
          'fr',
          'de',
          'el',
          'hi',
          'hu',
          'id',
          'it',
          'ja',
          'ko',
          'lv',
          'lt',
          'pl',
          'pt',
          'ro',
          'ru',
          'sk',
          'sl',
          'es',
          'sv',
          'tr',
          'uk',
          'vi'
        ]
      : ['en', 'ko', 'es', 'pt', 'fr']
  }
  if (Str.startsWith('nabra-')(id)) {
    return ['ar']
  }
  if (family === 'pocket' || family === 'kitten' || id === 'vits-vctk') {
    return ['en']
  }
  if (
    Str.includes('multi-lang')(id) ||
    Str.includes('zh-en')(id) ||
    family === 'zipvoice' ||
    Str.includes('melo-tts-zh_en')(id)
  ) {
    return ['en', 'zh']
  }
  const match =
    /(?:piper|coqui|mimic3|mms|icefall|kokoro|inflect|tts)[-_]([a-z]{2,3}(?:_[A-Z]{2}|_[a-z]{2})?)(?:[-_]|$)/.exec(
      id
    ) ?? /^vits-([a-z]{2,3})(?:[-_]|$)/.exec(id)
  if (match === null || match[1] === undefined || match[1].length === 0) {
    return []
  }
  return Sparse.map({
    items: Sparse.filter({
      items: Str.split('_')(match[1]),
      predicate: (code) => code === Str.toLowerCase(code)
    }),
    map: (code) => languageOf(code)
  })
}

/** Keep the original presets as metadata overrides while accepting every supported release family. */
function getTtsModelBody(input: {
  id: unknown
  languageOf: (code: string) => string
}): Result.Result<TtsModelDefinition, SharedOperationError> {
  const { id, languageOf } = input
  const model = O.getOrUndefined(A.findFirst(TTS_PRESETS, (candidate) => candidate.id === id))
  if (model !== undefined) {
    return Result.succeed(model)
  }
  const parsed = S.decodeUnknownOption(TtsModelId)(id)
  const family = O.isSome(parsed) ? ttsModelFamily(parsed.value) : null
  if (O.isNone(parsed) || family === null) {
    return Result.fail(
      SharedOperationError.make({
        message: `Unknown TTS model family: ${String(id)}`
      })
    )
  }
  return Result.succeed({
    id: parsed.value,
    name: parsed.value,
    family,
    description: `Official sherpa-onnx ${family} model. Voice count is detected after installation.`,
    downloadBytes: 0,
    languages: Sparse.map({
      items: modelLanguages(parsed.value, family, languageOf),
      map: (code) => ({
        code,
        defaultVoice: 0
      })
    })
  })
}

/** Recover older or invalid stored preferences using the original default.
 *
 * **Example** (Access the parseTtsModelId contract)
 *
 * ```ts
 * import { parseTtsModelId } from './tts-models.js'
 * void parseTtsModelId
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export function parseTtsModelId(value: unknown): TtsModelId {
  const parsed = S.decodeUnknownOption(TtsModelId)(value)
  return O.isSome(parsed) ? parsed.value : DEFAULT_TTS_MODEL_ID
}

/** Validate the chosen language and voice before any model download or native inference. */
function resolveTtsSpeakerBody(input: {
  modelOrId: TtsModelDefinition | TtsModelId
  language: string
  voice?: number | undefined
  languageOf: (code: string) => string
}): Result.Result<
  {
    voice: number
    lang: string | undefined
  },
  SharedOperationError
> {
  const { modelOrId, language, voice, languageOf } = input
  const candidate = P.isString(modelOrId)
    ? getTtsModelBody({
        id: modelOrId,
        languageOf
      })
    : Result.succeed(modelOrId)
  if (Result.isFailure(candidate)) {
    return Result.fail(candidate.failure)
  }
  const model = candidate.success
  const speaker = O.getOrUndefined(
    A.findFirst(model.languages, (candidate) => candidate.code === language)
  )
  if (speaker === undefined && model.languages.length > 0) {
    return Result.fail(
      SharedOperationError.make({
        message: `${model.name} does not support subtitle language ${language || '(unknown)'}. Supported languages: ${A.join(
          Sparse.map({
            items: model.languages,
            map: (candidate) => candidate.code
          }),
          ', '
        )}. Use manage_tts_model to choose a compatible model.`
      })
    )
  }
  const selected = voice ?? speaker?.defaultVoice ?? 0
  if (
    !Number.isInteger(selected) ||
    selected < 0 ||
    (model.voiceCount !== undefined && selected >= model.voiceCount)
  ) {
    return Result.fail(
      SharedOperationError.make({
        message: `${model.name} requires a voice ID from 0 to ${model.voiceCount === undefined ? 'the installed model limit' : model.voiceCount - 1}`
      })
    )
  }
  return Result.succeed({
    voice: selected,
    lang: speaker?.lang
  })
}

/** Explicit language parsing for strict model lookup.
 *
 * **Example** (Access the getTtsModel contract)
 *
 * ```ts
 * import { getTtsModel } from './tts-models.js'
 * void getTtsModel
 * ```
 *
 * @category rules
 * @since 0.0.0
 */
export const getTtsModel = recordFunction(getTtsModelBody)
/** Validate speaker selection with explicit language semantics.
 *
 * **Example** (Access the resolveTtsSpeaker contract)
 *
 * ```ts
 * import { resolveTtsSpeaker } from './tts-models.js'
 * void resolveTtsSpeaker
 * ```
 *
 * @category rules
 * @since 0.0.0
 */
export const resolveTtsSpeaker = recordFunction(resolveTtsSpeakerBody)

/** TtsFamily shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid TtsFamily input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { TtsFamily } from './tts-models.js'
 * strictEqual(S.is(TtsFamily)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const TtsFamily = LiteralKit([
  'vits',
  'matcha',
  'kokoro',
  'kitten',
  'zipvoice',
  'pocket',
  'supertonic'
]).pipe(
  $I.annoteSchema('TtsFamily', {
    description: 'TtsFamily shared boundary data.'
  })
)
/** Decoded mutable TtsFamily data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the TtsFamily contract)
 *
 * ```ts
 * import { TtsFamily } from './tts-models.js'
 * void TtsFamily
 * ```
 *
 */
export type TtsFamily = typeof TtsFamily.Type

/** TtsModelDefinition shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid TtsModelDefinition input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { TtsModelDefinition } from './tts-models.js'
 * strictEqual(S.is(TtsModelDefinition)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const TtsModelDefinition = S.Struct({
  id: S.String.pipe(S.mutableKey),
  name: S.String.pipe(S.mutableKey),
  family: TtsFamily.pipe(S.mutableKey),
  description: S.String.pipe(S.mutableKey),
  downloadBytes: S.Finite.pipe(S.mutableKey),
  sha256: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  voiceCount: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  languages: S.Array(
    S.Struct({
      code: S.String.pipe(S.mutableKey),
      defaultVoice: S.Finite.pipe(S.mutableKey),
      lang: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey)
    })
  ).pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('TtsModelDefinition', {
    description: 'TtsModelDefinition shared boundary data.'
  })
)
/** Decoded mutable TtsModelDefinition data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the TtsModelDefinition contract)
 *
 * ```ts
 * import { TtsModelDefinition } from './tts-models.js'
 * void TtsModelDefinition
 * ```
 *
 */
export type TtsModelDefinition = typeof TtsModelDefinition.Type
