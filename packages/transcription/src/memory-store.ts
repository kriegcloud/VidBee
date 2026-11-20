import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import * as Layer from "effect/Layer";
import * as O from "effect/Option";
import * as Result from "effect/Result";
import { TranscriptUnavailable } from "./Transcription.errors.js";
import { TranscriptionIds } from "./TranscriptionIds.service.js";
import { TranscriptionTime } from "./TranscriptionTime.service.js";
import { TranscriptStore } from "./TranscriptStore.service.js";
import {
  deleteTranscriptSegmentsFromList,
  insertTranscriptSegmentInList,
  updateTranscriptSegmentList,
} from "./transcript-edit.js";
import type { CaptionCue, TranscriptCommit } from "./Store.model.js";
import type {
  InsertTranscriptSegmentInput,
  StoredTranscriptHead,
  StoredTranscriptRecord,
  TranscriptSegment,
  TranscriptSegmentPatch,
} from "./Transcript.model.js";

export type { PipelineResult } from "./Pipeline.model.js";
export const makeMemory = Effect.fnUntraced(function* () {
  const time = yield* TranscriptionTime;
  const ids = yield* TranscriptionIds;
  let rows = HashMap.empty<string, StoredTranscriptRecord>();
  let order: string[] = [];
  const all = () =>
    A.filterMap(order, (key) =>
      O.match(HashMap.get(rows, key), { onNone: () => Result.fail(undefined), onSome: Result.succeed })
    );
  const getById = (id: string) => O.getOrNull(HashMap.get(rows, id));
  const byTask = (id: string) =>
    A.filter(all(), (r) => r.transcriptionTaskId === id).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
  const latest = (id: string) =>
    A.filter(all(), (r) => r.downloadTaskId === id && r.supersededAt == null).sort(
      (a, b) => b.createdAt - a.createdAt
    )[0] ?? null;
  const history = (id: string) =>
    A.filter(all(), (r) => r.downloadTaskId === id).sort((a, b) => b.createdAt - a.createdAt);
  const current = () => A.filter(all(), (r) => r.supersededAt == null).sort((a, b) => b.updatedAt - a.updatedAt);
  const head = (r: StoredTranscriptRecord): StoredTranscriptHead => ({
    asrTier: r.asrTier,
    createdAt: r.createdAt,
    downloadTaskId: r.downloadTaskId,
    id: r.id,
    language: r.language,
    modelVersion: r.modelVersion,
    resultKind: r.resultKind,
    sourceFilePath: r.sourceFilePath,
    sourceKind: r.sourceKind,
    supersededAt: r.supersededAt,
    transcriptionTaskId: r.transcriptionTaskId,
    updatedAt: r.updatedAt,
  });
  const writeSegments = Effect.fnUntraced(function* (record: StoredTranscriptRecord, segments: TranscriptSegment[]) {
    record.segments = segments;
    record.updatedAt = yield* time.now;
    if (segments.length > 0) record.resultKind = "transcript";
  });
  return TranscriptStore.of({
    applySchema: Effect.void,
    getById: Effect.fn("getById")((id) => Effect.sync(() => getById(id))),
    getByTranscriptionTaskId: Effect.fn("getByTranscriptionTaskId")((id) => Effect.sync(() => byTask(id))),
    getLatestForDownload: Effect.fn("getLatestForDownload")((id) => Effect.sync(() => latest(id))),
    listForDownload: Effect.fn("listForDownload")((id) => Effect.sync(() => history(id))),
    listLatest: Effect.sync(current),
    listHeads: Effect.sync(() =>
      A.map(
        all().sort((a, b) => b.createdAt - a.createdAt),
        head
      )
    ),
    listHeadsForDownload: Effect.fn("listHeadsForDownload")((id) => Effect.sync(() => A.map(history(id), head))),
    hasCurrent: Effect.fn("hasCurrent")((id) => Effect.sync(() => latest(id) !== null)),
    listPlaybackCues: Effect.fn("listPlaybackCues")((id) =>
      Effect.sync(() => A.map(getById(id)?.segments ?? [], ({ words: _words, ...cue }) => cue))
    ),
    commit: Effect.fnUntraced(function* (input: TranscriptCommit) {
      const existing = byTask(input.transcriptionTaskId);
      if (existing !== null && (input.activate === false || existing.supersededAt == null)) return existing;
      const now = yield* time.now;
      for (const row of all())
        if (input.activate !== false && row.downloadTaskId === input.downloadTaskId && row.supersededAt == null) {
          row.supersededAt = now;
          row.updatedAt = now;
        }
      const transcriptId = input.transcriptId ?? (yield* ids.uuid);
      const speakers: import("./Transcript.model.js").TranscriptSpeaker[] = [];
      let index = 0;
      for (const speaker of input.result.speakers) {
        const id = yield* ids.uuid;
        speakers.push({ id, speakerKey: speaker.speakerKey, displayName: speaker.displayName, sortIndex: index });
        index += 1;
      }
      const speakerIds = HashMap.fromIterable(A.map(speakers, (s) => [s.speakerKey, s.id] as const));
      const segments: TranscriptSegment[] = [];
      index = 0;
      for (const segment of input.result.segments) {
        const id = yield* ids.uuid;
        const hasSpeaker = Boolean(segment.speakerKey);
        const speakerId =
          segment.speakerKey === null || !hasSpeaker ? null : O.getOrNull(HashMap.get(speakerIds, segment.speakerKey));
        segments.push({
          id,
          speakerId,
          startMs: segment.startMs,
          endMs: segment.endMs,
          text: segment.text,
          words: segment.words ?? [],
          confidence: segment.confidence,
          sortIndex: index,
        });
        index += 1;
      }
      const record: StoredTranscriptRecord = {
        id: transcriptId,
        downloadTaskId: input.downloadTaskId,
        transcriptionTaskId: input.transcriptionTaskId,
        resultKind: input.result.resultKind,
        modelVersion: input.result.modelVersion,
        asrTier: input.result.asrTier ?? null,
        language: input.result.language,
        sourceFilePath: input.sourceFilePath,
        sourceKind: input.result.sourceKind ?? "asr",
        supersededAt: input.activate === false ? now : null,
        createdAt: now,
        updatedAt: now,
        speakers,
        segments,
      };
      if (!HashMap.has(rows, record.id)) order.push(record.id);
      rows = HashMap.set(rows, record.id, record);
      return record;
    }),
    appendCaptionCues: Effect.fnUntraced(function* (id: string, cues: readonly CaptionCue[]) {
      const record = getById(id);
      if (record?.sourceKind !== "captions")
        return yield* TranscriptUnavailable.make({
          operation: "appendCaptionCues",
          legacyMessage: "Caption transcript is unavailable",
        });
      const first = A.reduce(record.segments, -1, (max, s) => Math.max(max, s.sortIndex)) + 1;
      const added: TranscriptSegment[] = [];
      let index = 0;
      for (const cue of cues) {
        const cueId = yield* ids.uuid;
        added.push({ ...cue, id: cueId, speakerId: null, confidence: null, words: [], sortIndex: first + index });
        index += 1;
      }
      yield* writeSegments(record, [...record.segments, ...added]);
      return record;
    }),
    deleteByDownload: Effect.fn("deleteByDownload")((id) =>
      Effect.sync(() => {
        for (const key of order) {
          const row = getById(key);
          if (row !== null && row.downloadTaskId === id) rows = HashMap.remove(rows, key);
        }
        order = A.filter(order, (key) => HashMap.has(rows, key));
      })
    ),
    activate: Effect.fnUntraced(function* (downloadId: string, id: string) {
      const target = getById(id);
      if (target === null || target.downloadTaskId !== downloadId) return null;
      const selected = latest(downloadId);
      if (selected?.id === target.id) return selected;
      const now = yield* time.now;
      for (const row of all())
        if (row.downloadTaskId === downloadId && row.supersededAt == null && row.id !== target.id) {
          row.supersededAt = now;
          row.updatedAt = now;
        }
      target.supersededAt = null;
      target.updatedAt = now;
      return target;
    }),
    updateSegment: Effect.fnUntraced(function* (id: string, segmentId: string, patch: TranscriptSegmentPatch) {
      const record = getById(id);
      if (record === null) return null;
      const segments = updateTranscriptSegmentList(record.segments, segmentId, patch);
      if (segments === null) return null;
      yield* writeSegments(record, segments);
      return record;
    }),
    deleteSegments: Effect.fnUntraced(function* (id: string, segmentIds: string[]) {
      const record = getById(id);
      if (record === null) return null;
      const wanted = HashSet.fromIterable(segmentIds);
      if (!A.some(record.segments, (s) => HashSet.has(wanted, s.id))) return record;
      yield* writeSegments(record, deleteTranscriptSegmentsFromList(record.segments, segmentIds));
      return record;
    }),
    insertSegment: Effect.fnUntraced(function* (id: string, input: InsertTranscriptSegmentInput) {
      const record = getById(id);
      if (record === null) return null;
      const segmentId = yield* ids.uuid;
      const inserted = insertTranscriptSegmentInList(record.segments, input, () => segmentId);
      yield* writeSegments(record, inserted.segments);
      return { record, segmentId: inserted.segmentId };
    }),
  });
});
export const memoryLayer = Layer.effect(TranscriptStore, makeMemory());
