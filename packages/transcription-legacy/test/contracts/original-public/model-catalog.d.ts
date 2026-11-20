import { type AsrTierId } from './asr-tiers';
import { type ModelFileSpec, type ModelGroup } from './types';
/**
 * Publisher-provided sherpa-onnx assets. Whisper packages use int8
 * encoder/decoder files; SenseVoice uses a single int8 model.
 * Qwen3 stays at its existing directory so already-downloaded files are reused.
 */
export declare const MODEL_CATALOG: readonly ModelFileSpec[];
export declare const QWEN3_ASR_MODEL_DIR = "sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25";
export declare const modelVersion = "vidbee-asr-2026.08.20-3";
/**
 * Filter the catalog by model group and optional ASR ids.
 */
export declare const catalogFor: (opts?: {
    groups?: readonly ModelGroup[];
    tiers?: readonly AsrTierId[];
}) => readonly ModelFileSpec[];
export declare const MINIMAL_MODEL_GROUPS: readonly ModelGroup[];
export declare const MINIMAL_MODEL_TIERS: readonly AsrTierId[];
