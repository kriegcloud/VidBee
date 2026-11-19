// Pre-port compiler-emitted declaration closure; kept unchanged for compatibility checks.
import type { AsrTierId } from '../asr-tiers';
import type { SherpaExecutionProvider } from '../compute-provider';
import type { SpeakerCount } from '../speaker-count';
import type { PipelineProgress, PipelineResult, TranscriptionStage, TranscriptWord } from '../types';
/** Worker writes the finished pipeline payload here so stdout stays small. */
export declare const WORKER_RESULT_FILE = "pipeline-result.json";
export interface WorkerStartMessage {
    type: 'start';
    taskId: string;
    attemptId: string;
    sourceFilePath: string;
    ffmpegPath: string;
    workDir: string;
    modelsDir: string;
    skipVad: boolean;
    autoSkipAllowed: boolean;
    backend: 'sherpa' | 'fake';
    fingerprint: string;
    modelVersion: string;
    asrTier: AsrTierId;
    provider: SherpaExecutionProvider;
    language?: string;
    speakerCount?: SpeakerCount;
    /** Path to a previous ASR seed so the worker can skip recognition. */
    existingTranscriptPath?: string;
}
export interface WorkerProbeMessage {
    type: 'probe';
    modelsDir: string;
    asrTier?: AsrTierId;
    benchmark?: boolean;
    provider?: SherpaExecutionProvider;
}
export interface WorkerCancelMessage {
    type: 'cancel';
}
export type WorkerInbound = WorkerStartMessage | WorkerProbeMessage | WorkerCancelMessage;
export interface WorkerProgressMessage {
    type: 'progress';
    stage: TranscriptionStage;
    percent: number | null;
    message?: string;
}
export interface WorkerPartialMessage {
    type: 'partial';
    speakerKey: string | null;
    startMs: number;
    endMs: number;
    text: string;
    words?: TranscriptWord[];
}
export interface WorkerResultMessage {
    type: 'result';
    /** Inline payload for tests and tiny fixtures. Production workers use resultPath. */
    result?: PipelineResult;
    /** File under workDir (or an absolute path) written by the worker. */
    resultPath?: string;
    durationMs: number;
}
export interface WorkerErrorMessage {
    type: 'error';
    message: string;
}
export interface WorkerLogMessage {
    type: 'log';
    stream: 'stdout' | 'stderr';
    line: string;
}
export interface WorkerProbeOkMessage {
    type: 'probe-ok';
    durationMs?: number;
    provider?: SherpaExecutionProvider;
}
export type WorkerOutbound = WorkerProgressMessage | WorkerPartialMessage | WorkerResultMessage | WorkerErrorMessage | WorkerLogMessage | WorkerProbeOkMessage;
export declare const encodeMessage: (message: unknown) => string;
export type SyncWrite = (fd: number, buffer: NodeJS.ArrayBufferView, offset?: number, length?: number) => number;
/**
 * Make stdout a blocking pipe. `writeSync` on a non-blocking pipe throws
 * `EAGAIN: resource temporarily unavailable, write` when a long transcript
 * streams partials faster than Electron can drain.
 */
export declare const setStdoutBlocking: () => void;
/**
 * Write one newline-delimited protocol message, retrying short and EAGAIN
 * pipe writes. A single writeSync of a multi-MB result can return 64KB and
 * drop the rest; a full pipe throws instead of blocking.
 *
 * @param fd Destination file descriptor (usually stdout).
 * @param message Protocol payload.
 * @param write Test seam for short writes; defaults to fs.writeSync.
 */
export declare const writeMessageSync: (fd: number, message: unknown, write?: SyncWrite) => void;
/**
 * Resolve a worker result from an inline payload or the file the worker wrote.
 *
 * @param message Result protocol message.
 * @param workDir Worker work directory used when resultPath is relative.
 */
export declare const readWorkerResult: (message: WorkerResultMessage, workDir: string) => PipelineResult;
export declare const parseMessage: <T>(line: string) => T | null;
export type { PipelineProgress };
