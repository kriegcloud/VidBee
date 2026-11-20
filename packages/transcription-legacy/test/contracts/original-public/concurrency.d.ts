import { canAdmitTranscription } from '@vidbee/task-queue-legacy/types';
export { canAdmitTranscription };
export declare const DEFAULT_MAX_CONCURRENT_TRANSCRIPTIONS = 1;
export declare const MAX_CONCURRENT_TRANSCRIPTIONS = 4;
export declare const CONCURRENT_TRANSCRIPTION_CHOICES: readonly [1, 2, 3, 4];
export interface TranscriptionConcurrencyQueue {
    setMaxConcurrency: (n: number) => Promise<void> | void;
    setMaxPerGroup: (groupKey: string, n: number | null) => Promise<void> | void;
    setMaxConcurrentDownloads: (n: number) => Promise<void> | void;
}
/**
 * Clamp a stored transcription concurrency value to the supported range.
 *
 * @param value Raw setting value from storage or UI.
 * @returns An integer between 1 and 4.
 */
export declare const clampMaxConcurrentTranscriptions: (value: unknown) => number;
/**
 * Apply download and transcription caps so both limits are honored.
 *
 * Global slots stay large enough for the higher of the two caps. Transcription
 * tasks still share one group, so they cannot exceed the transcript setting.
 * A new ASR task also waits while active downloads are at the download cap and
 * starts once a download slot frees. Lowering the cap does not stop jobs that
 * are already running.
 *
 * @param input Queue plus the two stored concurrency settings.
 */
export declare const applyTranscriptionConcurrency: (input: {
    queue: TranscriptionConcurrencyQueue;
    maxConcurrentDownloads: unknown;
    maxConcurrentTranscriptions: unknown;
}) => void;
