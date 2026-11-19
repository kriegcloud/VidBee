// Pre-port compiler-emitted declaration closure; kept unchanged for compatibility checks.
import type { TimedTurn } from './speaker-refine';
import type { PipelineSegment, PipelineSpeaker, TranscriptRecord, TranscriptSourceKind } from './types';
export declare const SEED_TRANSCRIPT_FILE = "seed-transcript.json";
export interface PipelineSeed {
    language: string | null;
    modelVersion: string;
    asrTier: string | null;
    sourceKind?: TranscriptSourceKind;
    speakers: PipelineSpeaker[];
    segments: PipelineSegment[];
}
/** Split when the next token starts after this much silence. */
export declare const PARAGRAPH_GAP_MS = 1500;
/** Split when the open segment already has this many characters. */
export declare const MAX_SEGMENT_CHARS = 150;
/** Split when the open segment already spans this duration. */
export declare const MAX_SEGMENT_MS = 30000;
/** Wordless pieces longer than this are split again so majority-vote stays local. */
export declare const GIANT_TOKEN_MS = 30000;
/** Wordless pieces with more than this many characters are split again. */
export declare const GIANT_TOKEN_CHARS = 300;
/** Last-resort window size when a giant piece still has no usable punctuation. */
export declare const FALLBACK_TOKEN_CHARS = 50;
/**
 * Build a one-speaker turn covering the whole timeline.
 *
 * @param endMs Exclusive end of the last known word or segment.
 */
export declare const singleSpeakerTurns: (endMs: number) => TimedTurn[];
/**
 * True when imported captions still need a speaker overlay pass.
 *
 * Rows committed by rediarize use the worker task id, so they are not retried
 * even if clustering found no named speakers.
 *
 * @param record Current transcript, if any.
 */
export declare const captionRecordNeedsSpeakers: (record: TranscriptRecord | null) => boolean;
/**
 * Latest finished ASR transcript for a download, if one has words or segments.
 *
 * @param store Store that can list every transcript for a download.
 * @param downloadTaskId Parent download id.
 */
export declare const latestAsrSeed: (store: {
    listForDownload: (downloadTaskId: string) => TranscriptRecord[];
}, downloadTaskId: string) => PipelineSeed | null;
/**
 * Seed speaker overlay from the current transcript, captions or ASR.
 *
 * Caption rediarize prefers the original subtitle-import row (`captions:` task
 * id) so a collapsed overlay cannot poison the next pass. ASR rediarize still
 * uses the latest ASR row.
 *
 * @param store Store that can read the current row and list history.
 * @param downloadTaskId Parent download id.
 */
export declare const latestTranscriptSeed: (store: {
    getLatestForDownload?: (downloadTaskId: string) => TranscriptRecord | null;
    listForDownload: (downloadTaskId: string) => TranscriptRecord[];
}, downloadTaskId: string) => PipelineSeed | null;
/**
 * Flatten a stored ASR record into the seed the pipeline overlays speakers on.
 *
 * @param record Latest ASR transcript, or null when nothing is reusable.
 */
export declare const pipelineSeedFromRecord: (record: TranscriptRecord | null) => PipelineSeed | null;
/**
 * Persist a seed next to the worker work dir.
 *
 * @param filePath Destination JSON path.
 * @param seed Existing ASR transcript.
 */
export declare const writePipelineSeed: (filePath: string, seed: PipelineSeed) => void;
/**
 * Load a seed written for a rediarize worker job.
 *
 * @param filePath Seed JSON path.
 */
export declare const loadPipelineSeed: (filePath: string) => PipelineSeed | null;
/**
 * Exclusive end of the last seed segment, used when audio is not extracted.
 *
 * @param seed Existing ASR transcript.
 */
export declare const seedDurationMs: (seed: PipelineSeed) => number;
/**
 * Re-label an existing transcript with new diarization turns. Words are kept.
 *
 * @param segments Finished ASR segments.
 * @param turns Fresh speaker turns from diarization.
 */
export declare const assignSpeakersToSegments: (segments: PipelineSegment[], turns: TimedTurn[]) => {
    speakers: PipelineSpeaker[];
    segments: PipelineSegment[];
};
