// Pre-port compiler-emitted declaration closure; kept unchanged for compatibility checks.
export declare const ASR_TIER_IDS: readonly ['minimal', 'whisper-base', 'balanced', 'whisper-medium', 'whisper-turbo', 'sense-voice', 'sense-voice-2025', 'fire-red-asr', 'parakeet-v2', 'parakeet-v3', 'orukeet', 'quality', 'qwen3-1.7b'];
export type AsrTierId = (typeof ASR_TIER_IDS)[number];
export type { SpeakerCount } from './speaker-count';
export { DEFAULT_SPEAKER_COUNT, isSpeakerCount, MAX_SPEAKER_COUNT, parseSpeakerCount, SPEAKER_COUNT_CHOICES, sherpaNumClusters } from './speaker-count';
export type AsrFamily = 'whisper' | 'qwen3' | 'sense-voice' | 'parakeet' | 'fire-red-asr';
export type AsrLanguageGroup = 'zh' | 'cjk' | 'en' | 'multi';
export type MachineClass = 'low' | 'mid' | 'high';
export interface AsrTierInfo {
    id: AsrTierId;
    family: AsrFamily;
    modelId: string;
    /** Model archive or directory name. */
    archiveName: string;
    bytesHint: number;
    minRamGB: number;
    qualityRank: number;
    languages: readonly AsrLanguageGroup[];
    performance: {
        machine: string;
        speed: string;
        quality: string;
    };
}
export declare const DEFAULT_ASR_TIER: AsrTierId;
/** Official k2-fsa/sherpa-onnx asr-models assets (verified 2026-08-19). */
export declare const WHISPER_TINY_ARCHIVE = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-tiny.tar.bz2";
export declare const WHISPER_TINY_DIR = "sherpa-onnx-whisper-tiny";
export declare const WHISPER_BASE_ARCHIVE = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-base.tar.bz2";
export declare const WHISPER_BASE_DIR = "sherpa-onnx-whisper-base";
export declare const WHISPER_SMALL_ARCHIVE = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-small.tar.bz2";
export declare const WHISPER_SMALL_DIR = "sherpa-onnx-whisper-small";
export declare const WHISPER_MEDIUM_ARCHIVE = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-medium.tar.bz2";
export declare const WHISPER_MEDIUM_DIR = "sherpa-onnx-whisper-medium";
export declare const WHISPER_TURBO_ARCHIVE = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-turbo.tar.bz2";
export declare const WHISPER_TURBO_DIR = "sherpa-onnx-whisper-turbo";
export declare const SENSE_VOICE_ARCHIVE = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2";
export declare const SENSE_VOICE_DIR = "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17";
export declare const SENSE_VOICE_2025_ARCHIVE = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09.tar.bz2";
export declare const SENSE_VOICE_2025_DIR = "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09";
export declare const FIRE_RED_ASR_DIR = "sherpa-onnx-fire-red-asr2-zh_en-int8-2026-02-26";
export declare const FIRE_RED_ASR_ARCHIVE = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-fire-red-asr2-zh_en-int8-2026-02-26.tar.bz2";
export declare const PARAKEET_V2_ARCHIVE = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2";
export declare const PARAKEET_V2_DIR = "sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8";
export declare const PARAKEET_V3_ARCHIVE = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2";
export declare const PARAKEET_V3_DIR = "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8";
export declare const ORUKEET_DIR = "sherpa-onnx-orukeet-v0.1.0-int8";
export declare const QWEN3_ASR_ARCHIVE = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25.tar.bz2";
export declare const QWEN3_ASR_DIR = "sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25";
export declare const QWEN3_ASR_1_7B_DIR = "qwen3-asr-1.7b-int8-cb045ad8";
export declare const ASR_TIERS: readonly AsrTierInfo[];
export declare const ASR_FAMILY_ORDER: readonly AsrFamily[];
/**
 * Return true when the value is a known ASR model id.
 */
export declare const isAsrTierId: (value: unknown) => value is AsrTierId;
/**
 * Look up catalog metadata for an ASR model id.
 */
export declare const asrTierInfo: (id: AsrTierId) => AsrTierInfo;
/**
 * Coerce an unknown setting/task value to a valid ASR model id.
 */
export declare const parseAsrTier: (value: unknown, fallback?: AsrTierId) => AsrTierId;
/**
 * Models ranked above the current one, lowest rank first.
 */
export declare const higherAsrTiers: (id: AsrTierId) => AsrTierInfo[];
/**
 * Next upgrade options for the quality-hint dialog.
 */
export declare const upgradeAsrTiers: (id: AsrTierId, recommended?: readonly AsrTierId[]) => AsrTierInfo[];
