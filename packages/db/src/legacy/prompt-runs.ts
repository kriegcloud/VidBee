import { dual } from "effect/Function";

export * from "../prompt-runs.js";

import { PROMPT_RUN_DDL_V1, PROMPT_RUN_DDL_V2, PROMPT_RUN_DDL_V3, PROMPT_RUN_DDL_V4 } from "../prompt-runs.js";

/**
 * Apply prompt-run tables onto an existing `vidbee.db`.
 *
 * Uses CREATE TABLE IF NOT EXISTS, matching transcript tables, so this does
 * not need a new Drizzle journal entry.
 *
 * @param exec Raw SQL executor from better-sqlite3.
 * @param columns Current `transcript_prompt_runs` columns, empty on a fresh DB.
 */
const apply = (exec: (sql: string) => void, columns: string[]): void => {
  exec(PROMPT_RUN_DDL_V1);
  if (!columns.includes("thinking")) {
    exec(PROMPT_RUN_DDL_V2);
  }
  if (!columns.includes("thinking_ms")) {
    exec(PROMPT_RUN_DDL_V3);
  }
  if (!columns.includes("cloud_result_id")) {
    exec(PROMPT_RUN_DDL_V4);
  }
};

export const applyPromptRunMigrations: {
  (exec: (sql: string) => void, columns: string[]): void;
  (columns: string[]): (exec: (sql: string) => void) => void;
} = dual(2, apply);

// Preserve the mutable structural legacy types for unported consumers.
import type * as Tables from "../prompt-runs.js";
export type TranscriptPromptRunRow = typeof Tables.transcriptPromptRunsTable.$inferSelect;
export type TranscriptPromptRunInsert = typeof Tables.transcriptPromptRunsTable.$inferInsert;
