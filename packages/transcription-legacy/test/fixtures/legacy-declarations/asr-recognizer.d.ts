// Pre-port compiler-emitted declaration closure; kept unchanged for compatibility checks.
import { type AsrFamily, type AsrTierId } from './asr-tiers';
import type { SherpaExecutionProvider } from './compute-provider';
import type { ModelManager } from './model-manager';
export interface AsrModelPaths {
    decoder: string | null;
    encoder: string | null;
    frontend: string | null;
    joiner: string | null;
    model: string | null;
    tokenizer: string | null;
    tokens: string | null;
}
/** Whisper `language` codes accepted by sherpa-onnx (empty string = auto-detect). */
export declare const WHISPER_LANGUAGE_CODES: Set<string>;
/** SenseVoice `language` codes. Empty string / auto = detect. */
export declare const SENSE_VOICE_LANGUAGE_CODES: Set<string>;
/**
 * Qwen3-ASR wants English language names on the stream option, not ISO codes.
 * See sherpa-onnx #3472: stream.SetOption("language", "Chinese").
 */
export declare const QWEN3_LANGUAGE_NAMES: Readonly<Record<string, string>>;
/**
 * Return true when this ASR family accepts a language hint.
 * VidBee still leaves these empty so the model auto-detects speech.
 */
export declare const familySupportsAsrLanguage: (family: AsrFamily) => boolean;
/**
 * Always auto-detect. Chinese script is applied after recognition, not as an ASR language.
 */
export declare const asrLanguageForFamily: (_family?: AsrFamily, _language?: string | null) => string;
export interface AsrLanguageStream {
    setOption?: (key: string, value: string) => void;
}
/**
 * Intentionally a no-op. ASR must auto-detect speech instead of using the UI language.
 */
export declare const applyAsrStreamLanguage: (_stream: AsrLanguageStream, _family: AsrFamily, _language?: string | null) => void;
/**
 * Resolve on-disk paths for every ASR role of a model id.
 */
export declare const resolveAsrModelPaths: (models: ModelManager, tier: AsrTierId) => AsrModelPaths;
/**
 * Build a sherpa-onnx OfflineRecognizer config for a supported family.
 */
export declare const buildOfflineRecognizerConfig: (family: AsrFamily, paths: AsrModelPaths, numThreads?: number, _language?: string, provider?: SherpaExecutionProvider, debug?: number) => Record<string, unknown>;
/**
 * Build a recognizer config from a model manager and tier, or return null.
 */
export declare const tryRecognizerConfig: (models: ModelManager, tier: AsrTierId, numThreads?: number, provider?: SherpaExecutionProvider, debug?: number) => Record<string, unknown> | null;
