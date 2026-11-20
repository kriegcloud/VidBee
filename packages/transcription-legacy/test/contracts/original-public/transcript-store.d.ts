import { type InsertTranscriptSegmentInput, type TranscriptSegmentPatch } from './transcript-edit';
import type { TranscriptHead } from './transcript-sources';
import type { PipelineResult, TranscriptRecord } from './types';
interface SqliteStatement {
    run(...params: unknown[]): {
        changes: number;
    };
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
}
interface SqliteDatabase {
    prepare(sql: string): SqliteStatement;
    exec(sql: string): void;
    transaction(fn: (...args: any[]) => unknown): ((...args: any[]) => unknown) & {
        immediate: (...args: any[]) => unknown;
    };
}
export interface TranscriptStoreOptions {
    db: SqliteDatabase;
    clock?: () => number;
}
/** Playback cue columns. Word timestamps stay in `words_json` and are not selected. */
export interface TranscriptPlaybackCue {
    confidence: number | null;
    endMs: number;
    id: string;
    sortIndex: number;
    speakerId: string | null;
    startMs: number;
    text: string;
}
/** Head columns only. This statement must not reference `transcript_segments`. */
export declare const TRANSCRIPT_HEAD_SQL = "SELECT id, download_task_id, transcription_task_id, result_kind,\n            model_version, asr_tier, language, source_file_path, source_kind, superseded_at,\n            created_at, updated_at\n     FROM transcripts";
/** Cue columns for one transcript. `words_json` is intentionally absent. */
export declare const TRANSCRIPT_PLAYBACK_CUE_SQL = "SELECT id, speaker_id, start_ms, end_ms, text, confidence, sort_index\n     FROM transcript_segments\n     WHERE transcript_id = ?\n     ORDER BY start_ms ASC, sort_index ASC";
export declare class TranscriptStore {
    private readonly db;
    private readonly clock;
    constructor(opts: TranscriptStoreOptions);
    applySchema(): void;
    getById(id: string): TranscriptRecord | null;
    getByTranscriptionTaskId(taskId: string): TranscriptRecord | null;
    getLatestForDownload(downloadTaskId: string): TranscriptRecord | null;
    listForDownload(downloadTaskId: string): TranscriptRecord[];
    /**
     * Return every current (non-superseded) transcript, newest first.
     */
    listLatest(): TranscriptRecord[];
    /**
     * Return every transcript row without speakers, segments, or word timestamps.
     * Newest first, including superseded history needed for source selection.
     */
    listHeads(): TranscriptHead[];
    /**
     * Return one download's transcript heads, newest first, without caption bodies.
     *
     * @param downloadTaskId Parent download id.
     */
    listHeadsForDownload(downloadTaskId: string): TranscriptHead[];
    /**
     * True when a download already has a current transcript row.
     *
     * @param downloadTaskId Parent download id.
     */
    hasCurrent(downloadTaskId: string): boolean;
    /**
     * Read cue text and times for one transcript. Word JSON is not selected.
     *
     * @param transcriptId Stored transcript id.
     */
    listPlaybackCues(transcriptId: string): TranscriptPlaybackCue[];
    /** Persist a transcript atomically, optionally adding a secondary track without changing the current row. */
    commit(input: {
        downloadTaskId: string;
        transcriptionTaskId: string;
        sourceFilePath: string | null;
        result: PipelineResult;
        transcriptId?: string;
        activate?: boolean;
    }): TranscriptRecord;
    /** Append validated caption cues in one transaction, preserving existing cue IDs and the current track. */
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
     * Rewrite every caption for a transcript in one transaction.
     *
     * @param record Parent row before the write.
     * @param segments Captions after the mutation.
     */
    private replaceSegments;
    private hydrate;
}
export {};
