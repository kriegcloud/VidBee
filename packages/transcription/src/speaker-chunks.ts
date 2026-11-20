import * as A from "effect/Array";
import { dual } from "effect/Function";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import * as O from "effect/Option";
import * as P from "effect/Predicate";
import type { DiarizeWindow, SpeakerEmbed } from "./Pipeline.model.js";

export type { DiarizeWindow, SpeakerEmbed } from "./Pipeline.model.js";

import {
  CLUSTERING_THRESHOLD,
  clusterSpeakerEmbeddings,
  cosineDistance,
  l2Normalize,
  MAX_BRIDGED_SPEAKERS,
} from "./speaker-cluster.js";
import { mergeAdjacentTurns } from "./speaker-refine.js";
import type { TimedTurn } from "./speaker-refine.js";

/** Process this much audio per sherpa call so long podcasts stay in RAM. */
export const DIARIZE_CHUNK_MS = 10 * 60 * 1000;
/** Overlap used so a speaker turn is not cut exactly at a chunk boundary. */
export const DIARIZE_OVERLAP_MS = 20_000;
/** Require this much overlap before two local labels are treated as the same person. */
export const MERGE_MIN_OVERLAP_MS = 800;
/** Concatenate at most this much audio when building a speaker-level embedding. */
export const SPEAKER_EMBED_MAX_MS = 8_000;
/** Skip embedding extraction when a speaker has less than this much audio. */
export const SPEAKER_EMBED_MIN_MS = 300;
/** Floor for duration-aware short-cluster folding. Far crumbs below this become unknown. */
export const SHORT_CLUSTER_MS = 5_000;
/** Ceiling for duration-aware short-cluster folding (5% of long files would otherwise grow without bound). */
export const SHORT_CLUSTER_MAX_MS = 60_000;
/** Fold candidates shorter than this fraction of total speech, after applying the floor/ceiling. */
export const SHORT_CLUSTER_SPEECH_FRACTION = 0.05;
/**
 * Cosine-distance cutoff when folding a short cluster into the nearest main
 * speaker. Calibrated 2026-08-20 on 高能量 Vol.230 (two Chinese male voices:
 * same-person fragments ≈0.30, cross-person 0.741). Larger than the 0.5
 * recluster threshold so crumbs can still join a main speaker.
 */
export const SHORT_CLUSTER_FOLD_DISTANCE = 0.65;

/**
 * Duration-aware fold threshold: max(5s, min(60s, 5% × total speech)).
 *
 * HTX (~428s speech) → 21.4s so a 6s host fragment folds; a 42s third speaker
 * stays. Geng mains (2364s / 1832s) sit far above the 60s ceiling.
 */
export const shortClusterFoldMs = (totalSpeechMs: number): number =>
  Math.max(
    SHORT_CLUSTER_MS,
    Math.min(SHORT_CLUSTER_MAX_MS, SHORT_CLUSTER_SPEECH_FRACTION * Math.max(0, totalSpeechMs))
  );

/**
 * Split a timeline into overlapping windows. Short files stay as one window.
 *
 * @param durationMs Audio length in milliseconds.
 */
export const diarizeChunkWindows = (durationMs: number): DiarizeWindow[] => {
  const total = Math.max(0, durationMs);
  if (total <= DIARIZE_CHUNK_MS + DIARIZE_OVERLAP_MS) {
    return total > 0 ? [{ startMs: 0, endMs: total }] : [];
  }
  const windows: DiarizeWindow[] = [];
  let startMs = 0;
  while (startMs < total) {
    const endMs = Math.min(total, startMs + DIARIZE_CHUNK_MS);
    windows.push({ startMs, endMs });
    if (endMs >= total) {
      break;
    }
    startMs = endMs - DIARIZE_OVERLAP_MS;
  }
  return windows;
};

/**
 * Shift turn timestamps by a chunk offset (sherpa times are relative to the slice).
 *
 * @param turns Turns whose times start at 0 for the slice.
 * @param offsetMs Chunk start on the full timeline.
 */
const shiftTurnsDataFirst = (turns: TimedTurn[], offsetMs: number): TimedTurn[] =>
  A.map(turns, (turn) => ({
    ...turn,
    startMs: turn.startMs + offsetMs,
    endMs: turn.endMs + offsetMs,
  }));
