import * as Arr from "effect/Array";
import { dual } from "effect/Function";
import * as HashSet from "effect/HashSet";
import * as Option from "effect/Option";
import type { InsertTranscriptSegmentInput, TranscriptSegmentPatch } from "./Transcript.model.js";

export type { InsertTranscriptSegmentInput, TranscriptSegmentPatch } from "./Transcript.model.js";

import type { TranscriptSegment, TranscriptWord } from "./types.js";
export const DEFAULT_CAPTION_DURATION_MS = 2000;

/**
 * Keep non-negative integer times with end at or after start.
 *
 * @param startMs Requested start.
 * @param endMs Requested end.
 */
const clampSegmentTimesDataFirst = (
  startMs: number,
  endMs: number
): {
  endMs: number;
  startMs: number;
} => {
  const start = Math.max(0, Math.round(Number.isFinite(startMs) ? startMs : 0));
  const end = Math.max(start, Math.round(Number.isFinite(endMs) ? endMs : start));
  return {
    endMs: end,
    startMs: start,
  };
};
export const clampSegmentTimes: {
  (
    startMs: number,
    endMs: number
  ): {
    endMs: number;
    startMs: number;
  };
  (
    endMs: number
  ): (startMs: number) => {
    endMs: number;
    startMs: number;
  };
} = dual(2, clampSegmentTimesDataFirst);

/**
 * Sort by time and rewrite 0-based sort indexes.
 *
 * @param segments Caption rows in any order.
 */
export const reindexTranscriptSegments = (segments: TranscriptSegment[]): TranscriptSegment[] =>
  Arr.map(
    [...segments].sort((left, right) => left.startMs - right.startMs || left.sortIndex - right.sortIndex),
    (segment, index) => ({
      ...segment,
      sortIndex: index,
    })
  );

/**
 * Apply a text/speaker/time patch and drop word timings when the text changes.
 *
 * @param segment Row to patch.
 * @param patch Fields to overwrite.
 */
const applyTranscriptSegmentPatchDataFirst = (
  segment: TranscriptSegment,
  patch: TranscriptSegmentPatch
): TranscriptSegment => {
  const nextText = patch.text === undefined ? segment.text : patch.text;
  const times = clampSegmentTimes(patch.startMs ?? segment.startMs, patch.endMs ?? segment.endMs);
  const words: TranscriptWord[] = patch.text === undefined ? segment.words : [];
  return {
    ...segment,
    ...times,
    speakerId: patch.speakerId === undefined ? segment.speakerId : patch.speakerId,
    text: nextText,
    words,
  };
};
export const applyTranscriptSegmentPatch: {
  (segment: TranscriptSegment, patch: TranscriptSegmentPatch): TranscriptSegment;
  (patch: TranscriptSegmentPatch): (segment: TranscriptSegment) => TranscriptSegment;
} = dual(2, applyTranscriptSegmentPatchDataFirst);

/**
 * Replace one stored caption, or return null when the id is missing.
 *
 * @param segments Current rows.
 * @param segmentId Row to change.
 * @param patch Fields to overwrite.
 */
const updateTranscriptSegmentListDataFirst = (
  segments: TranscriptSegment[],
  segmentId: string,
  patch: TranscriptSegmentPatch
): TranscriptSegment[] | null => {
  const index = Option.getOrElse(
    Arr.findFirstIndex(segments, (segment) => segment.id === segmentId),
    () => -1
  );
  if (index < 0) {
    return null;
  }
  const next = Arr.map(segments, (segment, row) =>
    row === index ? applyTranscriptSegmentPatch(segment, patch) : segment
  );
  return reindexTranscriptSegments(next);
};
export const updateTranscriptSegmentList: {
  (segments: TranscriptSegment[], segmentId: string, patch: TranscriptSegmentPatch): TranscriptSegment[] | null;
  (segmentId: string, patch: TranscriptSegmentPatch): (segments: TranscriptSegment[]) => TranscriptSegment[] | null;
} = dual(3, updateTranscriptSegmentListDataFirst);

/**
 * Drop caption ids and reindex the remainder.
 *
 * @param segments Current rows.
 * @param segmentIds Rows to remove.
 */
const deleteTranscriptSegmentsFromListDataFirst = (
  segments: TranscriptSegment[],
  segmentIds: string[]
): TranscriptSegment[] => {
  const drop = HashSet.fromIterable(segmentIds ?? []);
  return reindexTranscriptSegments(Arr.filter(segments, (segment) => !HashSet.has(drop, segment.id)));
};
export const deleteTranscriptSegmentsFromList: {
  (segments: TranscriptSegment[], segmentIds: string[]): TranscriptSegment[];
  (segmentIds: string[]): (segments: TranscriptSegment[]) => TranscriptSegment[];
} = dual(2, deleteTranscriptSegmentsFromListDataFirst);

/**
 * Pick start/end and a speaker for a newly inserted caption.
 *
 * @param segments Current rows in display order.
 * @param input Neighbor, playhead, or explicit times.
 */
