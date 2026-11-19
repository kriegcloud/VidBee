import { decodeRow } from "@vidbee/db/Row";
import { TRANSCRIPT_DDL_V1, TRANSCRIPT_DDL_V2, TRANSCRIPT_DDL_V3, TRANSCRIPT_DDL_V4 } from "@vidbee/db/transcripts";
import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import * as Layer from "effect/Layer";
import * as O from "effect/Option";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import * as Client from "effect/sql/SqlClient";
import {
  ColumnProjection,
  ExistsProjection,
  IdProjection,
  PlaybackProjection,
  SegmentProjection,
  SpeakerProjection,
  TranscriptRowFromSql,
} from "./StoreQueries.model.js";
import { TranscriptWord } from "./Transcript.model.js";
import { TranscriptUnavailable } from "./Transcription.errors.js";
import { TranscriptionIds } from "./TranscriptionIds.service.js";
import { TranscriptionTime } from "./TranscriptionTime.service.js";
import { TranscriptStore } from "./TranscriptStore.service.js";
import {
  deleteTranscriptSegmentsFromList,
  insertTranscriptSegmentInList,
  updateTranscriptSegmentList,
} from "./transcript-edit.js";
import { TRANSCRIPT_HEAD_SQL, TRANSCRIPT_PLAYBACK_CUE_SQL } from "./transcript-store.js";
import type { CaptionCue, TranscriptCommit } from "./Store.model.js";
import type {
  InsertTranscriptSegmentInput,
  StoredTranscriptHead,
  StoredTranscriptRecord,
  TranscriptSegment,
  TranscriptSegmentPatch,
} from "./Transcript.model.js";