export const shiftTurns: {
  (turns: TimedTurn[], offsetMs: number): TimedTurn[];
  (offsetMs: number): (turns: TimedTurn[]) => TimedTurn[];
} = dual(2, shiftTurnsDataFirst);

const overlapMs = (left: TimedTurn, right: TimedTurn): number =>
  Math.max(0, Math.min(left.endMs, right.endMs) - Math.max(left.startMs, right.startMs));

const durationOf = (turn: TimedTurn): number => Math.max(0, turn.endMs - turn.startMs);

const turnsOverlap = (left: TimedTurn, right: TimedTurn): boolean =>
  Math.min(left.endMs, right.endMs) > Math.max(left.startMs, right.startMs);

const nextSpeakerIndex = (turns: TimedTurn[]): number => {
  let max = 0;
  for (const turn of turns) {
    const match = /^speaker-(\d+)$/.exec(turn.speakerKey);
    const n = match !== null ? Number.parseInt(match[1] ?? "0", 10) : 0;
    if (n > max) {
      max = n;
    }
  }
  return max + 1;
};

/**
 * Pick the longest clean (non-overlapped) turns for one local speaker, falling
 * back to overlapping turns when no exclusive speech exists. Caps total audio.
 *
 * @param turns All turns in the chunk.
 * @param speakerKey Local speaker id.
 * @param maxMs Maximum concatenated audio.
 */
const pickSpeakerEmbedTurnsDataFirst = (
  turns: readonly TimedTurn[],
  speakerKey: string,
  maxMs = SPEAKER_EMBED_MAX_MS
): TimedTurn[] => {
  const mine = A.filter(turns, (turn) => turn.speakerKey === speakerKey && durationOf(turn) > 0);
  if (mine.length === 0) {
    return [];
  }
  const others = A.filter(turns, (turn) => turn.speakerKey !== speakerKey && turn.speakerKey !== "unknown");
  const clean = A.filter(mine, (turn) => !A.some(others, (other) => turnsOverlap(turn, other)));
  const pool = [...(clean.length > 0 ? clean : mine)].sort((a, b) => durationOf(b) - durationOf(a));
  const picked: TimedTurn[] = [];
  let used = 0;
  for (const turn of pool) {
    if (used >= maxMs) {
      break;
    }
    const take = Math.min(durationOf(turn), maxMs - used);
    picked.push({ ...turn, endMs: turn.startMs + take });
    used += take;
  }
  return used >= SPEAKER_EMBED_MIN_MS ? picked : [];
};
export const pickSpeakerEmbedTurns: {
  (turns: readonly TimedTurn[], speakerKey: string, maxMs?: number): TimedTurn[];
  (speakerKey: string, maxMs?: number): (turns: readonly TimedTurn[]) => TimedTurn[];
} = dual((args) => typeof args[0] !== "string", pickSpeakerEmbedTurnsDataFirst);

/**
 * Clip previous/next turns at a midpoint so overlapping chunks do not double-count.
 *
 * @param previous Turns already on the global timeline.
 * @param next Turns from the new chunk, already shifted to global time.
 * @param midMs Split point.
 */
const stitchTurnsAtMidpointDataFirst = (previous: TimedTurn[], next: TimedTurn[], midMs: number): TimedTurn[] => {
  const keptPrev = A.filter(
    A.map(previous, (turn) => ({ ...turn, endMs: Math.min(turn.endMs, midMs) })),
    (turn) => turn.endMs > turn.startMs
  );
  const keptNext = A.filter(
    A.map(next, (turn) => ({ ...turn, startMs: Math.max(turn.startMs, midMs) })),
    (turn) => turn.endMs > turn.startMs
  );
  return mergeAdjacentTurns([...keptPrev, ...keptNext]);
};
export const stitchTurnsAtMidpoint: {
  (previous: TimedTurn[], next: TimedTurn[], midMs: number): TimedTurn[];
  (next: TimedTurn[], midMs: number): (previous: TimedTurn[]) => TimedTurn[];
} = dual(3, stitchTurnsAtMidpointDataFirst);

/**
 * Map next-chunk speaker keys onto previous-chunk keys using the overlap region.
 * Fallback when a speaker has no embedding.
 *
 * @param previous Turns already on the global timeline.
 * @param next Turns from the new chunk, already shifted to global time.
 * @param overlapStartMs Inclusive start of the shared region.
 * @param overlapEndMs Exclusive end of the shared region.
 */
