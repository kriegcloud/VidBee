// Pre-port compiler-emitted declaration closure; kept unchanged for compatibility checks.
import type { TranscriptResultKind, TranscriptSourceKind, TranscriptSourceOption } from './types';
/** Fields source selection reads. Full records and SQL heads both satisfy this. */
export interface TranscriptSourceMeta {
    language: string | null;
    resultKind: TranscriptResultKind;
    sourceKind: TranscriptSourceKind;
}
/** One transcript row without speakers, caption text, or word timestamps. */
export interface TranscriptHead extends TranscriptSourceMeta {
    asrTier: string | null;
    createdAt: number;
    downloadTaskId: string;
    id: string;
    modelVersion: string;
    sourceFilePath: string | null;
    supersededAt: number | null;
    transcriptionTaskId: string;
    updatedAt: number;
}
/**
 * Build the captions-language and ASR choices for one download.
 *
 * @param input Current row, stored history, sidecar languages, and optional viewing key.
 */
export declare const buildTranscriptSources: (input: {
    asrActive?: boolean;
    current: TranscriptSourceMeta | null;
    preferredKey?: string | null;
    stored: readonly TranscriptSourceMeta[];
    tracks: ReadonlyArray<{
        language: string | null;
    }>;
}) => TranscriptSourceOption[];
/**
 * Pick the stored row that matches the source the user is viewing.
 *
 * ASR without a finished transcript returns null so the idle empty state can
 * show. Captions still fall back to the latest row when a language is missing.
 * History may be superseded; callers must pass every row, newest first.
 *
 * @param selected Option marked selected in `buildTranscriptSources`.
 * @param stored History for this download, newest first.
 * @param fallback Latest row when a captions source has no finished record.
 */
export declare const recordForTranscriptSource: <T extends TranscriptSourceMeta>(selected: TranscriptSourceOption | undefined, stored: readonly T[], fallback: T | null) => T | null;
/**
 * Latest current row, or the newest row for the latest task when nothing is current.
 *
 * @param heads Rows for one download, newest first.
 * @param latestTaskId Newest transcription child, if any.
 */
export declare const latestTranscriptHead: <T extends TranscriptHead>(heads: readonly T[], latestTaskId: string | null) => T | null;
/**
 * Resolve the transcript row `getTranscriptSnapshot` would select, using heads only.
 *
 * @param input Newest-first heads, sidecar languages, and the viewing key.
 */
export declare const resolveTranscriptHeads: <T extends TranscriptHead>(input: {
    asrActive: boolean;
    heads: readonly T[];
    latestTaskId: string | null;
    preferredKey?: string | null;
    tracks: ReadonlyArray<{
        language: string | null;
    }>;
}) => {
    latest: T | null;
    selected: T | null;
    sources: TranscriptSourceOption[];
};
/**
 * Group newest-first heads by download without copying row objects.
 *
 * @param heads Library heads, newest first.
 */
export declare const groupTranscriptHeads: (heads: readonly TranscriptHead[]) => Map<string, TranscriptHead[]>;
