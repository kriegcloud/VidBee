// Pre-port compiler-emitted declaration closure; kept unchanged for compatibility checks.
import type { PipelineSegment, TranscriptionStage, TranscriptStageTiming } from './types';
export interface PartialTranscript {
    taskId: string;
    downloadTaskId: string;
    segments: PipelineSegment[];
    stage: TranscriptionStage | null;
    stageHistory: TranscriptStageTiming[];
}
export declare const transcriptionPartials: {
    set(taskId: string, downloadTaskId: string, segments: PipelineSegment[]): PartialTranscript;
    /**
     * Record the live pipeline stage so the transcript page can show real progress.
     *
     * @param taskId Transcription task id.
     * @param downloadTaskId Parent download id.
     * @param stage Current worker stage.
     */
    setStage(taskId: string, downloadTaskId: string, stage: TranscriptionStage): PartialTranscript;
    append(taskId: string, downloadTaskId: string, segment: PipelineSegment): PartialTranscript;
    getByTask(taskId: string): PartialTranscript | null;
    getByDownload(downloadTaskId: string): PartialTranscript | null;
    clear(taskId: string): void;
    /**
     * Drop the live partial buffer for a parent download, if one exists.
     *
     * @param downloadTaskId Parent download id.
     */
    clearByDownload(downloadTaskId: string): void;
    /**
     * Rebuild live partials from leftover `chunks.json` / `stages.json` after a crash.
     *
     * @param input Task ids and the worker work directory.
     */
    restoreFromManifest(input: {
        taskId: string;
        downloadTaskId: string;
        workDir: string;
    }): PartialTranscript | null;
};
