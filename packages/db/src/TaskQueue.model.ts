import * as S from "effect/Schema";
// Text primary keys follow Drizzle, rejecting physically possible NULL values.
// SQLite numeric affinity also permits real numbers; no integer refinements apply.
// Stored non-finite numbers fail decoding with DbRowDecodeError, like NULL primary keys.

export class TaskRow extends S.Class<TaskRow, { readonly brand: unique symbol }>("@vidbee/db/TaskRow")({
  id: S.String,
  kind: S.String,
  parentId: S.NullOr(S.String),
  status: S.String,
  prevStatus: S.NullOr(S.String),
  statusReason: S.NullOr(S.String),
  enteredStatusAt: S.Finite,
  priority: S.Finite,
  groupKey: S.String,
  attempt: S.Finite,
  maxAttempts: S.Finite,
  nextRetryAt: S.NullOr(S.Finite),
  pid: S.NullOr(S.Finite),
  pidStartedAt: S.NullOr(S.Finite),
  createdAt: S.Finite,
  updatedAt: S.Finite,
  inputJson: S.String,
  progressJson: S.NullOr(S.String),
  outputJson: S.NullOr(S.String),
  lastErrorJson: S.NullOr(S.String),
}) {}
export const TaskRowFromSql = TaskRow.pipe(
  S.encodeKeys({
    parentId: "parent_id",
    prevStatus: "prev_status",
    statusReason: "status_reason",
    enteredStatusAt: "entered_status_at",
    groupKey: "group_key",
    maxAttempts: "max_attempts",
    nextRetryAt: "next_retry_at",
    pidStartedAt: "pid_started_at",
    createdAt: "created_at",
    updatedAt: "updated_at",
    inputJson: "input_json",
    progressJson: "progress_json",
    outputJson: "output_json",
    lastErrorJson: "last_error_json",
  })
);
export const TaskInsert = S.Struct({
  id: S.String,
  kind: S.String,
  parentId: S.String.pipe(S.NullOr, S.optional),
  status: S.String,
  prevStatus: S.String.pipe(S.NullOr, S.optional),
  statusReason: S.String.pipe(S.NullOr, S.optional),
  enteredStatusAt: S.Finite,
  priority: S.Finite,
  groupKey: S.String,
  attempt: S.optional(S.Finite),
  maxAttempts: S.Finite,
  nextRetryAt: S.Finite.pipe(S.NullOr, S.optional),
  pid: S.Finite.pipe(S.NullOr, S.optional),
  pidStartedAt: S.Finite.pipe(S.NullOr, S.optional),
  createdAt: S.Finite,
  updatedAt: S.Finite,
  inputJson: S.String,
  progressJson: S.String.pipe(S.NullOr, S.optional),
  outputJson: S.String.pipe(S.NullOr, S.optional),
  lastErrorJson: S.String.pipe(S.NullOr, S.optional),
});
export type TaskInsert = typeof TaskInsert.Type;

export class AttemptRowDb extends S.Class<AttemptRowDb, { readonly brand: unique symbol }>("@vidbee/db/AttemptRowDb")({
  id: S.String,
  taskId: S.String,
  attemptNumber: S.Finite,
  startedAt: S.Finite,
  endedAt: S.NullOr(S.Finite),
  exitCode: S.NullOr(S.Finite),
  errorCategory: S.NullOr(S.String),
  stdoutTail: S.NullOr(S.String),
  stderrTail: S.NullOr(S.String),
  rawArgsHash: S.String,
}) {}
export const AttemptRowDbFromSql = AttemptRowDb.pipe(
  S.encodeKeys({
    taskId: "task_id",
    attemptNumber: "attempt_number",
    startedAt: "started_at",
    endedAt: "ended_at",
    exitCode: "exit_code",
    errorCategory: "error_category",
    stdoutTail: "stdout_tail",
    stderrTail: "stderr_tail",
    rawArgsHash: "raw_args_hash",
  })
);
export const AttemptInsert = S.Struct({
  id: S.String,
  taskId: S.String,
  attemptNumber: S.Finite,
  startedAt: S.Finite,
  endedAt: S.Finite.pipe(S.NullOr, S.optional),
  exitCode: S.Finite.pipe(S.NullOr, S.optional),
  errorCategory: S.String.pipe(S.NullOr, S.optional),
  stdoutTail: S.String.pipe(S.NullOr, S.optional),
  stderrTail: S.String.pipe(S.NullOr, S.optional),
  rawArgsHash: S.String,
});
export type AttemptInsert = typeof AttemptInsert.Type;

export class ProcessJournalRowDb extends S.Class<ProcessJournalRowDb, { readonly brand: unique symbol }>(
  "@vidbee/db/ProcessJournalRowDb"
)({
  seq: S.Finite,
  ts: S.Finite,
  op: S.String,
  taskId: S.String,
  attemptId: S.NullOr(S.String),
  pid: S.Finite,
  pidStartedAt: S.NullOr(S.Finite),
  exitCode: S.NullOr(S.Finite),
  signal: S.NullOr(S.String),
}) {}
export const ProcessJournalRowDbFromSql = ProcessJournalRowDb.pipe(
  S.encodeKeys({ taskId: "task_id", attemptId: "attempt_id", pidStartedAt: "pid_started_at", exitCode: "exit_code" })
);
export const ProcessJournalInsert = S.Struct({
  seq: S.optional(S.Finite),
  ts: S.Finite,
  op: S.String,
  taskId: S.String,
  attemptId: S.String.pipe(S.NullOr, S.optional),
  pid: S.Finite,
  pidStartedAt: S.Finite.pipe(S.NullOr, S.optional),
  exitCode: S.Finite.pipe(S.NullOr, S.optional),
  signal: S.String.pipe(S.NullOr, S.optional),
});
export type ProcessJournalInsert = typeof ProcessJournalInsert.Type;

export class SchemaMetaRow extends S.Class<SchemaMetaRow, { readonly brand: unique symbol }>(
  "@vidbee/db/SchemaMetaRow"
)({
  key: S.String,
  value: S.String,
}) {}
export const SchemaMetaRowFromSql = SchemaMetaRow.pipe(S.encodeKeys({}));
export const SchemaMetaInsert = S.Struct({
  key: S.String,
  value: S.String,
});
export type SchemaMetaInsert = typeof SchemaMetaInsert.Type;
