import * as A from "effect/Array";
import { dual } from "effect/Function";
import * as O from "effect/Option";
import * as P from "effect/Predicate";
import type { RefineSpeakerOptions, TimedTurn, TimeInterval } from "./Pipeline.model.js";

export type { RefineSpeakerOptions, TimedTurn, TimeInterval } from "./Pipeline.model.js";

/** Turns shorter than this do not seed clusters; they inherit a neighbor. */
export const MIN_CLUSTER_TURN_MS = 400;
/** Auto mode only: merge clusters shorter than this (pyannote glitches), not a % share. */
export const MIN_CLUSTER_DURATION_MS = 2_000;
/** Max gap when merging a short cluster into its nearest neighbor. */
export const MAX_MERGE_GAP_MS = 30_000;
/** Ignore VAD as a speech mask when it covers less than this share of the file. */
export const MIN_VAD_COVERAGE = 0.2;
/** Fill timeline holes larger than this so ASR cannot stop after the first line. */
export const MAX_UNCOVERED_GAP_MS = 2_000;

const durationOf = (turn: TimeInterval): number => Math.max(0, turn.endMs - turn.startMs);

const overlaps = (a: TimeInterval, b: TimeInterval): boolean =>
  Math.min(a.endMs, b.endMs) > Math.max(a.startMs, b.startMs);

const gapBetween = (a: TimeInterval, b: TimeInterval): number => {
  if (overlaps(a, b)) {
    return 0;
  }
  return a.endMs <= b.startMs ? b.startMs - a.endMs : a.startMs - b.endMs;
};

const nearestSpeaker = (targets: TimedTurn[], pool: TimedTurn[]): { speakerKey: string; gap: number } | null => {
  let best: { speakerKey: string; gap: number } | null = null;
  for (const target of targets) {
    for (const other of pool) {
      const gap = gapBetween(target, other);
      if (best === null || gap < best.gap) {
        best = { speakerKey: other.speakerKey, gap };
      }
    }
  }
  return best;
};

/**
 * Merge adjacent same-speaker turns that almost touch.
 *
 * @param turns Unsorted or overlapping speaker turns.
 */
export const mergeAdjacentTurns = (turns: TimedTurn[]): TimedTurn[] => {
  const sorted = [...turns].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const merged: TimedTurn[] = [];
  for (const turn of sorted) {
    const prev = O.getOrUndefined(A.last(merged));
    if (prev !== undefined && prev.speakerKey === turn.speakerKey && turn.startMs <= prev.endMs + 400) {
      prev.endMs = Math.max(prev.endMs, turn.endMs);
      continue;
    }
    merged.push({ ...turn });
  }
  return merged;
};

/**
 * Post-process raw diarization turns: fold sub-400ms fragments into neighbors
 * and, in auto mode, merge leftover clusters shorter than 2s. A percent-of-file
 * floor is not used — that erased low-talk guests on long videos.
 */
const refineSpeakerTurnsDataFirst = (
  raw: TimedTurn[],
  _speech: TimeInterval[],
  _totalDurationMs: number,
  options?: RefineSpeakerOptions
): TimedTurn[] => {
  const speechAware = A.map(raw, (turn) => ({ ...turn }));
  if (speechAware.length === 0) {
    return [];
  }

  const long = A.filter(speechAware, (turn) => durationOf(turn) >= MIN_CLUSTER_TURN_MS);
  const short = A.filter(speechAware, (turn) => durationOf(turn) < MIN_CLUSTER_TURN_MS);
  for (const fragment of short) {
    const neighbor = nearestSpeaker([fragment], long);
    fragment.speakerKey = neighbor !== null ? neighbor.speakerKey : "unknown";
  }

  const combined = mergeAdjacentTurns([...long, ...short]);
  if (P.isTruthy(options?.knownCount)) {
    return combined;
  }

  const keys = A.filter(A.dedupe(A.map(combined, (turn) => turn.speakerKey)), (key) => key !== "unknown");
  for (const key of keys) {
    const mine = A.filter(combined, (turn) => turn.speakerKey === key);
    const dur = A.reduce(mine, 0, (sum, turn) => sum + durationOf(turn));
    if (dur >= MIN_CLUSTER_DURATION_MS) {
      continue;
    }
    const others = A.filter(combined, (turn) => turn.speakerKey !== key && turn.speakerKey !== "unknown");
    const neighbor = nearestSpeaker(mine, others);
    const nextKey = neighbor !== null && neighbor.gap <= MAX_MERGE_GAP_MS ? neighbor.speakerKey : "unknown";
    for (const turn of mine) {
      turn.speakerKey = nextKey;
    }
  }

  return mergeAdjacentTurns(combined);
};
export const refineSpeakerTurns: {
  (raw: TimedTurn[], _speech: TimeInterval[], _totalDurationMs: number, options?: RefineSpeakerOptions): TimedTurn[];
  (
    _speech: TimeInterval[],
    _totalDurationMs: number,
    options?: RefineSpeakerOptions
  ): (raw: TimedTurn[]) => TimedTurn[];
} = dual((args) => A.isArray(args[1]), refineSpeakerTurnsDataFirst);

