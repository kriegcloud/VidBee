import type { Executor, ExecutorContext, ExecutorEvents, ExecutorRun } from '@vidbee/task-queue-legacy';
import type { GpuKind } from './asr-recommend';
import type { MemoryTranscriptStore } from './memory-store';
import { type WorkerRuntimeLayer } from './runtime';
import { type PipelineSeed } from './speaker-assign';
import type { TranscriptStore } from './transcript-store';
import type { PipelineResult, PipelineSegment, TranscriptionStage } from './types';
/**
 * Delete one transcription scratch directory after the job settles.
 * Refuses any path that is not a child of `vidbee-transcript`.
 *
 * @param workDir Job directory created under `vidbee-transcript`.
 */
export declare function removeTranscriptionWorkDir(workDir: string): Promise<void>;
export type TranscriptionBackend = 'sherpa' | 'fake';
export interface TranscriptionExecutorOptions {
    store: TranscriptStore | MemoryTranscriptStore;
    workerScript: string;
    modelsDir: string;
    resolveFfmpegPath: () => string;
    backend?: TranscriptionBackend;
    execPath?: string;
    execArgv?: string[];
    env?: NodeJS.ProcessEnv;
    workDir?: string;
    bundledNodePath?: string | null;
    forceLayer?: WorkerRuntimeLayer;
    maxWorkerRestarts?: number;
    skipProbe?: boolean;
    resolveGpuKinds?: () => Promise<readonly GpuKind[]>;
    runCloud?: (input: {
        taskId: string;
        sourceFilePath: string;
        modelId: string;
        signal: AbortSignal;
        onProgress: (stage: TranscriptionStage, percent: number | null) => void;
        onPartial: (segment: PipelineSegment) => void;
    }) => Promise<{
        result: PipelineResult;
        durationMs: number;
        cleanup?: () => Promise<void>;
    }>;
    /**
     * Test seam: run the pipeline in-process instead of forking a worker.
     */
    runInProcess?: (input: {
        sourceFilePath: string;
        skipVad: boolean;
        autoSkipAllowed: boolean;
        asrTier: string;
        language?: string;
        speakerCount?: import('./speaker-count').SpeakerCount;
        existingTranscript?: PipelineSeed;
        signal: AbortSignal;
        onProgress: (stage: TranscriptionStage, percent: number | null) => void;
        onPartial?: (segment: PipelineSegment) => void;
    }) => Promise<{
        result: PipelineResult;
        durationMs: number;
    }>;
    onPartial?: (input: {
        taskId: string;
        downloadTaskId: string;
        segments: PipelineSegment[];
    }) => void;
    onStage?: (input: {
        taskId: string;
        downloadTaskId: string;
        stage: TranscriptionStage;
    }) => void;
}
export declare class TranscriptionExecutor implements Executor {
    private readonly opts;
    private readonly providerSelectionProbes;
    private readonly providerSelections;
    private runtimeResolution;
    constructor(opts: TranscriptionExecutorOptions);
    run(ctx: ExecutorContext, events: ExecutorEvents): ExecutorRun;
    private execute;
    private resolveRuntime;
    private resolveRuntimeUncached;
    /**
     * Benchmark compatible providers in isolated workers and cache the process-local winner.
     */
    private resolveComputeProvider;
    private runWorkerWithRestart;
    private runWorker;
}
