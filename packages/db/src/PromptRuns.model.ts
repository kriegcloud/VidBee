import * as S from "effect/Schema";
// Text primary keys follow Drizzle, rejecting physically possible NULL values.
// SQLite numeric affinity also permits real numbers; no integer refinements apply.
// Stored non-finite numbers fail decoding with DbRowDecodeError, like NULL primary keys.

export class TranscriptPromptRunRow extends S.Class<TranscriptPromptRunRow, { readonly brand: unique symbol }>(
  "@vidbee/db/TranscriptPromptRunRow"
)({
  downloadId: S.String,
  promptId: S.String,
  status: S.String,
  text: S.String,
  thinking: S.String,
  thinkingMs: S.Finite,
  cloudResultId: S.NullOr(S.String),
  error: S.NullOr(S.String),
  errorCode: S.NullOr(S.String),
  createdAt: S.Finite,
  updatedAt: S.Finite,
}) {}
export const TranscriptPromptRunRowFromSql = TranscriptPromptRunRow.pipe(
  S.encodeKeys({
    downloadId: "download_id",
    promptId: "prompt_id",
    thinkingMs: "thinking_ms",
    cloudResultId: "cloud_result_id",
    errorCode: "error_code",
    createdAt: "created_at",
    updatedAt: "updated_at",
  })
);
export const TranscriptPromptRunInsert = S.Struct({
  downloadId: S.String,
  promptId: S.String,
  status: S.String,
  text: S.String,
  thinking: S.optional(S.String),
  thinkingMs: S.optional(S.Finite),
  cloudResultId: S.String.pipe(S.NullOr, S.optional),
  error: S.String.pipe(S.NullOr, S.optional),
  errorCode: S.String.pipe(S.NullOr, S.optional),
  createdAt: S.Finite,
  updatedAt: S.Finite,
});
export type TranscriptPromptRunInsert = typeof TranscriptPromptRunInsert.Type;