const mergeChunkTurnsDataFirst = (
  previous: TimedTurn[],
  next: TimedTurn[],
  overlapStartMs: number,
  overlapEndMs: number
): TimedTurn[] => {
  const mid = Math.round((overlapStartMs + overlapEndMs) / 2);
  const keptPrev = A.filter(
    A.map(previous, (turn) => ({ ...turn, endMs: Math.min(turn.endMs, mid) })),
    (turn) => turn.endMs > turn.startMs
  );
  const keptNext = A.filter(
    A.map(next, (turn) => ({ ...turn, startMs: Math.max(turn.startMs, mid) })),
    (turn) => turn.endMs > turn.startMs
  );
  if (keptNext.length === 0) {
    return mergeAdjacentTurns(keptPrev);
  }
  const prevOverlap = A.filter(previous, (turn) => turn.endMs > overlapStartMs && turn.startMs < overlapEndMs);
  const nextOverlap = A.filter(next, (turn) => turn.endMs > overlapStartMs && turn.startMs < overlapEndMs);
  let mapping = HashMap.empty<string, string>();
  let nextIndex = nextSpeakerIndex(keptPrev);
  const localKeys = A.dedupe(A.map(keptNext, (turn) => turn.speakerKey));
  for (const local of localKeys) {
    if (local === "unknown") {
      mapping = HashMap.set(mapping, local, "unknown");
      continue;
    }
    const mine = A.filter(nextOverlap, (turn) => turn.speakerKey === local);
    let bestKey = "";
    let bestMs = 0;
    const globalKeys = A.filter(A.dedupe(A.map(prevOverlap, (turn) => turn.speakerKey)), (key) => key !== "unknown");
    for (const global of globalKeys) {
      const theirs = A.filter(prevOverlap, (turn) => turn.speakerKey === global);
      let sum = 0;
      for (const a of mine) {
        for (const b of theirs) {
          sum += overlapMs(a, b);
        }
      }
      if (sum > bestMs) {
        bestMs = sum;
        bestKey = global;
      }
    }
    if (P.isTruthy(bestKey) && bestMs >= MERGE_MIN_OVERLAP_MS) {
      mapping = HashMap.set(mapping, local, bestKey);
      continue;
    }
    mapping = HashMap.set(mapping, local, `speaker-${nextIndex}`);
    nextIndex += 1;
  }
  const remapped = A.map(keptNext, (turn) => ({
    ...turn,
    speakerKey: O.getOrUndefined(HashMap.get(mapping, turn.speakerKey)) ?? turn.speakerKey,
  }));
  return mergeAdjacentTurns([...keptPrev, ...remapped]);
};
export const mergeChunkTurns: {
  (previous: TimedTurn[], next: TimedTurn[], overlapStartMs: number, overlapEndMs: number): TimedTurn[];
  (next: TimedTurn[], overlapStartMs: number, overlapEndMs: number): (previous: TimedTurn[]) => TimedTurn[];
} = dual(4, mergeChunkTurnsDataFirst);

const embedId = (chunkIndex: number, speakerKey: string): string => `${chunkIndex}:${speakerKey}`;

