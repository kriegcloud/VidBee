import * as S from "effect/Schema";
import * as Getter from "effect/SchemaGetter";
import * as T from "../Task.model.js";

const rest = [S.Record(S.String, S.Unknown)];
export const Input = S.StructWithRest(T.TaskInput, rest);
export const Summary = S.StructWithRest(T.SocialCollectionSummary, rest);
export const Progress = S.StructWithRest(
  S.Struct({ ...T.TaskProgress.fields, collectionSummary: Summary.pipe(S.optional, S.mutableKey) }),
  rest
);
export const Output = S.StructWithRest(
  S.Struct({
    ...T.TaskOutput.fields,
    collectionSummary: Summary.pipe(S.optional, S.mutableKey),
    cookieSources: S.StructWithRest(T.DownloadCookieSource, rest).pipe(S.Array, S.mutable, S.optional, S.mutableKey),
    subtitleAcquisition: S.StructWithRest(
      S.Struct({
        id: S.mutableKey(S.String),
        acquiredAt: S.mutableKey(S.Finite),
        credentialsUsed: S.Boolean.pipe(S.optional, S.mutableKey),
        visibility: T.SubtitleVisibility.pipe(S.optional, S.mutableKey),
      }),
      rest
    ).pipe(S.optional, S.mutableKey),
    transcript: S.StructWithRest(T.TranscriptTaskResult, rest).pipe(S.optional, S.mutableKey),
  }),
  rest
);
export const Error = S.StructWithRest(T.ClassifiedError, rest);
export const InputJson = S.fromJsonString(Input);
export const ProgressJson = S.fromJsonString(Progress);
export const OutputJson = S.fromJsonString(Output);
export const ErrorJson = S.fromJsonString(Error);
// SQLite safe-integer mode applies to every integer projection. Preserve ordinary
// numbers and use the legacy seq/count Number conversion, including precision loss.
const SqlNumber = S.Union([S.Finite, S.BigInt]).pipe(
  S.decodeTo(S.Finite, {
    decode: Getter.transform((value) => Number(value)),
    encode: Getter.transform((value) => value),
  })
);
export const RawTask = S.Struct({
  id: S.String,
  kind: T.TaskKind,
  parent_id: S.NullOr(S.String),
  status: T.TaskStatus,
  prev_status: S.NullOr(T.TaskStatus),
  status_reason: S.NullOr(S.String),
  entered_status_at: SqlNumber,
  priority: SqlNumber.pipe(S.decodeTo(T.TaskPriority)),
  group_key: S.String,
  attempt: SqlNumber,
  max_attempts: SqlNumber,
  next_retry_at: S.NullOr(SqlNumber),
  pid: S.NullOr(SqlNumber),
  pid_started_at: S.NullOr(SqlNumber),
  created_at: SqlNumber,
  updated_at: SqlNumber,
  input_json: S.String,
  first_started_at: S.NullOr(SqlNumber),
  progress_json: S.NullOr(S.String),
  output_json: S.NullOr(S.String),
  last_error_json: S.NullOr(S.String),
});
export const RawAttempt = S.Struct({
  id: S.String,
  task_id: S.String,
  attempt_number: SqlNumber,
  started_at: SqlNumber,
  ended_at: S.NullOr(SqlNumber),
  exit_code: S.NullOr(SqlNumber),
  error_category: S.NullOr(T.ErrorCategory),
  stdout_tail: S.NullOr(S.String),
  stderr_tail: S.NullOr(S.String),
  raw_args_hash: S.String,
});
export const RawJournal = S.Struct({
  seq: SqlNumber,
  ts: SqlNumber,
  op: T.ProcessJournalOp,
  task_id: S.String,
  attempt_id: S.NullOr(S.String),
  pid: SqlNumber,
  pid_started_at: S.NullOr(SqlNumber),
  exit_code: S.NullOr(SqlNumber),
  signal: S.NullOr(S.String),
});
export const Count = S.Struct({ n: SqlNumber });
export const Id = S.Struct({ id: S.String });

export const Exists = S.Struct({ present: SqlNumber });