const parseWordsJson = (raw: string | null): TranscriptSegment["words"] => {
  const hasRaw = Boolean(raw);
  if (raw === null || !hasRaw) return [];
  const parsed = S.decodeOption(S.fromJsonString(S.Unknown))(raw);
  if (O.isNone(parsed) || !A.isArray(parsed.value)) return [];
  return A.filterMap(parsed.value, (item) => S.decodeUnknownResult(TranscriptWord)(item));
};
export const make = Effect.fnUntraced(function* () {
  const sql = yield* Client.SqlClient;
  const time = yield* TranscriptionTime;
  const ids = yield* TranscriptionIds;
  const rows = (query: string, params: readonly unknown[] = []) => sql.unsafe(query, params);
  const exec = Effect.fnUntraced(function* (ddl: string) {
    for (const statement of Str.split(";")(ddl))
      if (Str.trim(statement).length > 0) yield* sql.unsafe(statement).unprepared;
  });
  const columns = Effect.fnUntraced(function* (table: string) {
    const raw = yield* rows(`PRAGMA table_info(${table})`);
    const decoded = yield* decodeRow("transcripts")(S.Array(ColumnProjection))(raw);
    return A.map(decoded, (r) => r.name);
  });
  const migrate = Effect.fnUntraced(function* (names: string[], segments: string[] = []) {
    yield* exec(TRANSCRIPT_DDL_V1);
    if (!A.contains(names, "asr_tier")) yield* exec(TRANSCRIPT_DDL_V2);
    if (segments.length > 0 && !A.contains(segments, "words_json")) yield* exec(TRANSCRIPT_DDL_V3);
    if (!A.contains(names, "source_kind")) yield* exec(TRANSCRIPT_DDL_V4);
  });
  const applySchema = Effect.gen(function* () {
    const initialNames = yield* columns("transcripts");
    yield* migrate(initialNames);
    const names = yield* columns("transcripts");
    const segmentNames = yield* columns("transcript_segments");
    yield* migrate(names, segmentNames);
  });
  const head = (row: typeof TranscriptRowFromSql.Type): StoredTranscriptHead => ({
    asrTier: row.asrTier ?? null,
    createdAt: row.createdAt,
    downloadTaskId: row.downloadTaskId,
    id: row.id,
    language: row.language,
    modelVersion: row.modelVersion,
    resultKind: row.resultKind,
    sourceFilePath: row.sourceFilePath,
    sourceKind: row.sourceKind === "captions" ? "captions" : "asr",
    supersededAt: row.supersededAt,
    transcriptionTaskId: row.transcriptionTaskId,
    updatedAt: row.updatedAt,
  });
  const hydrate = Effect.fnUntraced(function* (row: typeof TranscriptRowFromSql.Type) {
    const speakerRows = yield* rows(
      `SELECT id, speaker_key, display_name, sort_index FROM transcript_speakers WHERE transcript_id = ? ORDER BY sort_index ASC`,
      [row.id]
    );
    const decodedSpeakers = yield* decodeRow("transcript_speakers")(S.Array(SpeakerProjection))(speakerRows);
    const speakers = A.map(decodedSpeakers, (r) => ({
      id: r.id,
      speakerKey: r.speaker_key,
      displayName: r.display_name,
      sortIndex: r.sort_index,
    }));
    const segmentRows = yield* rows(
      `SELECT id, speaker_id, start_ms, end_ms, text, words_json, confidence, sort_index FROM transcript_segments WHERE transcript_id = ? ORDER BY start_ms ASC, sort_index ASC`,
      [row.id]
    );
    const decodedSegments = yield* decodeRow("transcript_segments")(S.Array(SegmentProjection))(segmentRows);
    const segments = A.map(decodedSegments, (r) => ({
      id: r.id,
      speakerId: r.speaker_id,
      startMs: r.start_ms,
      endMs: r.end_ms,
      text: r.text,
      words: parseWordsJson(r.words_json),
      confidence: r.confidence,
      sortIndex: r.sort_index,
    }));
    return {
      id: row.id,
      downloadTaskId: row.downloadTaskId,
      transcriptionTaskId: row.transcriptionTaskId,
      resultKind: row.resultKind,
      modelVersion: row.modelVersion,
      asrTier: row.asrTier ?? null,
      language: row.language,
      sourceFilePath: row.sourceFilePath,
      sourceKind: row.sourceKind === "captions" ? ("captions" as const) : ("asr" as const),
      supersededAt: row.supersededAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      speakers,
      segments,
    };
  });
  const list = Effect.fnUntraced(function* (query: string, params: readonly unknown[] = []) {
    const raw = yield* rows(query, params);
    const decoded = yield* decodeRow("transcripts")(S.Array(TranscriptRowFromSql))(raw);
    return yield* Effect.forEach(decoded, hydrate, { concurrency: 1 });
  });
  const one = Effect.fnUntraced(function* (query: string, params: readonly unknown[]) {
    return (yield* list(query, params))[0] ?? null;
  });
  const getById = (id: string) => one("SELECT * FROM transcripts WHERE id = ?", [id]);
  const getByTranscriptionTaskId = (id: string) =>
    one("SELECT * FROM transcripts WHERE transcription_task_id = ? ORDER BY created_at DESC LIMIT 1", [id]);
  const getLatestForDownload = (id: string) =>
    one(
      "SELECT * FROM transcripts WHERE download_task_id = ? AND superseded_at IS NULL ORDER BY created_at DESC LIMIT 1",
      [id]
    );
  const listHeads = Effect.fnUntraced(function* (suffix: string, params: readonly unknown[] = []) {
    const raw = yield* rows(`${TRANSCRIPT_HEAD_SQL} ${suffix}`, params);
    const decoded = yield* decodeRow("transcripts")(S.Array(TranscriptRowFromSql))(raw);
    return A.map(decoded, head);
  });
  const transaction = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    sql.withTransaction(effect).pipe(Effect.provideService(Client.BeginTransaction, "BEGIN IMMEDIATE"));
  const writeWords = S.encodeEffect(S.fromJsonString(S.Unknown));
  const serializeWords = (words: TranscriptSegment["words"]) => writeWords(words).pipe(Effect.orDie);
  const replaceSegments = Effect.fnUntraced(function* (record: StoredTranscriptRecord, segments: TranscriptSegment[]) {
    const now = yield* time.now;
    yield* transaction(
      Effect.gen(function* () {
        yield* rows("DELETE FROM transcript_segments WHERE transcript_id = ?", [record.id]);
        for (const segment of segments) {
          const json = yield* serializeWords(segment.words ?? []);
          yield* rows(
            "INSERT INTO transcript_segments (id, transcript_id, speaker_id, start_ms, end_ms, text, words_json, confidence, sort_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
              segment.id,
              record.id,
              segment.speakerId,
              segment.startMs,
              segment.endMs,
              segment.text,
              json,
              segment.confidence,
              segment.sortIndex,
            ]
          );
        }
        yield* rows("UPDATE transcripts SET updated_at = ?, result_kind = ? WHERE id = ?", [
          now,
          segments.length > 0 ? "transcript" : record.resultKind,
          record.id,
        ]);
      })
    );
  });
  const unavailable = (operation: string, message: string) =>
    TranscriptUnavailable.make({ operation, legacyMessage: message });
  return TranscriptStore.of({
    applySchema,
    getById,
    getByTranscriptionTaskId,
    getLatestForDownload,
    listForDownload: Effect.fnUntraced(function* (id: string) {
      return yield* list("SELECT * FROM transcripts WHERE download_task_id = ? ORDER BY created_at DESC", [id]);
    }),
    listLatest: list("SELECT * FROM transcripts WHERE superseded_at IS NULL ORDER BY updated_at DESC"),
    listHeads: listHeads("ORDER BY created_at DESC"),
    listHeadsForDownload: Effect.fnUntraced(function* (id: string) {
      return yield* listHeads("WHERE download_task_id = ? ORDER BY created_at DESC", [id]);
    }),
    hasCurrent: Effect.fnUntraced(function* (id: string) {
      const raw = yield* rows(
        "SELECT 1 AS ok FROM transcripts WHERE download_task_id = ? AND superseded_at IS NULL LIMIT 1",
        [id]
      );
      const decoded = yield* decodeRow("transcripts")(S.Array(ExistsProjection))(raw);
      return decoded.length > 0;
    }),
    listPlaybackCues: Effect.fnUntraced(function* (id: string) {
      const raw = yield* rows(TRANSCRIPT_PLAYBACK_CUE_SQL, [id]);
      const decoded = yield* decodeRow("transcript_segments")(S.Array(PlaybackProjection))(raw);
      return A.map(decoded, (r) => ({
        id: r.id,
        speakerId: r.speaker_id,
        startMs: r.start_ms,
        endMs: r.end_ms,
        text: r.text,
        confidence: r.confidence,
        sortIndex: r.sort_index,
      }));
    }),
    commit: Effect.fnUntraced(function* (input: TranscriptCommit) {
      const now = yield* time.now;
      const transcriptId = input.transcriptId ?? (yield* ids.uuid);
      const existing = yield* getByTranscriptionTaskId(input.transcriptionTaskId);
      if (existing !== null && (input.activate === false || existing.supersededAt == null)) return existing;
      yield* transaction(
        Effect.gen(function* () {
          if (input.activate !== false)
            yield* rows(
              "UPDATE transcripts SET superseded_at = ?, updated_at = ? WHERE download_task_id = ? AND superseded_at IS NULL",
              [now, now, input.downloadTaskId]
            );
          yield* rows(
            "INSERT INTO transcripts (id, download_task_id, transcription_task_id, result_kind, model_version, asr_tier, language, source_file_path, source_kind, superseded_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
              transcriptId,
              input.downloadTaskId,
              input.transcriptionTaskId,
              input.result.resultKind,
              input.result.modelVersion,
              input.result.asrTier,
              input.result.language,
              input.sourceFilePath,
              input.result.sourceKind ?? "asr",
              input.activate === false ? now : null,
              now,
              now,
            ]
          );
          let speakerIds = HashMap.empty<string, string>();
          let index = 0;
          for (const speaker of input.result.speakers) {
            const id = yield* ids.uuid;
            speakerIds = HashMap.set(speakerIds, speaker.speakerKey, id);
            yield* rows(
              "INSERT INTO transcript_speakers (id, transcript_id, speaker_key, display_name, sort_index) VALUES (?, ?, ?, ?, ?)",
              [id, transcriptId, speaker.speakerKey, speaker.displayName, index]
            );
            index += 1;
          }
          index = 0;
          for (const segment of input.result.segments) {
            const hasSpeaker = Boolean(segment.speakerKey);
            const speakerId =
              segment.speakerKey === null || !hasSpeaker
                ? null
                : O.getOrNull(HashMap.get(speakerIds, segment.speakerKey));
            const id = yield* ids.uuid;
            const json = yield* serializeWords(segment.words ?? []);
            yield* rows(
              "INSERT INTO transcript_segments (id, transcript_id, speaker_id, start_ms, end_ms, text, words_json, confidence, sort_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
              [
                id,
                transcriptId,
                speakerId,
                segment.startMs,
                segment.endMs,
                segment.text,
                json,
                segment.confidence,
                index,
              ]
            );
            index += 1;
          }
        })
      );
      const record = yield* getById(transcriptId);
      if (record === null) return yield* unavailable("commit", `transcript commit failed for ${transcriptId}`);
      return record;
    }),
    appendCaptionCues: Effect.fnUntraced(function* (id: string, cues: readonly CaptionCue[]) {
      const record = yield* getById(id);
      if (record?.sourceKind !== "captions")
        return yield* unavailable("appendCaptionCues", "Caption transcript is unavailable");
      const first = A.reduce(record.segments, -1, (max, s) => Math.max(max, s.sortIndex)) + 1;
      yield* transaction(
        Effect.gen(function* () {
          let index = 0;
          for (const cue of cues) {
            const cueId = yield* ids.uuid;
            yield* rows(
              "INSERT INTO transcript_segments (id, transcript_id, speaker_id, start_ms, end_ms, text, words_json, confidence, sort_index) VALUES (?, ?, NULL, ?, ?, ?, '[]', NULL, ?)",
              [cueId, id, cue.startMs, cue.endMs, cue.text, first + index]
            );
            index += 1;
          }
          const now = yield* time.now;
          yield* rows("UPDATE transcripts SET updated_at = ? WHERE id = ?", [now, id]);
        })
      );
      const next = yield* getById(id);
      if (next === null)
        return yield* unavailable("appendCaptionCues", "Caption transcript could not be read after appending cues");
      return next;
    }),
    deleteByDownload: Effect.fnUntraced(function* (id: string) {
      const raw = yield* rows("SELECT id FROM transcripts WHERE download_task_id = ?", [id]);
      const selected = yield* decodeRow("transcripts")(S.Array(IdProjection))(raw);
      yield* transaction(
        Effect.gen(function* () {
          for (const row of selected) {
            yield* rows("DELETE FROM transcript_segments WHERE transcript_id = ?", [row.id]);
            yield* rows("DELETE FROM transcript_speakers WHERE transcript_id = ?", [row.id]);
            yield* rows("DELETE FROM transcripts WHERE id = ?", [row.id]);
          }
        })
      );
    }),
    activate: Effect.fnUntraced(function* (downloadId: string, id: string) {
      const target = yield* getById(id);
      if (target === null || target.downloadTaskId !== downloadId) return null;
      const current = yield* getLatestForDownload(downloadId);
      if (current?.id === target.id) return current;
      const now = yield* time.now;
      yield* transaction(
        Effect.gen(function* () {
          yield* rows(
            "UPDATE transcripts SET superseded_at = ?, updated_at = ? WHERE download_task_id = ? AND superseded_at IS NULL AND id != ?",
            [now, now, downloadId, id]
          );
          yield* rows("UPDATE transcripts SET superseded_at = NULL, updated_at = ? WHERE id = ?", [now, id]);
        })
      );
      return yield* getById(id);
    }),
    updateSegment: Effect.fnUntraced(function* (id: string, segmentId: string, patch: TranscriptSegmentPatch) {
      const record = yield* getById(id);
      if (record === null) return null;
      const segments = updateTranscriptSegmentList(record.segments, segmentId, patch);
      if (segments === null) return null;
      yield* replaceSegments(record, segments);
      return yield* getById(id);
    }),
    deleteSegments: Effect.fnUntraced(function* (id: string, segmentIds: string[]) {
      const record = yield* getById(id);
      if (record === null) return null;
      const wanted = HashSet.fromIterable(segmentIds);
      if (!A.some(record.segments, (s) => HashSet.has(wanted, s.id))) return record;
      yield* replaceSegments(record, deleteTranscriptSegmentsFromList(record.segments, segmentIds));
      return yield* getById(id);
    }),
    insertSegment: Effect.fnUntraced(function* (id: string, input: InsertTranscriptSegmentInput) {
      const record = yield* getById(id);
      if (record === null) return null;
      const segmentId = yield* ids.uuid;
      const inserted = insertTranscriptSegmentInList(record.segments, input, () => segmentId);
      yield* replaceSegments(record, inserted.segments);
      const next = yield* getById(id);
      return next === null ? null : { record: next, segmentId: inserted.segmentId };
    }),
  });
});
export const layer = Layer.effect(TranscriptStore, make());
