/** Public speech identifiers and wire types are safe to import in renderer and Worker code. */
export const DEFAULT_CLOUD_TRANSCRIPTION_MODEL = "qwen/qwen3-asr-1.7b";
export const MAX_CLOUD_AUDIO_BYTES = 9_601_024;
export const MAX_CLOUD_AUDIO_SECONDS = 300;

export type { TranscriptionProvider } from "./Literal.model.js";

import type { TranscriptionProvider } from "./Literal.model.js";

export type { CloudTranscriptionCatalog, CloudTranscriptionModel, CloudTranscriptionResult } from "./Cloud.model.js";

/** Keep old settings and tasks local unless Cloud was explicitly selected. */
export function parseTranscriptionProvider(value: unknown): TranscriptionProvider {
  return value === "cloud" ? "cloud" : "local";
}
