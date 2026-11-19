// Pre-port compiler-emitted declaration closure; kept unchanged for compatibility checks.
import type { CloudTranscriptionResult } from './cloud';
import type { PipelineResult, PipelineSegment, TranscriptionStage } from './types';
export interface CloudTranscriptionRunInput {
    accountId: string;
    taskId: string;
    sourceFilePath: string;
    modelId: string;
    ffmpegPath: string;
    workRoot: string;
    signal: AbortSignal;
    transcribe: (audio: Uint8Array, requestId: string, signal: AbortSignal) => Promise<CloudTranscriptionResult>;
    onProgress: (stage: TranscriptionStage, percent: number | null) => void;
    onPartial: (segment: PipelineSegment) => void;
}
/** Wrap one PCM clip in a canonical WAV envelope whose duration is verified by Cloud. */
export declare function cloudClipWav(pcm: Uint8Array): Uint8Array<ArrayBuffer>;
/** Decode locally, recognize serially in Cloud, and resume successful clips through normal queue retries. */
export declare function runCloudTranscription(input: CloudTranscriptionRunInput): Promise<{
    result: PipelineResult;
    durationMs: number;
    cleanup: () => Promise<void>;
}>;
