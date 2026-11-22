import * as Result from 'effect/Result'
import { z } from 'zod'
import type {
  TtsFamily as ReexportTtsFamily,
  TtsModelDefinition as ReexportTtsModelDefinition,
  TtsModelId as ReexportTtsModelId
} from '../../shared/tts-models'
import * as Native from '../../shared/tts-models'

export type {
  ReexportTtsFamily as TtsFamily,
  ReexportTtsModelDefinition as TtsModelDefinition,
  ReexportTtsModelId as TtsModelId
}

import {
  DEFAULT_TTS_MODEL_ID as ReexportDEFAULT_TTS_MODEL_ID,
  parseTtsModelId as ReexportparseTtsModelId,
  TTS_FAMILIES as ReexportTTS_FAMILIES,
  ttsModelFamily as ReexportttsModelFamily
} from '../../shared/tts-models'

export {
  ReexportDEFAULT_TTS_MODEL_ID as DEFAULT_TTS_MODEL_ID,
  ReexportparseTtsModelId as parseTtsModelId,
  ReexportTTS_FAMILIES as TTS_FAMILIES,
  ReexportttsModelFamily as ttsModelFamily
}
export const ttsModelIdSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/)
const languageOf = (code: string): string => new Intl.Locale(code).language
export function getTtsModel(id: unknown): Native.TtsModelDefinition {
  const result = Native.getTtsModel({
    id,
    languageOf
  })
  if (Result.isFailure(result)) {
    throw new Error(result.failure.message)
  }
  return result.success
}
export function resolveTtsSpeaker(
  modelOrId: Native.TtsModelDefinition | Native.TtsModelId,
  language: string,
  voice?: number
) {
  const result = Native.resolveTtsSpeaker({
    modelOrId,
    language,
    voice,
    languageOf
  })
  if (Result.isFailure(result)) {
    throw new Error(result.failure.message)
  }
  return result.success
}