const meanEmbedding = (vectors: readonly Float32Array[]): Float32Array | null => {
  if (vectors.length === 0) {
    return null;
  }
  const dim = vectors[0]?.length ?? 0;
  if (dim === 0) {
    return null;
  }
  const acc = new Float32Array(dim);
  for (const vector of vectors) {
    const unit = l2Normalize(Float32Array.from(vector));
    for (let i = 0; i < dim; i += 1) {
      acc[i] = (acc[i] ?? 0) + (unit[i] ?? 0);
    }
  }
  for (let i = 0; i < dim; i += 1) {
    acc[i] = (acc[i] ?? 0) / vectors.length;
  }
  return l2Normalize(acc);
};

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
const foldShortClustersDataFirst = (
  clusters: HashMap.HashMap<string, number>,
  chunkTurns: readonly TimedTurn[][],
  chunkEmbeds: readonly SpeakerEmbed[][],
  foldDistance = SHORT_CLUSTER_FOLD_DISTANCE
): HashMap.HashMap<string, number | "unknown"> => {
  let aliased = HashMap.empty<string, number | "unknown">();
  let durationByCluster = HashMap.empty<number, number>();
  const durationOrder: number[] = [];
  let vectorsByCluster = HashMap.empty<number, Float32Array[]>();
  for (let i = 0; i < chunkTurns.length; i += 1) {
    for (const turn of chunkTurns[i] ?? []) {
      const id = embedId(i, turn.speakerKey);
      const cluster = O.getOrUndefined(HashMap.get(clusters, id));
      if (cluster === undefined) {
        continue;
      }
      if (!HashMap.has(durationByCluster, cluster)) durationOrder.push(cluster);
      durationByCluster = HashMap.set(
        durationByCluster,
        cluster,
        (O.getOrUndefined(HashMap.get(durationByCluster, cluster)) ?? 0) + durationOf(turn)
      );
    }
  }
  for (let i = 0; i < chunkEmbeds.length; i += 1) {
    for (const embed of chunkEmbeds[i] ?? []) {
      const cluster = O.getOrUndefined(HashMap.get(clusters, embedId(i, embed.speakerKey)));
      if (cluster === undefined) {
        continue;
      }
      const list = O.getOrUndefined(HashMap.get(vectorsByCluster, cluster)) ?? [];
      list.push(embed.vector);
      vectorsByCluster = HashMap.set(vectorsByCluster, cluster, list);
    }
  }
  const totalSpeechMs = A.reduce(HashMap.values(durationByCluster), 0, (sum, ms) => sum + ms);
  const foldMs = shortClusterFoldMs(totalSpeechMs);
  const labels = durationOrder;
  const mains = A.filter(labels, (label) => (O.getOrUndefined(HashMap.get(durationByCluster, label)) ?? 0) >= foldMs);
  if (mains.length === 0) {
    for (const [id, cluster] of clusters) {
      aliased = HashMap.set(aliased, id, cluster);
    }
    return aliased;
  }
  let meanByCluster = HashMap.empty<number, Float32Array>();
  for (const label of labels) {
    const mean = meanEmbedding(O.getOrUndefined(HashMap.get(vectorsByCluster, label)) ?? []);
    if (mean !== null) {
      meanByCluster = HashMap.set(meanByCluster, label, mean);
    }
  }
  let alias = HashMap.empty<number, number | "unknown">();
  for (const label of labels) {
    const duration = O.getOrUndefined(HashMap.get(durationByCluster, label)) ?? 0;
    if (duration >= foldMs) {
      alias = HashMap.set(alias, label, label);
      continue;
    }
    const own = O.getOrUndefined(HashMap.get(meanByCluster, label));
    if (own === undefined) {
      alias = HashMap.set(alias, label, duration < SHORT_CLUSTER_MS ? "unknown" : label);
      continue;
    }
    let best: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const main of mains) {
      const other = O.getOrUndefined(HashMap.get(meanByCluster, main));
      if (other === undefined) {
        continue;
      }
      const distance = cosineDistance(own, other);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = main;
      }
    }
    if (best !== null && bestDistance <= foldDistance) {
      alias = HashMap.set(alias, label, best);
    } else if (duration < SHORT_CLUSTER_MS) {
      alias = HashMap.set(alias, label, "unknown");
    } else {
      alias = HashMap.set(alias, label, label);
    }
  }
  for (const [id, cluster] of clusters) {
    aliased = HashMap.set(aliased, id, O.getOrUndefined(HashMap.get(alias, cluster)) ?? cluster);
  }
  return aliased;
};
export const foldShortClusters: {
  (
    clusters: HashMap.HashMap<string, number>,
    chunkTurns: readonly TimedTurn[][],
    chunkEmbeds: readonly SpeakerEmbed[][],
    foldDistance?: number
  ): HashMap.HashMap<string, number | "unknown">;
  (
    chunkTurns: readonly TimedTurn[][],
    chunkEmbeds: readonly SpeakerEmbed[][],
    foldDistance?: number
  ): (clusters: HashMap.HashMap<string, number>) => HashMap.HashMap<string, number | "unknown">;
} = dual((args) => HashMap.isHashMap(args[0]), foldShortClustersDataFirst);

/**
 * After threshold clustering and short-cluster fold, keep the longest
 * `maxSpeakers` clusters. Remaining clusters fold into the nearest keeper
 * when cosine distance ≤ 0.65, otherwise become unknown.
 *
 * This replaces the old force-merge-to-k which ignored the distance threshold
 * and could merge the two real speakers before leftover fragments.
 */
