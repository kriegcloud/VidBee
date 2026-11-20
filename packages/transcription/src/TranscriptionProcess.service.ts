import * as Context from "effect/Context";
import type { NativeSpawnFailure, ProcessRun, ProcessSink } from "@vidbee/downloader-core/DownloadProcess.service";
import type { ProcessOutcome } from "@vidbee/downloader-core/Process.model";
import type * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";
import type { HostFailure } from "./Transcription.errors.js";
import type { LiveSignallingState, TranscriptionProcessSpec } from "./TranscriptionProcess.model.js";

export interface WorkerProcessRun {
  readonly awaitReaped: Effect.Effect<ProcessOutcome, HostFailure>;
  readonly endInput: Effect.Effect<void, HostFailure>;
  readonly process: ProcessRun;
  readonly signallingState: Effect.Effect<LiveSignallingState, HostFailure>;
  readonly terminate: (graceMs: number) => Effect.Effect<void, HostFailure>;
  readonly writeStdin: (bytes: Uint8Array) => Effect.Effect<void, HostFailure>;
}
export interface AcquiredWorkerProcess {
  readonly _tag: "Acquired";
  readonly run: WorkerProcessRun;
}
export type WorkerProcessStart = AcquiredWorkerProcess | NativeSpawnFailure;
export class TranscriptionProcess extends Context.Service<
  TranscriptionProcess,
  {
    readonly start: (
      spec: TranscriptionProcessSpec,
      sink: ProcessSink,
      owner: Scope.Scope
    ) => Effect.Effect<WorkerProcessStart, HostFailure>;
  }
>()("@vidbee/transcription/TranscriptionProcess.service/TranscriptionProcess") {}