const resolveInsertSegmentPlacementDataFirst = (
  segments: TranscriptSegment[],
  input: InsertTranscriptSegmentInput
): {
  endMs: number;
  speakerId: string | null;
  startMs: number;
} => {
  if (input.startMs !== undefined || input.endMs !== undefined) {
    const start = input.startMs ?? input.atMs ?? 0;
    const end = input.endMs ?? start + DEFAULT_CAPTION_DURATION_MS;
    return {
      ...clampSegmentTimes(start, end),
      speakerId: input.speakerId ?? null,
    };
  }
  const afterIndex =
    input.afterId !== undefined && input.afterId !== null
      ? Option.getOrElse(
          Arr.findFirstIndex(segments, (segment) => segment.id === input.afterId),
          () => -1
        )
      : -1;
  if (afterIndex >= 0) {
    const previous = segments[afterIndex];
    const next = segments[afterIndex + 1];
    const start = previous?.endMs ?? 0;
    const gapEnd = next !== undefined && next.startMs > start ? next.startMs : start + DEFAULT_CAPTION_DURATION_MS;
    return {
      ...clampSegmentTimes(start, gapEnd),
      speakerId: input.speakerId ?? previous?.speakerId ?? null,
    };
  }
  const beforeIndex =
    input.beforeId !== undefined && input.beforeId !== null
      ? Option.getOrElse(
          Arr.findFirstIndex(segments, (segment) => segment.id === input.beforeId),
          () => -1
        )
      : -1;
  if (beforeIndex >= 0) {
    const next = segments[beforeIndex];
    const previous = segments[beforeIndex - 1];
    const end = next?.startMs ?? DEFAULT_CAPTION_DURATION_MS;
    const start = previous !== undefined ? previous.endMs : Math.max(0, end - DEFAULT_CAPTION_DURATION_MS);
    const times =
      start < end
        ? clampSegmentTimes(start, end)
        : clampSegmentTimes(Math.max(0, end - DEFAULT_CAPTION_DURATION_MS), end);
    return {
      ...times,
      speakerId: input.speakerId ?? next?.speakerId ?? previous?.speakerId ?? null,
    };
  }
  const atMs = Math.max(0, Math.round(input.atMs ?? 0));
  const next = Option.getOrUndefined(Arr.findFirst(segments, (segment) => segment.startMs > atMs));
  const previous = Option.getOrUndefined(Arr.findFirst([...segments].reverse(), (segment) => segment.startMs <= atMs));
  const end =
    next !== undefined && next.startMs > atMs
      ? Math.min(next.startMs, atMs + DEFAULT_CAPTION_DURATION_MS)
      : atMs + DEFAULT_CAPTION_DURATION_MS;
  return {
    ...clampSegmentTimes(atMs, end <= atMs ? atMs + DEFAULT_CAPTION_DURATION_MS : end),
    speakerId: input.speakerId ?? previous?.speakerId ?? next?.speakerId ?? null,
  };
};
export const resolveInsertSegmentPlacement: {
  (
    segments: TranscriptSegment[],
    input: InsertTranscriptSegmentInput
  ): {
    endMs: number;
    speakerId: string | null;
    startMs: number;
  };
  (
    input: InsertTranscriptSegmentInput
  ): (segments: TranscriptSegment[]) => {
    endMs: number;
    speakerId: string | null;
    startMs: number;
  };
} = dual(2, resolveInsertSegmentPlacementDataFirst);

/**
 * Insert a caption and return the new list plus the created row id.
 *
 * @param segments Current rows.
 * @param input Neighbor, playhead, or explicit times.
 * @param createId New row id.
 */
const insertTranscriptSegmentInListDataFirst = (
  segments: TranscriptSegment[],
  input: InsertTranscriptSegmentInput,
  createId: () => string
): {
  segmentId: string;
  segments: TranscriptSegment[];
} => {
  const placement = resolveInsertSegmentPlacement(segments, input);
  const segmentId = createId();
  const created: TranscriptSegment = {
    id: segmentId,
    speakerId: placement.speakerId,
    startMs: placement.startMs,
    endMs: placement.endMs,
    text: input.text ?? "",
    words: [],
    confidence: null,
    sortIndex: 0,
  };
  const afterIndex =
    input.afterId !== undefined && input.afterId !== null
      ? Option.getOrElse(
          Arr.findFirstIndex(segments, (segment) => segment.id === input.afterId),
          () => -1
        )
      : -1;
  const beforeIndex =
    input.beforeId !== undefined && input.beforeId !== null
      ? Option.getOrElse(
          Arr.findFirstIndex(segments, (segment) => segment.id === input.beforeId),
          () => -1
        )
      : -1;
  const next =
    afterIndex >= 0
      ? [...segments.slice(0, afterIndex + 1), created, ...segments.slice(afterIndex + 1)]
      : beforeIndex >= 0
        ? [...segments.slice(0, beforeIndex), created, ...segments.slice(beforeIndex)]
        : [...segments, created];
  return {
    segmentId,
    segments: reindexTranscriptSegments(
      Arr.map(next, (segment, index) => ({
        ...segment,
        sortIndex: index,
      }))
    ),
  };
};
export const insertTranscriptSegmentInList: {
  (
    segments: TranscriptSegment[],
    input: InsertTranscriptSegmentInput,
    createId: () => string
  ): {
    segmentId: string;
    segments: TranscriptSegment[];
  };
  (
    input: InsertTranscriptSegmentInput,
    createId: () => string
  ): (segments: TranscriptSegment[]) => {
    segmentId: string;
    segments: TranscriptSegment[];
  };
} = dual(3, insertTranscriptSegmentInListDataFirst);
