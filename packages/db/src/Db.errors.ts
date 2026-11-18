import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as S from "effect/Schema";
export const MigrationName = LiteralKit(["task-queue", "subscriptions", "transcripts", "prompt-runs"]);
export const TableName = LiteralKit([
  "download_history",
  "tasks",
  "attempts",
  "process_journal",
  "schema_meta",
  "subscriptions",
  "subscription_items",
  "subscriptions_meta",
  "transcripts",
  "transcript_segments",
  "transcript_speakers",
  "transcript_prompt_runs",
]);
export class DbMigrationError extends S.TaggedError<DbMigrationError, { readonly brand: unique symbol }>(
  "@vidbee/db/DbMigrationError"
)("DbMigrationError", { migration: MigrationName, step: S.String, cause: S.Defect() }) {}
export class DbRowDecodeError extends S.TaggedError<DbRowDecodeError, { readonly brand: unique symbol }>(
  "@vidbee/db/DbRowDecodeError"
)("DbRowDecodeError", { table: TableName, issue: S.String }) {}
