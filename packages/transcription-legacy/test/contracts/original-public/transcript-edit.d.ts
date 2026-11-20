import type { TranscriptSegment } from './types';
export declare const DEFAULT_CAPTION_DURATION_MS = 2000;
export interface TranscriptSegmentPatch {
    endMs?: number;
    speakerId?: string | null;
    startMs?: number;
    text?: string;
}
export interface InsertTranscriptSegmentInput {
    afterId?: string | null;
    atMs?: number;
    beforeId?: string | null;
    endMs?: number;
    speakerId?: string | null;
    startMs?: number;
    text?: string;
}
/**
 * Keep non-negative integer times with end at or after start.
 *
 * @param startMs Requested start.
 * @param endMs Requested end.
 */
export declare const clampSegmentTimes: (startMs: number, endMs: number) => {
    endMs: number;
    startMs: number;
};
/**
 * Sort by time and rewrite 0-based sort indexes.
 *
 * @param segments Caption rows in any order.
 */
export declare const reindexTranscriptSegments: (segments: TranscriptSegment[]) => TranscriptSegment[];
/**
 * Apply a text/speaker/time patch and drop word timings when the text changes.
 *
 * @param segment Row to patch.
 * @param patch Fields to overwrite.
 */
export declare const applyTranscriptSegmentPatch: (segment: TranscriptSegment, patch: TranscriptSegmentPatch) => TranscriptSegment;
/**
 * Replace one stored caption, or return null when the id is missing.
 *
 * @param segments Current rows.
 * @param segmentId Row to change.
 * @param patch Fields to overwrite.
 */
export declare const updateTranscriptSegmentList: (segments: TranscriptSegment[], segmentId: string, patch: TranscriptSegmentPatch) => TranscriptSegment[] | null;
/**
 * Drop caption ids and reindex the remainder.
 *
 * @param segments Current rows.
 * @param segmentIds Rows to remove.
 */
export declare const deleteTranscriptSegmentsFromList: (segments: TranscriptSegment[], segmentIds: string[]) => TranscriptSegment[];
/**
 * Pick start/end and a speaker for a newly inserted caption.
 *
 * @param segments Current rows in display order.
 * @param input Neighbor, playhead, or explicit times.
 */
export declare const resolveInsertSegmentPlacement: (segments: TranscriptSegment[], input: InsertTranscriptSegmentInput) => {
    endMs: number;
    speakerId: string | null;
    startMs: number;
};
/**
 * Insert a caption and return the new list plus the created row id.
 *
 * @param segments Current rows.
 * @param input Neighbor, playhead, or explicit times.
 * @param createId New row id.
 */
export declare const insertTranscriptSegmentInList: (segments: TranscriptSegment[], input: InsertTranscriptSegmentInput, createId: () => string) => {
    segmentId: string;
    segments: TranscriptSegment[];
};
