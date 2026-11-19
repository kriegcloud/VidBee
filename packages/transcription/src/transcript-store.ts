export { TranscriptStore } from "./TranscriptStore.service.js";
export type { TranscriptPlaybackCue } from "./Transcript.model.js";
export const TRANSCRIPT_HEAD_SQL = `SELECT id, download_task_id, transcription_task_id, result_kind,
            model_version, asr_tier, language, source_file_path, source_kind, superseded_at,
            created_at, updated_at
     FROM transcripts`;
export const TRANSCRIPT_PLAYBACK_CUE_SQL = `SELECT id, speaker_id, start_ms, end_ms, text, confidence, sort_index
     FROM transcript_segments
     WHERE transcript_id = ?
     ORDER BY start_ms ASC, sort_index ASC`;
