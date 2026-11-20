import { type InsertTranscriptSegmentInput, type TranscriptSegmentPatch } from './transcript-edit';
import type { TranscriptStore } from './transcript-store';
import type { PipelineResult, TranscriptRecord } from './types';
type CommitInput = Parameters<TranscriptStore['commit']>[0];
export declare class MemoryTranscriptStore {
    private readonly rows;
    private readonly clock;
    constructor(opts?: {
        clock?: () => number;
    });
    applySchema(): void;
    getById(id: string): TranscriptRecord | null;
    getByTranscriptionTaskId(taskId: string): TranscriptRecord | null;
    getLatestForDownload(downloadTaskId: string): TranscriptRecord | null;
    listForDownload(downloadTaskId: string): TranscriptRecord[];
    /**
     * Return every current (non-superseded) transcript, newest first.
     */
    listLatest(): TranscriptRecord[];
    /** Persist a transcript, optionally keeping it as a secondary track without changing the current row. */
    commit(input: CommitInput): TranscriptRecord;
    /** Mirror the persistent store's additive caption writes without replacing existing cue IDs. */
    appendCaptionCues(transcriptId: string, cues: ReadonlyArray<{
        startMs: number;
        endMs: number;
        text: string;
    }>): TranscriptRecord;
    /**
     * Drop every stored transcript for a download, including superseded rows.
     *
     * @param downloadTaskId Parent download id.
     */
    deleteByDownload(downloadTaskId: string): void;
    /**
     * Make one stored transcript the current row for a download.
     *
     * @param downloadTaskId Parent download id.
     * @param transcriptId Row to restore.
     */
    activate(downloadTaskId: string, transcriptId: string): TranscriptRecord | null;
    /**
     * Patch one caption on a stored transcript.
     *
     * @param transcriptId Row that owns the caption.
     * @param segmentId Caption to change.
     * @param patch Text, speaker, or times.
     */
    updateSegment(transcriptId: string, segmentId: string, patch: TranscriptSegmentPatch): TranscriptRecord | null;
    /**
     * Remove one or more captions from a stored transcript.
     *
     * @param transcriptId Row that owns the captions.
     * @param segmentIds Caption ids to drop.
     */
    deleteSegments(transcriptId: string, segmentIds: string[]): TranscriptRecord | null;
    /**
     * Insert a caption and return the updated record plus the new row id.
     *
     * @param transcriptId Row that owns the captions.
     * @param input Neighbor, playhead, or explicit times.
     */
    insertSegment(transcriptId: string, input: InsertTranscriptSegmentInput): {
        record: TranscriptRecord;
        segmentId: string;
    } | null;
    /**
     * Replace captions on an in-memory transcript row.
     *
     * @param record Parent row to mutate.
     * @param segments Captions after the mutation.
     */
    private writeSegments;
}
export type { PipelineResult };
