/**
 * Prompt-run results for a transcript, stored on the shared `vidbee.db`.
 *
 * One row per (download, prompt). Terminal AI output must survive an app
 * restart so the transcript side panel can restore the last result.
 */
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import * as S from "effect/Schema";

export const transcriptPromptRunsTable = sqliteTable(
  "transcript_prompt_runs",
  {
    downloadId: text("download_id").notNull(),
    promptId: text("prompt_id").notNull(),
    status: text("status").notNull(),
    text: text("text").notNull(),
    thinking: text("thinking").notNull().default(""),
    thinkingMs: integer("thinking_ms", { mode: "number" }).notNull().default(0),
    cloudResultId: text("cloud_result_id"),
    error: text("error"),
    errorCode: text("error_code"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.downloadId, t.promptId],
      name: "transcript_prompt_runs_pk",
    }),
    index("idx_transcript_prompt_runs_download").on(t.downloadId, t.updatedAt),
  ]
);

export const PROMPT_RUN_DDL_V1 = `
CREATE TABLE IF NOT EXISTS transcript_prompt_runs (
  download_id  TEXT NOT NULL,
  prompt_id    TEXT NOT NULL,
  status       TEXT NOT NULL,
  text         TEXT NOT NULL,
  error        TEXT,
  error_code   TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (download_id, prompt_id)
);
CREATE INDEX IF NOT EXISTS idx_transcript_prompt_runs_download
  ON transcript_prompt_runs(download_id, updated_at);
`;

export const PROMPT_RUN_DDL_V2 = `
ALTER TABLE transcript_prompt_runs ADD COLUMN thinking TEXT NOT NULL DEFAULT '';
`;

export const PROMPT_RUN_DDL_V3 = `
ALTER TABLE transcript_prompt_runs ADD COLUMN thinking_ms INTEGER NOT NULL DEFAULT 0;
`;

export const PROMPT_RUN_DDL_V4 = `
ALTER TABLE transcript_prompt_runs ADD COLUMN cloud_result_id TEXT;
`;

export * from "./PromptRuns.model.js";

import { TranscriptPromptRunRow } from "./PromptRuns.model.js";
import type { TranscriptPromptRunInsert } from "./PromptRuns.model.js";

const TranscriptPromptRunRowFields = S.Struct(TranscriptPromptRunRow.fields);

type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export const modelTypeEquivalence: [
  MutuallyAssignable<typeof TranscriptPromptRunRowFields.Type, typeof transcriptPromptRunsTable.$inferSelect>,
  MutuallyAssignable<TranscriptPromptRunInsert, typeof transcriptPromptRunsTable.$inferInsert>,
] = [true, true];
