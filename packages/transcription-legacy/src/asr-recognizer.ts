import * as Effect from 'effect/Effect'
import {RecognizerModels} from '../../transcription/src/RecognizerConfig.service'
import {make as makeRecognizerConfig} from '../../transcription/src/RecognizerConfig.layer'
import {HostFailure} from '../../transcription/src/Transcription.errors'
import {runConfiguration} from './bridge/configuration'
import * as Core from '../../transcription/src/asr-recognizer'
import { type AsrFamily, type AsrTierId } from './asr-tiers'
import type { SherpaExecutionProvider } from './compute-provider'
import type { ModelManager } from './model-manager'

export interface AsrModelPaths {
  decoder: string | null
  encoder: string | null
  frontend: string | null
  joiner: string | null
  model: string | null
  tokenizer: string | null
  tokens: string | null
}

/** Whisper `language` codes accepted by sherpa-onnx (empty string = auto-detect). */
export const WHISPER_LANGUAGE_CODES = new Set([
  'af',
  'am',
  'ar',
  'as',
  'az',
  'ba',
  'be',
  'bg',
  'bn',
  'bo',
  'br',
  'bs',
  'ca',
  'cs',
  'cy',
  'da',
  'de',
  'el',
  'en',
  'es',
  'et',
  'eu',
  'fa',
  'fi',
  'fo',
  'fr',
  'gl',
  'gu',
  'ha',
  'haw',
  'he',
  'hi',
  'hr',
  'ht',
  'hu',
  'hy',
  'id',
  'is',
  'it',
  'ja',
  'jw',
  'ka',
  'kk',
  'km',
  'kn',
  'ko',
  'la',
  'lb',
  'ln',
  'lo',
  'lt',
  'lv',
  'mg',
  'mi',
  'mk',
  'ml',
  'mn',
  'mr',
  'ms',
  'mt',
  'my',
  'ne',
  'nl',
  'nn',
  'no',
  'oc',
  'pa',
  'pl',
  'ps',
  'pt',
  'ro',
  'ru',
  'sa',
  'sd',
  'si',
  'sk',
  'sl',
  'sn',
  'so',
  'sq',
  'sr',
  'su',
  'sv',
  'sw',
  'ta',
  'te',
  'tg',
  'th',
  'tk',
  'tl',
  'tr',
  'tt',
  'uk',
  'ur',
  'uz',
  'vi',
  'yi',
  'yo',
  'yue',
  'zh'
])

/** SenseVoice `language` codes. Empty string / auto = detect. */
export const SENSE_VOICE_LANGUAGE_CODES = new Set(['en', 'ja', 'ko', 'yue', 'zh'])

/**
 * Qwen3-ASR wants English language names on the stream option, not ISO codes.
 * See sherpa-onnx #3472: stream.SetOption("language", "Chinese").
 */
export const QWEN3_LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  ar: 'Arabic',
  de: 'German',
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  id: 'Indonesian',
  it: 'Italian',
  ja: 'Japanese',
  ko: 'Korean',
  pt: 'Portuguese',
  ru: 'Russian',
  tr: 'Turkish',
  yue: 'Cantonese',
  zh: 'Chinese',
  'zh-TW': 'Chinese Traditional'
}

/**
 * Return true when this ASR family accepts a language hint.
 * VidBee still leaves these empty so the model auto-detects speech.
 */
export const familySupportsAsrLanguage = (family: AsrFamily): boolean =>
  { return Core.familySupportsAsrLanguage(family) }

/**
 * Always auto-detect. Chinese script is applied after recognition, not as an ASR language.
 */
export const asrLanguageForFamily = (_family?: AsrFamily, _language?: string | null): string => { return Core.asrLanguageForFamily(_family, _language) }

export interface AsrLanguageStream {
  setOption?: (key: string, value: string) => void
}

/**
 * Intentionally a no-op. ASR must auto-detect speech instead of using the UI language.
 */
export const applyAsrStreamLanguage = (
  _stream: AsrLanguageStream,
  _family: AsrFamily,
  _language?: string | null
): void => { Core.applyAsrStreamLanguage(_stream, _family, _language) }

/**
 * Resolve on-disk paths for every ASR role of a model id.
 */
export const resolveAsrModelPaths = (models: ModelManager, tier: AsrTierId): AsrModelPaths => {
  return runConfiguration(Effect.flatMap(makeRecognizerConfig(),service=>service.paths(tier)).pipe(Effect.provideService(RecognizerModels,recognizerModels(models))))
}

/**
 * Build a sherpa-onnx OfflineRecognizer config for a supported family.
 */
export const buildOfflineRecognizerConfig = (
  family: AsrFamily,
  paths: AsrModelPaths,
  numThreads = 2,
  _language?: string,
  provider: SherpaExecutionProvider = 'cpu',
  debug = 0
): Record<string, unknown> => { return Core.buildOfflineRecognizerConfig(paths, numThreads, _language, provider, debug)(family) }

/**
 * Build a recognizer config from a model manager and tier, or return null.
 */
export const tryRecognizerConfig = (
  models: ModelManager,
  tier: AsrTierId,
  numThreads = 2,
  provider: SherpaExecutionProvider = 'cpu',
  debug = 0
): Record<string, unknown> | null => {
  return runConfiguration(Effect.flatMap(makeRecognizerConfig(),service=>service.tryConfig({tier,numThreads,provider,debug})).pipe(Effect.provideService(RecognizerModels,recognizerModels(models))))
}

const recognizerModels=(models:ModelManager):typeof RecognizerModels.Service=>{const attempt=<A>(operation:string,read:()=>A)=>Effect.try({try:read,catch:cause=>HostFailure.make({operation,cause,legacyMessage:cause instanceof Error?cause.message:String(cause)})});return{incompleteModelIssue:tier=>attempt('incompleteModelIssue',()=>models.incompleteModelIssue(tier)),pathByRole:(role,tier)=>attempt('pathByRole',()=>models.pathByRole(role,tier))}}
