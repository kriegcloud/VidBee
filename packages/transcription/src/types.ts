export type {
  ModelGroup,
  ModelRole,
  TranscriptionStage,
  TranscriptionTrigger,
  TranscriptResultKind,
  TranscriptSourceKind,
} from "./Literal.model.js";
export type {
  AsrTierStatus,
  DirectoryMemberRequirement,
  MachineProfileStatus,
  ModelDownloadProgress,
  ModelFileSpec,
  ModelStatus,
} from "./Model.model.js";
export type { PipelineProgress, PipelineResult, PipelineSegment, PipelineSpeaker } from "./Pipeline.model.js";
export type {
  TranscriptionTaskOptions,
  TranscriptRecord,
  TranscriptSegment,
  TranscriptSourceOption,
  TranscriptSpeaker,
  TranscriptStageTiming,
  TranscriptSummary,
  TranscriptWord,
} from "./Transcript.model.js";
export const DEFAULT_MODEL_VERSION = "vidbee-asr-2026.08.20-3";
