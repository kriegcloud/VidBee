import { canAdmitTranscription } from "@vidbee/task-queue/types";

export { canAdmitTranscription };

export const DEFAULT_MAX_CONCURRENT_TRANSCRIPTIONS = 1;
export const MAX_CONCURRENT_TRANSCRIPTIONS = 4;
export const CONCURRENT_TRANSCRIPTION_CHOICES = [1, 2, 3, 4] as const;

const DEFAULT_MAX_CONCURRENT_DOWNLOADS = 5;
const MAX_CONCURRENT_DOWNLOADS = 10;

/**
 * Clamp a stored download concurrency value to the supported range.
 *
 * @param value Raw setting value from storage or UI.
 * @returns An integer between 1 and 10.
 */
export const clampMaxConcurrentDownloads = (value: unknown): number => {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n)) {
    return DEFAULT_MAX_CONCURRENT_DOWNLOADS;
  }
  return Math.min(MAX_CONCURRENT_DOWNLOADS, Math.max(1, n));
};

/**
 * Clamp a stored transcription concurrency value to the supported range.
 *
 * @param value Raw setting value from storage or UI.
 * @returns An integer between 1 and 4.
 */
export const clampMaxConcurrentTranscriptions = (value: unknown): number => {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n)) {
    return DEFAULT_MAX_CONCURRENT_TRANSCRIPTIONS;
  }
  return Math.min(MAX_CONCURRENT_TRANSCRIPTIONS, Math.max(DEFAULT_MAX_CONCURRENT_TRANSCRIPTIONS, n));
};
