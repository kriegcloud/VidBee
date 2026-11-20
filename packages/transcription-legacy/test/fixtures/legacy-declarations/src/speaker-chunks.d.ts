// Pre-port compiler-emitted declaration closure; kept unchanged for compatibility checks.
import { type TimedTurn } from './speaker-refine';
/** Process this much audio per sherpa call so long podcasts stay in RAM. */
export declare const DIARIZE_CHUNK_MS: number;
/** Overlap used so a speaker turn is not cut exactly at a chunk boundary. */
export declare const DIARIZE_OVERLAP_MS = 20000;
/** Require this much overlap before two local labels are treated as the same person. */
export declare const MERGE_MIN_OVERLAP_MS = 800;
/** Concatenate at most this much audio when building a speaker-level embedding. */
export declare const SPEAKER_EMBED_MAX_MS = 8000;
/** Skip embedding extraction when a speaker has less than this much audio. */
export declare const SPEAKER_EMBED_MIN_MS = 300;
/** Floor for duration-aware short-cluster folding. Far crumbs below this become unknown. */
export declare const SHORT_CLUSTER_MS = 5000;
/** Ceiling for duration-aware short-cluster folding (5% of long files would otherwise grow without bound). */
export declare const SHORT_CLUSTER_MAX_MS = 60000;
/** Fold candidates shorter than this fraction of total speech, after applying the floor/ceiling. */
export declare const SHORT_CLUSTER_SPEECH_FRACTION = 0.05;
/**
 * Cosine-distance cutoff when folding a short cluster into the nearest main
 * speaker. Calibrated 2026-08-20 on 高能量 Vol.230 (two Chinese male voices:
 * same-person fragments ≈0.30, cross-person 0.741). Larger than the 0.5
 * recluster threshold so crumbs can still join a main speaker.
 */
export declare const SHORT_CLUSTER_FOLD_DISTANCE = 0.65;
/**
 * Duration-aware fold threshold: max(5s, min(60s, 5% × total speech)).
 *
 * HTX (~428s speech) → 21.4s so a 6s host fragment folds; a 42s third speaker
 * stays. Geng mains (2364s / 1832s) sit far above the 60s ceiling.
 */
export declare const shortClusterFoldMs: (totalSpeechMs: number) => number;
export interface DiarizeWindow {
    startMs: number;
    endMs: number;
}
export interface SpeakerEmbed {
    speakerKey: string;
    vector: Float32Array;
}
/**
 * Split a timeline into overlapping windows. Short files stay as one window.
 *
 * @param durationMs Audio length in milliseconds.
 */
export declare const diarizeChunkWindows: (durationMs: number) => DiarizeWindow[];
/**
 * Shift turn timestamps by a chunk offset (sherpa times are relative to the slice).
 *
 * @param turns Turns whose times start at 0 for the slice.
 * @param offsetMs Chunk start on the full timeline.
 */
export declare const shiftTurns: (turns: TimedTurn[], offsetMs: number) => TimedTurn[];
/**
 * Pick the longest clean (non-overlapped) turns for one local speaker, falling
 * back to overlapping turns when no exclusive speech exists. Caps total audio.
 *
 * @param turns All turns in the chunk.
 * @param speakerKey Local speaker id.
 * @param maxMs Maximum concatenated audio.
 */
export declare const pickSpeakerEmbedTurns: (turns: readonly TimedTurn[], speakerKey: string, maxMs?: number) => TimedTurn[];
/**
 * Clip previous/next turns at a midpoint so overlapping chunks do not double-count.
 *
 * @param previous Turns already on the global timeline.
 * @param next Turns from the new chunk, already shifted to global time.
 * @param midMs Split point.
 */
export declare const stitchTurnsAtMidpoint: (previous: TimedTurn[], next: TimedTurn[], midMs: number) => TimedTurn[];
/**
 * Map next-chunk speaker keys onto previous-chunk keys using the overlap region.
 * Fallback when a speaker has no embedding.
 *
 * @param previous Turns already on the global timeline.
 * @param next Turns from the new chunk, already shifted to global time.
 * @param overlapStartMs Inclusive start of the shared region.
 * @param overlapEndMs Exclusive end of the shared region.
 */
export declare const mergeChunkTurns: (previous: TimedTurn[], next: TimedTurn[], overlapStartMs: number, overlapEndMs: number) => TimedTurn[];
/**
 * Fold leftover short clusters into the nearest main speaker when the
 * speaker-level cosine distance is small enough. Used after global recluster.
 * Candidates are shorter than max(5s, min(60s, 5% × total speech)). Skipped
 * when there is no main cluster at that threshold — short files would otherwise
 * collapse to unknown. Far candidates stay unknown if <5s, otherwise remain
 * independent (possible real guests).
 *
 * @param clusters Local-id → cluster label from AHC.
 * @param chunkTurns Turns per window, already shifted to global time.
 * @param chunkEmbeds Speaker-level embeddings per window.
 * @param foldDistance Cosine-distance cutoff, default 0.65.
 */
export declare const foldShortClusters: (clusters: Map<string, number>, chunkTurns: readonly TimedTurn[][], chunkEmbeds: readonly SpeakerEmbed[][], foldDistance?: number) => Map<string, number | 'unknown'>;
/**
 * After threshold clustering and short-cluster fold, keep the longest
 * `maxSpeakers` clusters. Remaining clusters fold into the nearest keeper
 * when cosine distance ≤ 0.65, otherwise become unknown.
 *
 * This replaces the old force-merge-to-k which ignored the distance threshold
 * and could merge the two real speakers before leftover fragments.
 */
export declare const capExcessClusters: (clusters: Map<string, number | 'unknown'>, chunkTurns: readonly TimedTurn[][], chunkEmbeds: readonly SpeakerEmbed[][], maxSpeakers?: number, foldDistance?: number) => Map<string, number | 'unknown'>;
/**
 * Map each chunk's local speaker ids onto global ids by clustering
 * speaker-level embeddings, then stitch overlapping windows at the midpoint.
 * Runs for one window as well as many — local sherpa labels are always
 * reclustered. Auto mode then folds leftover short clusters.
 *
 * Speaker-1 is whoever appears first on the timeline. Locals without an
 * embedding keep a unique new id unless they are shorter than 5s (unknown).
 *
 * @param windows Chunk windows in order.
 * @param chunkTurns Diarization turns per window, already shifted to global time.
 * @param chunkEmbeds Speaker-level embeddings per window.
 * @param opts Auto uses `threshold`; manual `k` cuts at that speaker count.
 */
export declare const mergeChunkTurnsByEmbeddings: (windows: readonly DiarizeWindow[], chunkTurns: readonly TimedTurn[][], chunkEmbeds: readonly SpeakerEmbed[][], opts?: {
    threshold?: number;
    k?: number;
}) => TimedTurn[];
