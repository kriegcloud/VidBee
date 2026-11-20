import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { TranscriptCommit } from "./Store.model.js";
import type { StoredTranscriptRecord } from "./Transcript.model.js";
import type { HostFailure } from "./Transcription.errors.js";
import type { StoreError } from "./TranscriptStore.service.js";
export type TranscriptionRecordError = StoreError | HostFailure;
/** Operations re-enter a supplied compatibility store through its public methods. */
export class TranscriptionRecords extends Context.Service<
  TranscriptionRecords,
  {
    readonly latest: (downloadId: string) => Effect.Effect<StoredTranscriptRecord | null, TranscriptionRecordError>;
    readonly list: (downloadId: string) => Effect.Effect<StoredTranscriptRecord[], TranscriptionRecordError>;
    readonly commit: (input: TranscriptCommit) => Effect.Effect<StoredTranscriptRecord, TranscriptionRecordError>;
    readonly activate: (
      downloadId: string,
      transcriptId: string
    ) => Effect.Effect<StoredTranscriptRecord | null, TranscriptionRecordError>;
  }
>()("@vidbee/transcription/TranscriptionRecords.service/TranscriptionRecords") {}
