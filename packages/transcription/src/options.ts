import * as Str from "effect/String";
import { DEFAULT_ASR_TIER, parseAsrTier } from "./asr-tiers.js";
import { DEFAULT_CLOUD_TRANSCRIPTION_MODEL, parseTranscriptionProvider } from "./cloud.js";
import { DEFAULT_SPEAKER_COUNT, parseSpeakerCount } from "./speaker-count.js";
import type { TaskCreationMetadata, TaskInput } from "@vidbee/task-queue/types";
import type { TranscriptionTaskOptions, TranscriptionTrigger } from "./types.js";

/**
 * Keep a short BCP-47 tag so diarization can pick a language-matched embedding.
 */
const readOptionalLanguage = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = Str.trim(value);
  if (trimmed.length === 0 || trimmed.length > 32) {
    return undefined;
  }
  return trimmed;
};
export const isTranscriptionTrigger = (value: unknown): value is TranscriptionTrigger =>
  value === "manual" || value === "auto" || value === "force";
export function readTranscriptionOptions(input: TaskInput): TranscriptionTaskOptions | null {
  const raw = input.options ?? {};
  const downloadTaskId = typeof raw.downloadTaskId === "string" ? raw.downloadTaskId : null;
  const sourceFilePath =
    typeof raw.sourceFilePath === "string"
      ? raw.sourceFilePath
      : Str.startsWith("file:")(input.url)
        ? Str.slice("file://".length)(input.url)
        : input.url;
  if (downloadTaskId === null || downloadTaskId.length === 0 || sourceFilePath.length === 0) {
    return null;
  }
  return {
    provider: parseTranscriptionProvider(raw.provider),
    cloudModelId:
      typeof raw.cloudModelId === "string" && raw.cloudModelId.length <= 200
        ? raw.cloudModelId
        : DEFAULT_CLOUD_TRANSCRIPTION_MODEL,
    downloadTaskId,
    sourceFilePath,
    trigger: isTranscriptionTrigger(raw.trigger) ? raw.trigger : "manual",
    skipVad: raw.skipVad === true,
    asrTier: parseAsrTier(raw.asrTier, DEFAULT_ASR_TIER),
    language: readOptionalLanguage(raw.language),
    speakerCount: parseSpeakerCount(raw.speakerCount, DEFAULT_SPEAKER_COUNT),
    rediarize: raw.rediarize === true,
  };
}

/** Build executor options and preserve the trusted caller's task provenance. */
export function buildTranscriptionInput(
  opts: TranscriptionTaskOptions & {
    title?: string;
    creation?: TaskCreationMetadata;
  }
): TaskInput {
  return {
    url: `vidbee://download/${opts.downloadTaskId}`,
    kind: "transcription",
    title: opts.title,
    options: {
      provider: parseTranscriptionProvider(opts.provider),
      cloudModelId: opts.cloudModelId ?? DEFAULT_CLOUD_TRANSCRIPTION_MODEL,
      origin: "manual",
      ...opts.creation,
      downloadTaskId: opts.downloadTaskId,
      sourceFilePath: opts.sourceFilePath,
      trigger: opts.trigger,
      skipVad: opts.skipVad === true,
      asrTier: parseAsrTier(opts.asrTier, DEFAULT_ASR_TIER),
      language: readOptionalLanguage(opts.language),
      speakerCount: parseSpeakerCount(opts.speakerCount, DEFAULT_SPEAKER_COUNT),
      rediarize: opts.rediarize === true,
    },
  };
}