/**
 * Sum the duration of a list of intervals.
 */
export const intervalDurationMs = (intervals: TimeInterval[]): number =>
  A.reduce(intervals, 0, (sum, interval) => sum + durationOf(interval));

/**
 * Return true when VAD spans enough of the file to use as a speech mask.
 */
const shouldTrustSpeechIntervalsDataFirst = (speechMs: number, totalDurationMs: number): boolean => {
  if (speechMs <= 0 || totalDurationMs <= 0) {
    return false;
  }
  return speechMs >= totalDurationMs * MIN_VAD_COVERAGE;
};
export const shouldTrustSpeechIntervals: {
  (speechMs: number, totalDurationMs: number): boolean;
  (totalDurationMs: number): (speechMs: number) => boolean;
} = dual(2, shouldTrustSpeechIntervalsDataFirst);

/**
 * Insert unknown-speaker turns for large holes so later speech is still recognized.
 */
const fillUncoveredTurnsDataFirst = (
  turns: TimedTurn[],
  totalDurationMs: number,
  maxGapMs = MAX_UNCOVERED_GAP_MS
): TimedTurn[] => {
  const total = Math.max(0, totalDurationMs);
  const sorted = A.filter([...turns], (turn) => turn.endMs > turn.startMs).sort(
    (a, b) => a.startMs - b.startMs || a.endMs - b.endMs
  );
  const filled: TimedTurn[] = [];
  let cursor = 0;
  for (const turn of sorted) {
    if (turn.startMs - cursor > maxGapMs) {
      filled.push({ startMs: cursor, endMs: turn.startMs, speakerKey: "unknown" });
    }
    filled.push({ ...turn });
    cursor = Math.max(cursor, turn.endMs);
  }
  if (total - cursor > maxGapMs) {
    filled.push({ startMs: cursor, endMs: total, speakerKey: "unknown" });
  }
  if (filled.length > 0) {
    return filled;
  }
  return total > 0 ? [{ startMs: 0, endMs: Math.max(1000, total), speakerKey: "unknown" }] : [];
};
export const fillUncoveredTurns: {
  (turns: TimedTurn[], totalDurationMs: number, maxGapMs?: number): TimedTurn[];
  (totalDurationMs: number, maxGapMs?: number): (turns: TimedTurn[]) => TimedTurn[];
} = dual((args) => typeof args[0] !== "number", fillUncoveredTurnsDataFirst);

/**
 * Build the speaker turns ASR will walk. Pyannote already marks speech; VAD is
 * not used as a mask. A short diarization miss cannot hide the rest of the file.
 */
const turnsForAsrDataFirst = (
  raw: TimedTurn[],
  _speech: TimeInterval[],
  totalDurationMs: number,
  options?: RefineSpeakerOptions
): TimedTurn[] => {
  const refined = refineSpeakerTurns(raw, [], totalDurationMs, options);
  const base = refined.length > 0 ? refined : raw;
  return fillUncoveredTurns(base, totalDurationMs);
};
export const turnsForAsr: {
  (raw: TimedTurn[], _speech: TimeInterval[], totalDurationMs: number, options?: RefineSpeakerOptions): TimedTurn[];
  (_speech: TimeInterval[], totalDurationMs: number, options?: RefineSpeakerOptions): (raw: TimedTurn[]) => TimedTurn[];
} = dual((args) => A.isArray(args[1]), turnsForAsrDataFirst);
