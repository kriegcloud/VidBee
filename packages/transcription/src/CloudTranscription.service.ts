import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { CloudTranscriptionResult } from "./Cloud.model.js";
import type { CloudRunInput, CloudSavedClip } from "./CloudRun.model.js";
import type { TranscriptionStage } from "./Literal.model.js";
import type { PipelineResult, PipelineSegment } from "./Pipeline.model.js";
import type { HostFailure, TranscriptionError } from "./Transcription.errors.js";
export interface CloudCheckpointDocument {
  readonly accountId: Effect.Effect<unknown, TranscriptionError>;
  readonly append: (clip: CloudSavedClip) => Effect.Effect<void, TranscriptionError>;
  readonly clipAt: (index: number) => Effect.Effect<unknown, TranscriptionError>;
  readonly save: Effect.Effect<void, TranscriptionError>;
}
export interface CloudPcmFile {
  readonly close: Effect.Effect<void, HostFailure>;
  readonly read: (bytes: Uint8Array, position: number) => Effect.Effect<number, HostFailure>;
  readonly size: Effect.Effect<number, HostFailure>;
}
export class CloudFileIO extends Context.Service<
  CloudFileIO,
  {
    readonly fingerprint: (path: string) => Effect.Effect<string, HostFailure>;
    readonly load: (path: string, accountId: string) => Effect.Effect<CloudCheckpointDocument, TranscriptionError>;
    readonly open: (path: string) => Effect.Effect<CloudPcmFile, HostFailure>;
  }
>()("@vidbee/transcription/CloudTranscription.service/CloudFileIO") {}
export interface CloudRunSink {
  readonly checkAbort: Effect.Effect<void, HostFailure>;
  readonly failureInfo: (
    error: unknown
  ) => Effect.Effect<{ readonly failedReservation: boolean; readonly conflict: boolean }, HostFailure>;
  readonly partial: (segment: PipelineSegment) => Effect.Effect<void, HostFailure>;
  readonly progress: (stage: TranscriptionStage, percent: number | null) => Effect.Effect<void, HostFailure>;
  readonly transcribe: (
    bytes: Uint8Array,
    requestId: string,
    signal: AbortSignal
  ) => Effect.Effect<CloudTranscriptionResult, HostFailure>;
}
export interface CloudRunResult {
  readonly cleanup: Effect.Effect<void>;
  readonly durationMs: number;
  readonly result: PipelineResult;
}
export class CloudTranscription extends Context.Service<
  CloudTranscription,
  { readonly run: (input: CloudRunInput, sink: CloudRunSink) => Effect.Effect<CloudRunResult, TranscriptionError> }
>()("@vidbee/transcription/CloudTranscription.service/CloudTranscription") {}
