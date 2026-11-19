// Pre-port compiler-emitted declaration closure; kept unchanged for compatibility checks.
export declare const MAX_BRIDGED_SPEAKERS = 8;
/**
 * Cosine-distance cutoff for sherpa FastClustering (`numClusters: -1`) and for
 * speaker-level embedding bridging across 10-minute chunks.
 *
 * Official k2-fsa example (`python-api-examples/offline-speaker-diarization.py`)
 * uses 0.5. Larger values merge more speakers. Calibrated 2026-08-20 on
 * CAM++ zh-en advanced + pyannote-segmentation-3.0:
 * - official `0-four-speakers-zh.wav`: 4 speakers at 0.5–0.7, 3 at 0.8
 * - Chinese solo (阿Test, 90s): one cluster ≥2s at 0.5 (crumbs <2s are refined away)
 * - Chinese podcast (小宇宙, 90s): two main clusters plus short guests at 0.5
 * - English clip (HTX, 90s): two clusters ≥2s at 0.6, three at 0.5
 * 0.5 is kept as the official default; it is the highest-recall value that still
 * hits 4 on the required test wav.
 */
export declare const CLUSTERING_THRESHOLD = 0.5;
export interface SpeakerEmbedItem {
    id: string;
    vector: Float32Array;
}
/**
 * L2-normalize a vector in place and return it. Zero vectors stay zero.
 *
 * @param vector Speaker embedding.
 */
export declare const l2Normalize: (vector: Float32Array) => Float32Array;
/**
 * Cosine distance for unit vectors: 1 - dot product, clipped to [0, 2].
 *
 * @param left First unit embedding.
 * @param right Second unit embedding.
 */
export declare const cosineDistance: (left: Float32Array, right: Float32Array) => number;
/**
 * Average-linkage agglomerative clustering. Returns a label per vector in 0..k-1.
 *
 * @param vectors L2-normalized embeddings.
 * @param k Target cluster count.
 */
export declare const agglomerativeLabels: (vectors: readonly Float32Array[], k: number) => number[];
/**
 * Average-linkage clustering that stops merging once the next pair is farther
 * than `threshold`. Does not force a cluster-count cap — that used to merge
 * real speakers before leftover fragments. Duration-aware capping lives in
 * `mergeChunkTurnsByEmbeddings`.
 *
 * @param vectors L2-normalized embeddings.
 * @param threshold Cosine-distance cutoff. Larger → fewer clusters.
 */
export declare const agglomerativeLabelsByThreshold: (vectors: readonly Float32Array[], threshold: number) => number[];
/**
 * Cluster speaker-level embeddings into 0..k-1 labels keyed by item id.
 *
 * Manual `k` cuts at that count. Auto uses `threshold` only — leftover
 * fragments are folded later by duration, not by forcing k.
 *
 * @param items One embedding per local speaker (usually per chunk).
 * @param opts Threshold and optional fixed speaker count.
 */
export declare const clusterSpeakerEmbeddings: (items: readonly SpeakerEmbedItem[], opts?: {
    threshold?: number;
    k?: number;
}) => Map<string, number>;
