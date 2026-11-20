import { TranscriptSegmentRow, TranscriptSpeakerRow } from "@vidbee/db/transcripts";
import * as S from "effect/Schema";

export { TranscriptRowFromSql } from "@vidbee/db/transcripts";
export const SpeakerProjection = S.Struct({
  id: TranscriptSpeakerRow.fields.id,
  speaker_key: TranscriptSpeakerRow.fields.speakerKey,
  display_name: TranscriptSpeakerRow.fields.displayName,
  sort_index: TranscriptSpeakerRow.fields.sortIndex,
});
export const SegmentProjection = S.Struct({
  id: TranscriptSegmentRow.fields.id,
  speaker_id: TranscriptSegmentRow.fields.speakerId,
  start_ms: TranscriptSegmentRow.fields.startMs,
  end_ms: TranscriptSegmentRow.fields.endMs,
  text: TranscriptSegmentRow.fields.text,
  words_json: TranscriptSegmentRow.fields.wordsJson,
  confidence: TranscriptSegmentRow.fields.confidence,
  sort_index: TranscriptSegmentRow.fields.sortIndex,
});
export const PlaybackProjection = S.Struct({
  id: SegmentProjection.fields.id,
  speaker_id: SegmentProjection.fields.speaker_id,
  start_ms: SegmentProjection.fields.start_ms,
  end_ms: SegmentProjection.fields.end_ms,
  text: SegmentProjection.fields.text,
  confidence: SegmentProjection.fields.confidence,
  sort_index: SegmentProjection.fields.sort_index,
});
export const ColumnProjection = S.Struct({ name: S.String });
export const ExistsProjection = S.Struct({ ok: S.Finite });
export const IdProjection = S.Struct({ id: S.String });
