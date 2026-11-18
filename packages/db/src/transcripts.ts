/**
 * Transcript domain tables and the raw SQL applied on a shared `vidbee.db`.
 *
 * Speech-detection ("no-speech") and full transcript rows share this
 * persistence boundary so an automatic task cannot re-judge the same
 * download after a restart.
 */
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import * as S from "effect/Schema";

export const transcriptsTable = sqliteTable(
  "transcripts",
  {
    id: text("id").primaryKey(),
    downloadTaskId: text("download_task_id").notNull(),
    transcriptionTaskId: text("transcription_task_id").notNull(),
    resultKind: text("result_kind").notNull(),
    modelVersion: text("model_version").notNull(),
    asrTier: text("asr_tier"),
    language: text("language"),
    sourceFilePath: text("source_file_path"),
    sourceKind: text("source_kind"),
    supersededAt: integer("superseded_at", { mode: "number" }),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [
    index("idx_transcripts_download").on(t.downloadTaskId, t.createdAt),
    index("idx_transcripts_task").on(t.transcriptionTaskId),
  ]
);

export const transcriptSpeakersTable = sqliteTable(
  "transcript_speakers",
  {
    id: text("id").primaryKey(),
    transcriptId: text("transcript_id")
      .notNull()
      .references(() => transcriptsTable.id, { onDelete: "cascade" }),
    speakerKey: text("speaker_key").notNull(),
    displayName: text("display_name").notNull(),
    sortIndex: integer("sort_index", { mode: "number" }).notNull(),
  },
  (t) => [index("idx_transcript_speakers_transcript").on(t.transcriptId, t.sortIndex)]
);

export const transcriptSegmentsTable = sqliteTable(
  "transcript_segments",
  {
    id: text("id").primaryKey(),
    transcriptId: text("transcript_id")
      .notNull()
      .references(() => transcriptsTable.id, { onDelete: "cascade" }),
    speakerId: text("speaker_id"),
    startMs: integer("start_ms", { mode: "number" }).notNull(),
    endMs: integer("end_ms", { mode: "number" }).notNull(),
    text: text("text").notNull(),
    confidence: real("confidence"),
    wordsJson: text("words_json"),
    sortIndex: integer("sort_index", { mode: "number" }).notNull(),
  },
  (t) => [index("idx_transcript_segments_time").on(t.transcriptId, t.startMs)]
);

export const TRANSCRIPT_DDL_V1 = `
CREATE TABLE IF NOT EXISTS transcripts (
  id                      TEXT PRIMARY KEY,
  download_task_id        TEXT NOT NULL,
  transcription_task_id   TEXT NOT NULL,
  result_kind             TEXT NOT NULL,
  model_version           TEXT NOT NULL,
  language                TEXT,
  source_file_path        TEXT,
  superseded_at           INTEGER,
  created_at              INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transcripts_download ON transcripts(download_task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_transcripts_task ON transcripts(transcription_task_id);

CREATE TABLE IF NOT EXISTS transcript_speakers (
  id              TEXT PRIMARY KEY,
  transcript_id   TEXT NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
  speaker_key     TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  sort_index      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transcript_speakers_transcript
  ON transcript_speakers(transcript_id, sort_index);

CREATE TABLE IF NOT EXISTS transcript_segments (
  id              TEXT PRIMARY KEY,
  transcript_id   TEXT NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
  speaker_id      TEXT,
  start_ms        INTEGER NOT NULL,
  end_ms          INTEGER NOT NULL,
  text            TEXT NOT NULL,
  confidence      REAL,
  sort_index      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transcript_segments_time
  ON transcript_segments(transcript_id, start_ms);
`;

export const TRANSCRIPT_DDL_V2 = `
ALTER TABLE transcripts ADD COLUMN asr_tier TEXT;
`;

export const TRANSCRIPT_DDL_V3 = `
ALTER TABLE transcript_segments ADD COLUMN words_json TEXT;
`;

export const TRANSCRIPT_DDL_V4 = `
ALTER TABLE transcripts ADD COLUMN source_kind TEXT;
`;

export * from "./Transcripts.model.js";

import { TranscriptRow, TranscriptSegmentRow, TranscriptSpeakerRow } from "./Transcripts.model.js";
import type { TranscriptInsert, TranscriptSegmentInsert, TranscriptSpeakerInsert } from "./Transcripts.model.js";

const TranscriptRowFields = S.Struct(TranscriptRow.fields);
const TranscriptSpeakerRowFields = S.Struct(TranscriptSpeakerRow.fields);
const TranscriptSegmentRowFields = S.Struct(TranscriptSegmentRow.fields);

type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export const modelTypeEquivalence: [
  MutuallyAssignable<typeof TranscriptRowFields.Type, typeof transcriptsTable.$inferSelect>,
  MutuallyAssignable<TranscriptInsert, typeof transcriptsTable.$inferInsert>,
  MutuallyAssignable<typeof TranscriptSpeakerRowFields.Type, typeof transcriptSpeakersTable.$inferSelect>,
  MutuallyAssignable<TranscriptSpeakerInsert, typeof transcriptSpeakersTable.$inferInsert>,
  MutuallyAssignable<typeof TranscriptSegmentRowFields.Type, typeof transcriptSegmentsTable.$inferSelect>,
  MutuallyAssignable<TranscriptSegmentInsert, typeof transcriptSegmentsTable.$inferInsert>,
] = [true, true, true, true, true, true];
