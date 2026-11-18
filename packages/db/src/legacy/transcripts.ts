export * from "../transcripts.js";

import { TRANSCRIPT_DDL_V1, TRANSCRIPT_DDL_V2, TRANSCRIPT_DDL_V3, TRANSCRIPT_DDL_V4 } from "../transcripts.js";

const apply = (exec: (sql: string) => void, columns: string[], segmentColumns: string[] = []): void => {
  exec(TRANSCRIPT_DDL_V1);
  if (!columns.includes("asr_tier")) {
    exec(TRANSCRIPT_DDL_V2);
  }
  if (segmentColumns.length > 0 && !segmentColumns.includes("words_json")) {
    exec(TRANSCRIPT_DDL_V3);
  }
  if (!columns.includes("source_kind")) {
    exec(TRANSCRIPT_DDL_V4);
  }
};

export function applyTranscriptMigrations(
  exec: (sql: string) => void,
  columns: string[],
  segmentColumns?: string[]
): void;
export function applyTranscriptMigrations(
  columns: string[],
  segmentColumns?: string[]
): (exec: (sql: string) => void) => void;
export function applyTranscriptMigrations(
  execOrColumns: ((sql: string) => void) | string[],
  columns: string[] = [],
  segmentColumns: string[] = []
): void | ((exec: (sql: string) => void) => void) {
  if (typeof execOrColumns === "function") return apply(execOrColumns, columns, segmentColumns);
  return (exec) => apply(exec, execOrColumns, columns);
}

// Preserve the mutable structural legacy types for unported consumers.
import type * as Tables from "../transcripts.js";
export type TranscriptRow = typeof Tables.transcriptsTable.$inferSelect;
export type TranscriptInsert = typeof Tables.transcriptsTable.$inferInsert;
export type TranscriptSpeakerRow = typeof Tables.transcriptSpeakersTable.$inferSelect;
export type TranscriptSegmentRow = typeof Tables.transcriptSegmentsTable.$inferSelect;
