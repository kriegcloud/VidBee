import * as Context from "effect/Context";
import type { DbRowDecodeError } from "@vidbee/db";
import type * as Effect from "effect/Effect";
import type { SqlError } from "effect/sql/SqlError";
import type { CaptionCue, InsertedTranscriptSegment, TranscriptCommit } from "./Store.model.js";
import type {
  InsertTranscriptSegmentInput,
  StoredTranscriptHead,
  StoredTranscriptRecord,
  TranscriptPlaybackCue,
  TranscriptSegmentPatch,
} from "./Transcript.model.js";
import type { TranscriptUnavailable } from "./Transcription.errors.js";
export type StoreError = SqlError | DbRowDecodeError | TranscriptUnavailable;
export class TranscriptStore extends Context.Service<
  TranscriptStore,
  {
    readonly applySchema: Effect.Effect<void, StoreError>;
    readonly getById: (id: string) => Effect.Effect<StoredTranscriptRecord | null, StoreError>;
    readonly getByTranscriptionTaskId: (id: string) => Effect.Effect<StoredTranscriptRecord | null, StoreError>;
    readonly getLatestForDownload: (id: string) => Effect.Effect<StoredTranscriptRecord | null, StoreError>;
    readonly listForDownload: (id: string) => Effect.Effect<StoredTranscriptRecord[], StoreError>;
    readonly listLatest: Effect.Effect<StoredTranscriptRecord[], StoreError>;
    readonly listHeads: Effect.Effect<StoredTranscriptHead[], StoreError>;
    readonly listHeadsForDownload: (id: string) => Effect.Effect<StoredTranscriptHead[], StoreError>;
    readonly hasCurrent: (id: string) => Effect.Effect<boolean, StoreError>;
    readonly listPlaybackCues: (id: string) => Effect.Effect<TranscriptPlaybackCue[], StoreError>;
    readonly commit: (input: TranscriptCommit) => Effect.Effect<StoredTranscriptRecord, StoreError>;
    readonly appendCaptionCues: (
      id: string,
      cues: readonly CaptionCue[]
    ) => Effect.Effect<StoredTranscriptRecord, StoreError>;
    readonly deleteByDownload: (id: string) => Effect.Effect<void, StoreError>;
    readonly activate: (downloadId: string, id: string) => Effect.Effect<StoredTranscriptRecord | null, StoreError>;
    readonly updateSegment: (
      id: string,
      segmentId: string,
      patch: TranscriptSegmentPatch
    ) => Effect.Effect<StoredTranscriptRecord | null, StoreError>;
    readonly deleteSegments: (
      id: string,
      segmentIds: string[]
    ) => Effect.Effect<StoredTranscriptRecord | null, StoreError>;
    readonly insertSegment: (
      id: string,
      input: InsertTranscriptSegmentInput
    ) => Effect.Effect<InsertedTranscriptSegment | null, StoreError>;
  }
>()("@vidbee/transcription/TranscriptStore.service/TranscriptStore") {}
