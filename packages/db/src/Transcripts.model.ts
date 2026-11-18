import * as S from "effect/Schema";
// Text primary keys follow Drizzle, rejecting physically possible NULL values.
// SQLite numeric affinity also permits real numbers; no integer refinements apply.
// Stored non-finite numbers fail decoding with DbRowDecodeError, like NULL primary keys.

export class TranscriptRow extends S.Class<TranscriptRow, { readonly brand: unique symbol }>(
  "@vidbee/db/TranscriptRow"
)({
  id: S.String,
  downloadTaskId: S.String,
  transcriptionTaskId: S.String,
  resultKind: S.String,
  modelVersion: S.String,
  asrTier: S.NullOr(S.String),
  language: S.NullOr(S.String),
  sourceFilePath: S.NullOr(S.String),
  sourceKind: S.NullOr(S.String),
  supersededAt: S.NullOr(S.Finite),
  createdAt: S.Finite,
  updatedAt: S.Finite,
}) {}
export const TranscriptRowFromSql = TranscriptRow.pipe(
  S.encodeKeys({
    downloadTaskId: "download_task_id",
    transcriptionTaskId: "transcription_task_id",
    resultKind: "result_kind",
    modelVersion: "model_version",
    asrTier: "asr_tier",
    sourceFilePath: "source_file_path",
    sourceKind: "source_kind",
    supersededAt: "superseded_at",
    createdAt: "created_at",
    updatedAt: "updated_at",
  })
);
export const TranscriptInsert = S.Struct({
  id: S.String,
  downloadTaskId: S.String,
  transcriptionTaskId: S.String,
  resultKind: S.String,
  modelVersion: S.String,
  asrTier: S.String.pipe(S.NullOr, S.optional),
  language: S.String.pipe(S.NullOr, S.optional),
  sourceFilePath: S.String.pipe(S.NullOr, S.optional),
  sourceKind: S.String.pipe(S.NullOr, S.optional),
  supersededAt: S.Finite.pipe(S.NullOr, S.optional),
  createdAt: S.Finite,
  updatedAt: S.Finite,
});
export type TranscriptInsert = typeof TranscriptInsert.Type;

export class TranscriptSpeakerRow extends S.Class<TranscriptSpeakerRow, { readonly brand: unique symbol }>(
  "@vidbee/db/TranscriptSpeakerRow"
)({
  id: S.String,
  transcriptId: S.String,
  speakerKey: S.String,
  displayName: S.String,
  sortIndex: S.Finite,
}) {}
export const TranscriptSpeakerRowFromSql = TranscriptSpeakerRow.pipe(
  S.encodeKeys({
    transcriptId: "transcript_id",
    speakerKey: "speaker_key",
    displayName: "display_name",
    sortIndex: "sort_index",
  })
);
export const TranscriptSpeakerInsert = S.Struct({
  id: S.String,
  transcriptId: S.String,
  speakerKey: S.String,
  displayName: S.String,
  sortIndex: S.Finite,
});
export type TranscriptSpeakerInsert = typeof TranscriptSpeakerInsert.Type;

export class TranscriptSegmentRow extends S.Class<TranscriptSegmentRow, { readonly brand: unique symbol }>(
  "@vidbee/db/TranscriptSegmentRow"
)({
  id: S.String,
  transcriptId: S.String,
  speakerId: S.NullOr(S.String),
  startMs: S.Finite,
  endMs: S.Finite,
  text: S.String,
  confidence: S.NullOr(S.Finite),
  wordsJson: S.NullOr(S.String),
  sortIndex: S.Finite,
}) {}
export const TranscriptSegmentRowFromSql = TranscriptSegmentRow.pipe(
  S.encodeKeys({
    transcriptId: "transcript_id",
    speakerId: "speaker_id",
    startMs: "start_ms",
    endMs: "end_ms",
    wordsJson: "words_json",
    sortIndex: "sort_index",
  })
);
export const TranscriptSegmentInsert = S.Struct({
  id: S.String,
  transcriptId: S.String,
  speakerId: S.String.pipe(S.NullOr, S.optional),
  startMs: S.Finite,
  endMs: S.Finite,
  text: S.String,
  confidence: S.Finite.pipe(S.NullOr, S.optional),
  wordsJson: S.String.pipe(S.NullOr, S.optional),
  sortIndex: S.Finite,
});
export type TranscriptSegmentInsert = typeof TranscriptSegmentInsert.Type;
