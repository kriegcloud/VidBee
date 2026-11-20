export interface TimedTurn {
    startMs: number;
    endMs: number;
    speakerKey: string;
}
export interface TimeInterval {
    startMs: number;
    endMs: number;
}
/** Turns shorter than this do not seed clusters; they inherit a neighbor. */
export declare const MIN_CLUSTER_TURN_MS = 400;
/** Auto mode only: merge clusters shorter than this (pyannote glitches), not a % share. */
export declare const MIN_CLUSTER_DURATION_MS = 2000;
/** Max gap when merging a short cluster into its nearest neighbor. */
export declare const MAX_MERGE_GAP_MS = 30000;
/** Ignore VAD as a speech mask when it covers less than this share of the file. */
export declare const MIN_VAD_COVERAGE = 0.2;
/** Fill timeline holes larger than this so ASR cannot stop after the first line. */
export declare const MAX_UNCOVERED_GAP_MS = 2000;
/**
 * Merge adjacent same-speaker turns that almost touch.
 *
 * @param turns Unsorted or overlapping speaker turns.
 */
export declare const mergeAdjacentTurns: (turns: TimedTurn[]) => TimedTurn[];
export interface RefineSpeakerOptions {
    /** When true, skip the short-cluster merge that exists to clean up auto clustering. */
    knownCount?: boolean;
}
/**
 * Post-process raw diarization turns: fold sub-400ms fragments into neighbors
 * and, in auto mode, merge leftover clusters shorter than 2s. A percent-of-file
 * floor is not used — that erased low-talk guests on long videos.
 */
export declare const refineSpeakerTurns: (raw: TimedTurn[], _speech: TimeInterval[], _totalDurationMs: number, options?: RefineSpeakerOptions) => TimedTurn[];
/**
 * Sum the duration of a list of intervals.
 */
export declare const intervalDurationMs: (intervals: TimeInterval[]) => number;
/**
 * Return true when VAD spans enough of the file to use as a speech mask.
 */
export declare const shouldTrustSpeechIntervals: (speechMs: number, totalDurationMs: number) => boolean;
/**
 * Insert unknown-speaker turns for large holes so later speech is still recognized.
 */
export declare const fillUncoveredTurns: (turns: TimedTurn[], totalDurationMs: number, maxGapMs?: number) => TimedTurn[];
/**
 * Build the speaker turns ASR will walk. Pyannote already marks speech; VAD is
 * not used as a mask. A short diarization miss cannot hide the rest of the file.
 */
export declare const turnsForAsr: (raw: TimedTurn[], _speech: TimeInterval[], totalDurationMs: number, options?: RefineSpeakerOptions) => TimedTurn[];