const capExcessClustersDataFirst = (
  clusters: HashMap.HashMap<string, number | "unknown">,
  chunkTurns: readonly TimedTurn[][],
  chunkEmbeds: readonly SpeakerEmbed[][],
  maxSpeakers = MAX_BRIDGED_SPEAKERS,
  foldDistance = SHORT_CLUSTER_FOLD_DISTANCE
): HashMap.HashMap<string, number | "unknown"> => {
  let durationByCluster = HashMap.empty<number, number>();
  const durationOrder: number[] = [];
  let vectorsByCluster = HashMap.empty<number, Float32Array[]>();
  for (let i = 0; i < chunkTurns.length; i += 1) {
    for (const turn of chunkTurns[i] ?? []) {
      const mapped = O.getOrUndefined(HashMap.get(clusters, embedId(i, turn.speakerKey)));
      if (typeof mapped !== "number") {
        continue;
      }
      if (!HashMap.has(durationByCluster, mapped)) durationOrder.push(mapped);
      durationByCluster = HashMap.set(
        durationByCluster,
        mapped,
        (O.getOrUndefined(HashMap.get(durationByCluster, mapped)) ?? 0) + durationOf(turn)
      );
    }
  }
  for (let i = 0; i < chunkEmbeds.length; i += 1) {
    for (const embed of chunkEmbeds[i] ?? []) {
      const mapped = O.getOrUndefined(HashMap.get(clusters, embedId(i, embed.speakerKey)));
      if (typeof mapped !== "number") {
        continue;
      }
      const list = O.getOrUndefined(HashMap.get(vectorsByCluster, mapped)) ?? [];
      list.push(embed.vector);
      vectorsByCluster = HashMap.set(vectorsByCluster, mapped, list);
    }
  }
  const ranked = A.map(
    durationOrder,
    (label) => [label, O.getOrUndefined(HashMap.get(durationByCluster, label)) ?? 0] as const
  ).sort((left, right) => right[1] - left[1]);
  if (ranked.length <= maxSpeakers) {
    return clusters;
  }
  const keepers = A.map(
    A.take(ranked, maxSpeakers < 0 ? Math.max(0, ranked.length + Math.trunc(maxSpeakers)) : maxSpeakers),
    ([label]) => label
  );
  const keeperSet = HashSet.fromIterable(keepers);
  let meanByCluster = HashMap.empty<number, Float32Array>();
  for (const [label] of ranked) {
    const mean = meanEmbedding(O.getOrUndefined(HashMap.get(vectorsByCluster, label)) ?? []);
    if (mean !== null) {
      meanByCluster = HashMap.set(meanByCluster, label, mean);
    }
  }
  let alias = HashMap.empty<number, number | "unknown">();
  for (const label of keepers) {
    alias = HashMap.set(alias, label, label);
  }
  for (const [label] of ranked) {
    if (HashSet.has(keeperSet, label)) {
      continue;
    }
    const own = O.getOrUndefined(HashMap.get(meanByCluster, label));
    if (own === undefined) {
      alias = HashMap.set(alias, label, "unknown");
      continue;
    }
    let best: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const main of keepers) {
      const other = O.getOrUndefined(HashMap.get(meanByCluster, main));
      if (other === undefined) {
        continue;
      }
      const distance = cosineDistance(own, other);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = main;
      }
    }
    alias = HashMap.set(alias, label, best !== null && bestDistance <= foldDistance ? best : "unknown");
  }
  let out = HashMap.empty<string, number | "unknown">();
  for (const [id, cluster] of clusters) {
    if (cluster === "unknown") {
      out = HashMap.set(out, id, "unknown");
      continue;
    }
    out = HashMap.set(out, id, O.getOrUndefined(HashMap.get(alias, cluster)) ?? cluster);
  }
  return out;
};
export const capExcessClusters: {
  (
    clusters: HashMap.HashMap<string, number | "unknown">,
    chunkTurns: readonly TimedTurn[][],
    chunkEmbeds: readonly SpeakerEmbed[][],
    maxSpeakers?: number,
    foldDistance?: number
  ): HashMap.HashMap<string, number | "unknown">;
  (
    chunkTurns: readonly TimedTurn[][],
    chunkEmbeds: readonly SpeakerEmbed[][],
    maxSpeakers?: number,
    foldDistance?: number
  ): (clusters: HashMap.HashMap<string, number | "unknown">) => HashMap.HashMap<string, number | "unknown">;
} = dual((args) => HashMap.isHashMap(args[0]), capExcessClustersDataFirst);

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
const mergeChunkTurnsByEmbeddingsDataFirst = (
  windows: readonly DiarizeWindow[],
  chunkTurns: readonly TimedTurn[][],
  chunkEmbeds: readonly SpeakerEmbed[][],
  opts?: { threshold?: number | undefined; k?: number | undefined }
): TimedTurn[] => {
  const items = A.flatMap(chunkEmbeds, (embeds, chunkIndex) =>
    A.map(embeds, (embed) => ({ id: embedId(chunkIndex, embed.speakerKey), vector: embed.vector }))
  );
  const clustered = clusterSpeakerEmbeddings(items, {
    threshold: opts?.threshold ?? CLUSTERING_THRESHOLD,
    k: opts?.k,
  });
  const resolved =
    typeof opts?.k === "number" && opts.k >= 1
      ? clustered
      : capExcessClusters(foldShortClusters(clustered, chunkTurns, chunkEmbeds), chunkTurns, chunkEmbeds);
  let localToGlobal = HashMap.empty<string, string>();
  let clusterToGlobal = HashMap.empty<number, string>();
  let nextIndex = 1;
  const assign = (id: string, speakerKey: string): string => {
    if (speakerKey === "unknown") {
      return "unknown";
    }
    const existing = O.getOrUndefined(HashMap.get(localToGlobal, id));
    if (existing !== undefined && P.isTruthy(existing)) {
      return existing;
    }
    const cluster = O.getOrUndefined(HashMap.get(resolved, id));
    if (cluster === "unknown") {
      localToGlobal = HashMap.set(localToGlobal, id, "unknown");
      return "unknown";
    }
    if (typeof cluster === "number") {
      const mapped = O.getOrUndefined(HashMap.get(clusterToGlobal, cluster));
      if (mapped !== undefined && P.isTruthy(mapped)) {
        localToGlobal = HashMap.set(localToGlobal, id, mapped);
        return mapped;
      }
      const key = `speaker-${nextIndex}`;
      nextIndex += 1;
      clusterToGlobal = HashMap.set(clusterToGlobal, cluster, key);
      localToGlobal = HashMap.set(localToGlobal, id, key);
      return key;
    }
    const key = `speaker-${nextIndex}`;
    nextIndex += 1;
    localToGlobal = HashMap.set(localToGlobal, id, key);
    return key;
  };
  for (let i = 0; i < chunkTurns.length; i += 1) {
    const ordered = [...(chunkTurns[i] ?? [])].sort((a, b) => a.startMs - b.startMs);
    for (const turn of ordered) {
      assign(embedId(i, turn.speakerKey), turn.speakerKey);
    }
  }

  let merged: TimedTurn[] = [];
  for (let i = 0; i < chunkTurns.length; i += 1) {
    const remapped = A.map(chunkTurns[i] ?? [], (turn) => ({
      ...turn,
      speakerKey: O.getOrUndefined(HashMap.get(localToGlobal, embedId(i, turn.speakerKey))) ?? turn.speakerKey,
    }));
    if (i === 0) {
      merged = remapped;
      continue;
    }
    const window = windows[i];
    const mid = window !== undefined ? window.startMs + Math.round(DIARIZE_OVERLAP_MS / 2) : 0;
    merged = stitchTurnsAtMidpoint(merged, remapped, mid);
  }
  return mergeAdjacentTurns(merged);
};
export const mergeChunkTurnsByEmbeddings: {
  (
    windows: readonly DiarizeWindow[],
    chunkTurns: readonly TimedTurn[][],
    chunkEmbeds: readonly SpeakerEmbed[][],
    opts?: { threshold?: number | undefined; k?: number | undefined }
  ): TimedTurn[];
  (
    chunkTurns: readonly TimedTurn[][],
    chunkEmbeds: readonly SpeakerEmbed[][],
    opts?: { threshold?: number | undefined; k?: number | undefined }
  ): (windows: readonly DiarizeWindow[]) => TimedTurn[];
} = dual((args) => args.length >= 3 && A.isArray(args[2]), mergeChunkTurnsByEmbeddingsDataFirst);
