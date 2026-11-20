import { dual } from "effect/Function";

export const MIN_DURATION_ON_SEC = 0.3;

export const MIN_DURATION_OFF_SEC = 0.5;

export const DIARIZE_NUM_THREADS = 2;

export const MAX_ASR_CHUNK_MS = 15_000;

const splitTurnForAsrDataFirst = <T extends { startMs: number; endMs: number }>(
  turn: T,
  maxChunkMs = MAX_ASR_CHUNK_MS
): T[] => {
  if (turn.endMs - turn.startMs <= maxChunkMs) {
    return [turn];
  }
  const pieces: T[] = [];
  for (let startMs = turn.startMs; startMs < turn.endMs; startMs += maxChunkMs) {
    pieces.push({ ...turn, startMs, endMs: Math.min(turn.endMs, startMs + maxChunkMs) });
  }
  return pieces;
};

export const splitTurnForAsr: {
  <T extends { startMs: number; endMs: number }>(turn: T, maxChunkMs?: number): T[];
  (maxChunkMs?: number): <T extends { startMs: number; endMs: number }>(turn: T) => T[];
} = dual(
  (args) => args.length >= 2 || (args.length === 1 && typeof args[0] !== "number" && args[0] !== undefined),
  splitTurnForAsrDataFirst
);
