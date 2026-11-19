import { LiteralKit } from "@vidbee/schema/LiteralKit";
export const AsrTierId = LiteralKit([
  "minimal",
  "whisper-base",
  "balanced",
  "whisper-medium",
  "whisper-turbo",
  "sense-voice",
  "sense-voice-2025",
  "fire-red-asr",
  "parakeet-v2",
  "parakeet-v3",
  "orukeet",
  "quality",
  "qwen3-1.7b",
]);
export type AsrTierId = typeof AsrTierId.Type;
export const AsrFamily = LiteralKit(["whisper", "qwen3", "sense-voice", "parakeet", "fire-red-asr"]);
export type AsrFamily = typeof AsrFamily.Type;
export const AsrLanguageGroup = LiteralKit(["zh", "cjk", "en", "multi"]);
export type AsrLanguageGroup = typeof AsrLanguageGroup.Type;
export const MachineClass = LiteralKit(["low", "mid", "high"]);
export type MachineClass = typeof MachineClass.Type;
export const OsKind = LiteralKit(["linux", "macos", "other", "windows"]);
export type OsKind = typeof OsKind.Type;
export const GpuKind = LiteralKit(["amd", "apple", "intel", "nvidia", "unknown"]);
export type GpuKind = typeof GpuKind.Type;
export const SherpaExecutionProvider = LiteralKit(["cpu", "cuda", "directml", "coreml"]);
export type SherpaExecutionProvider = typeof SherpaExecutionProvider.Type;
export const SpeakerCount = LiteralKit(["auto", 1, 2, 3, 4, 5, 6, 7, 8]);
export type SpeakerCount = typeof SpeakerCount.Type;
export const TranscriptionProvider = LiteralKit(["local", "cloud"]);
export type TranscriptionProvider = typeof TranscriptionProvider.Type;
export const TranscriptResultKind = LiteralKit(["transcript", "no-speech"]);
export type TranscriptResultKind = typeof TranscriptResultKind.Type;
export const TranscriptSourceKind = LiteralKit(["asr", "captions"]);
export type TranscriptSourceKind = typeof TranscriptSourceKind.Type;
export const TranscriptionTrigger = LiteralKit(["manual", "auto", "force"]);
export type TranscriptionTrigger = typeof TranscriptionTrigger.Type;
export const TranscriptionStage = LiteralKit([
  "preparing-models",
  "preparing-audio",
  "detecting-speech",
  "diarizing",
  "recognizing",
  "committing",
]);
export type TranscriptionStage = typeof TranscriptionStage.Type;
export const ModelRole = LiteralKit([
  "vad",
  "segmentation",
  "embedding",
  "asr-encoder",
  "asr-decoder",
  "asr-frontend",
  "asr-tokenizer",
  "asr-tokens",
  "asr-model",
  "asr-joiner",
  "asr-extra",
  "punctuation",
  "speech",
]);
export type ModelRole = typeof ModelRole.Type;
export const ModelGroup = LiteralKit(["vad", "speaker", "asr", "punct", "speech"]);
export type ModelGroup = typeof ModelGroup.Type;
export const WorkerRuntimeLayer = LiteralKit(["env", "bundled", "system", "electron"]);
export type WorkerRuntimeLayer = typeof WorkerRuntimeLayer.Type;
export const TranscriptionBackend = LiteralKit(["sherpa", "fake"]);
export type TranscriptionBackend = typeof TranscriptionBackend.Type;
export const WorkerLogStream = LiteralKit(["stdout", "stderr"]);
export type WorkerLogStream = typeof WorkerLogStream.Type;
