import * as S from "effect/Schema";

export class SourceUnavailable extends S.TaggedError<SourceUnavailable, { readonly brand: unique symbol }>(
  "@vidbee/transcription/SourceUnavailable"
)("SourceUnavailable", { operation: S.String, legacyMessage: S.String, cause: S.optional(S.Defect()) }) {}
export class AudioFailure extends S.TaggedError<AudioFailure, { readonly brand: unique symbol }>(
  "@vidbee/transcription/AudioFailure"
)("AudioFailure", { operation: S.String, legacyMessage: S.String, cause: S.optional(S.Defect()) }) {}
export class ModelUnavailable extends S.TaggedError<ModelUnavailable, { readonly brand: unique symbol }>(
  "@vidbee/transcription/ModelUnavailable"
)("ModelUnavailable", { operation: S.String, legacyMessage: S.String, cause: S.optional(S.Defect()) }) {}
export class ModelBusy extends S.TaggedError<ModelBusy, { readonly brand: unique symbol }>(
  "@vidbee/transcription/ModelBusy"
)("ModelBusy", { operation: S.String, legacyMessage: S.String, cause: S.optional(S.Defect()) }) {}
export class ModelIntegrityFailure extends S.TaggedError<ModelIntegrityFailure, { readonly brand: unique symbol }>(
  "@vidbee/transcription/ModelIntegrityFailure"
)("ModelIntegrityFailure", { operation: S.String, legacyMessage: S.String, cause: S.optional(S.Defect()) }) {}
export class RuntimeUnavailable extends S.TaggedError<RuntimeUnavailable, { readonly brand: unique symbol }>(
  "@vidbee/transcription/RuntimeUnavailable"
)("RuntimeUnavailable", { operation: S.String, legacyMessage: S.String, cause: S.optional(S.Defect()) }) {}
export class WorkerUnexpectedExit extends S.TaggedError<WorkerUnexpectedExit, { readonly brand: unique symbol }>(
  "@vidbee/transcription/WorkerUnexpectedExit"
)("WorkerUnexpectedExit", { operation: S.String, legacyMessage: S.String, cause: S.optional(S.Defect()) }) {}
export class WorkerFailure extends S.TaggedError<WorkerFailure, { readonly brand: unique symbol }>(
  "@vidbee/transcription/WorkerFailure"
)("WorkerFailure", { operation: S.String, legacyMessage: S.String, cause: S.optional(S.Defect()) }) {}
export class CheckpointFailure extends S.TaggedError<CheckpointFailure, { readonly brand: unique symbol }>(
  "@vidbee/transcription/CheckpointFailure"
)("CheckpointFailure", { operation: S.String, legacyMessage: S.String, cause: S.optional(S.Defect()) }) {}
export class TranscriptUnavailable extends S.TaggedError<TranscriptUnavailable, { readonly brand: unique symbol }>(
  "@vidbee/transcription/TranscriptUnavailable"
)("TranscriptUnavailable", { operation: S.String, legacyMessage: S.String, cause: S.optional(S.Defect()) }) {}
export class BoundaryDecodeError extends S.TaggedError<BoundaryDecodeError, { readonly brand: unique symbol }>(
  "@vidbee/transcription/BoundaryDecodeError"
)("BoundaryDecodeError", { operation: S.String, legacyMessage: S.String, cause: S.optional(S.Defect()) }) {}
export class HostFailure extends S.TaggedError<HostFailure, { readonly brand: unique symbol }>(
  "@vidbee/transcription/HostFailure"
)("HostFailure", { operation: S.String, legacyMessage: S.String, cause: S.optional(S.Defect()) }) {}
export type TranscriptionError =
  | SourceUnavailable
  | AudioFailure
  | ModelUnavailable
  | ModelBusy
  | ModelIntegrityFailure
  | RuntimeUnavailable
  | WorkerUnexpectedExit
  | WorkerFailure
  | CheckpointFailure
  | TranscriptUnavailable
  | BoundaryDecodeError
  | HostFailure;
