// Pre-port compiler-emitted declaration closure; kept unchanged for compatibility checks.
import { type Task, type TaskQueueAPI } from '@vidbee/task-queue-legacy';
import type { TranscriptionProvider } from './cloud';
import type { MemoryTranscriptStore } from './memory-store';
import type { TranscriptStore } from './transcript-store';
export interface ImportCaptionsRequest {
    downloadTaskId: string;
    sourceFilePath: string;
    title?: string;
}
export interface AutoTranscriptionCoordinatorOptions {
    queue: TaskQueueAPI;
    store: TranscriptStore | MemoryTranscriptStore;
    isEnabled: () => boolean;
    resolveSourceFile: (task: Task) => string | null;
    resolveAsrTier?: () => string;
    resolveProvider?: () => TranscriptionProvider;
    resolveCloudModelId?: () => string;
    /** UI language. Only Simplified vs Traditional Chinese is kept as a post-ASR script preference. */
    resolveLanguage?: () => string;
    /** Import embedded or sidecar captions. Return true when a transcript was stored. */
    tryImportCaptions?: (input: ImportCaptionsRequest) => Promise<boolean>;
    /** When false, live completions wait until `flushPending()` after models land. */
    isModelsReady?: () => boolean;
    logger?: {
        warn: (...args: unknown[]) => void;
    };
}
/**
 * Host-owned listener. It only reacts to download completions that occur
 * after `start()`, so enabling the setting never backfills history.
 */
export declare class AutoTranscriptionCoordinator {
    private readonly opts;
    private unsubscribe;
    private readonly pending;
    /** Keep host configuration pinned for the coordinator's lifetime. */
    constructor(opts: AutoTranscriptionCoordinatorOptions);
    start(): void;
    stop(): void;
    /**
     * Enqueue auto-transcription for downloads that finished while models were still preparing.
     */
    flushPending(): Promise<void>;
    private onEvent;
    /**
     * Import captions if possible, otherwise queue or defer ASR for one completed download.
     */
    private considerDownload;
}
