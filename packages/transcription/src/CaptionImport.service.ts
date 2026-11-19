import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { ExtractedCaptionTrack } from "./CaptionExtraction.model.js";
import type { CaptionCommitInput, CaptionImportInput, CaptionSwitchInput } from "./CaptionImport.model.js";
import type { StoredTranscriptRecord } from "./Transcript.model.js";
import type { HostFailure } from "./Transcription.errors.js";
import type { TranscriptionRecordError } from "./TranscriptionRecords.service.js";
export class CaptionImport extends Context.Service<
  CaptionImport,
  {
    readonly commit: (
      input: CaptionCommitInput
    ) => Effect.Effect<StoredTranscriptRecord | null, TranscriptionRecordError>;
    readonly switchLanguage: (
      input: CaptionSwitchInput
    ) => Effect.Effect<StoredTranscriptRecord | null, TranscriptionRecordError>;
    readonly sidecar: (
      input: CaptionImportInput
    ) => Effect.Effect<StoredTranscriptRecord | null, TranscriptionRecordError>;
    readonly download: (
      input: CaptionImportInput,
      embedded?: () => Effect.Effect<readonly ExtractedCaptionTrack[], HostFailure> | undefined
    ) => Effect.Effect<StoredTranscriptRecord | null, TranscriptionRecordError>;
  }
>()("@vidbee/transcription/CaptionImport.service/CaptionImport") {}
