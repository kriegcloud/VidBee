import { dual } from "effect/Function";
import * as P from "effect/Predicate";
import type { AsrModelPaths } from "./Asr.model.js";

export type { AsrModelPaths } from "./Asr.model.js";

import * as HashSet from "effect/HashSet";
import type { AsrFamily, SherpaExecutionProvider } from "./Literal.model.js";

/** Whisper `language` codes accepted by sherpa-onnx (empty string = auto-detect). */
export const WHISPER_LANGUAGE_CODES = HashSet.fromIterable([
  "af",
  "am",
  "ar",
  "as",
  "az",
  "ba",
  "be",
  "bg",
  "bn",
  "bo",
  "br",
  "bs",
  "ca",
  "cs",
  "cy",
  "da",
  "de",
  "el",
  "en",
  "es",
  "et",
  "eu",
  "fa",
  "fi",
  "fo",
  "fr",
  "gl",
  "gu",
  "ha",
  "haw",
  "he",
  "hi",
  "hr",
  "ht",
  "hu",
  "hy",
  "id",
  "is",
  "it",
  "ja",
  "jw",
  "ka",
  "kk",
  "km",
  "kn",
  "ko",
  "la",
  "lb",
  "ln",
  "lo",
  "lt",
  "lv",
  "mg",
  "mi",
  "mk",
  "ml",
  "mn",
  "mr",
  "ms",
  "mt",
  "my",
  "ne",
  "nl",
  "nn",
  "no",
  "oc",
  "pa",
  "pl",
  "ps",
  "pt",
  "ro",
  "ru",
  "sa",
  "sd",
  "si",
  "sk",
  "sl",
  "sn",
  "so",
  "sq",
  "sr",
  "su",
  "sv",
  "sw",
  "ta",
  "te",
  "tg",
  "th",
  "tk",
  "tl",
  "tr",
  "tt",
  "uk",
  "ur",
  "uz",
  "vi",
  "yi",
  "yo",
  "yue",
  "zh",
]);

/** SenseVoice `language` codes. Empty string / auto = detect. */
export const SENSE_VOICE_LANGUAGE_CODES = HashSet.fromIterable(["en", "ja", "ko", "yue", "zh"]);

/**
 * Qwen3-ASR wants English language names on the stream option, not ISO codes.
 * See sherpa-onnx #3472: stream.SetOption("language", "Chinese").
 */
export const QWEN3_LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  ar: "Arabic",
  de: "German",
  en: "English",
  es: "Spanish",
  fr: "French",
  id: "Indonesian",
  it: "Italian",
  ja: "Japanese",
  ko: "Korean",
  pt: "Portuguese",
  ru: "Russian",
  tr: "Turkish",
  yue: "Cantonese",
  zh: "Chinese",
  "zh-TW": "Chinese Traditional",
};

/**
 * Return true when this ASR family accepts a language hint.
 * VidBee still leaves these empty so the model auto-detects speech.
 */
export const familySupportsAsrLanguage = (family: AsrFamily): boolean =>
  family === "whisper" || family === "sense-voice" || family === "qwen3";

/**
 * Always auto-detect. Chinese script is applied after recognition, not as an ASR language.
 */
export const asrLanguageForFamily = (_family?: AsrFamily, _language?: string | null): string => "";

export interface AsrLanguageStream {
  setOption?: (key: string, value: string) => void;
}

/**
 * Intentionally a no-op. ASR must auto-detect speech instead of using the UI language.
 */
const applyAsrStreamLanguageDataFirst = (
  _stream: AsrLanguageStream,
  _family: AsrFamily,
  _language?: string | null
): void => {};
export const applyAsrStreamLanguage: {
  (_stream: AsrLanguageStream, _family: AsrFamily, _language?: string | null): void;
  (_family: AsrFamily, _language?: string | null): (_stream: AsrLanguageStream) => void;
} = dual((args) => typeof args[0] !== "string", applyAsrStreamLanguageDataFirst);

/**
 * Build a sherpa-onnx OfflineRecognizer config for a supported family.
 */
const buildOfflineRecognizerConfigDataFirst = (
  family: AsrFamily,
  paths: AsrModelPaths,
  numThreads = 2,
  _language?: string,
  provider: SherpaExecutionProvider = "cpu",
  debug = 0
): Record<string, unknown> => {
  const featConfig = { sampleRate: 16_000, featureDim: 80 };
  const shared = { numThreads, provider, debug };
  const asrLanguage = "";
  if (family === "whisper") {
    if (!(P.isTruthy(paths.encoder) && P.isTruthy(paths.decoder) && P.isTruthy(paths.tokens))) {
      throw new Error("model missing: whisper");
    }
    return {
      featConfig,
      modelConfig: {
        whisper: {
          encoder: paths.encoder,
          decoder: paths.decoder,
          language: asrLanguage,
          task: "transcribe",
          tailPaddings: -1,
        },
        tokens: paths.tokens,
        ...shared,
      },
    };
  }
  if (family === "qwen3") {
    if (
      !(
        P.isTruthy(paths.encoder) &&
        P.isTruthy(paths.decoder) &&
        P.isTruthy(paths.frontend) &&
        P.isTruthy(paths.tokenizer)
      )
    ) {
      throw new Error("model missing: qwen3-asr");
    }
    return {
      featConfig,
      modelConfig: {
        qwen3Asr: {
          convFrontend: paths.frontend,
          encoder: paths.encoder,
          decoder: paths.decoder,
          tokenizer: paths.tokenizer,
          hotwords: "",
        },
        tokens: "",
        ...shared,
      },
    };
  }
  if (family === "fire-red-asr") {
    if (!(P.isTruthy(paths.encoder) && P.isTruthy(paths.decoder) && P.isTruthy(paths.tokens))) {
      throw new Error("model missing: fire-red-asr");
    }
    return {
      featConfig,
      modelConfig: {
        fireRedAsr: {
          encoder: paths.encoder,
          decoder: paths.decoder,
        },
        tokens: paths.tokens,
        ...shared,
      },
    };
  }
  if (family === "sense-voice") {
    if (!(P.isTruthy(paths.model) && P.isTruthy(paths.tokens))) {
      throw new Error("model missing: sense-voice");
    }
    return {
      featConfig,
      modelConfig: {
        senseVoice: {
          model: paths.model,
          language: asrLanguage,
          useInverseTextNormalization: 1,
        },
        tokens: paths.tokens,
        ...shared,
      },
    };
  }
  if (family === "parakeet") {
    if (
      !(P.isTruthy(paths.encoder) && P.isTruthy(paths.decoder) && P.isTruthy(paths.joiner) && P.isTruthy(paths.tokens))
    ) {
      throw new Error("model missing: parakeet");
    }
    return {
      featConfig,
      modelConfig: {
        transducer: {
          encoder: paths.encoder,
          decoder: paths.decoder,
          joiner: paths.joiner,
        },
        tokens: paths.tokens,
        modelType: "nemo_transducer",
        ...shared,
      },
    };
  }
  throw new Error(`unknown asr family: ${family}`);
};
export const buildOfflineRecognizerConfig: {
  (
    family: AsrFamily,
    paths: AsrModelPaths,
    numThreads?: number,
    _language?: string,
    provider?: SherpaExecutionProvider,
    debug?: number
  ): Record<string, unknown>;
  (
    paths: AsrModelPaths,
    numThreads?: number,
    _language?: string,
    provider?: SherpaExecutionProvider,
    debug?: number
  ): (family: AsrFamily) => Record<string, unknown>;
} = dual(
  (args) => args.length >= 2 && args[1] !== null && typeof args[1] === "object",
  buildOfflineRecognizerConfigDataFirst
);
