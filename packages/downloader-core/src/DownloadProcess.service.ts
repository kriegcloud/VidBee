import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as PlatformError from "effect/PlatformError";
import type * as Scope from "effect/Scope";
import type { HostFailure } from "./Downloader.errors.js";
import type { ProcessBackend, ProcessEvent, ProcessSignal, ProcessSpec } from "./Process.model.js";

export interface ProcessSink {
  readonly abort: Effect.Effect<void>;
  readonly emit: (event: ProcessEvent) => Effect.Effect<void>;
}
export interface ProcessRun {
  readonly activateObservations?: Effect.Effect<void> | undefined;
  readonly backend?: ProcessBackend | undefined;
  readonly isRunning?: Effect.Effect<boolean, HostFailure> | undefined;
  readonly observeClose: Effect.Effect<void, HostFailure>;
  readonly pid: number | undefined;
  readonly signalChild: (signal: ProcessSignal) => Effect.Effect<void, HostFailure>;
  readonly signalGroup: (signal: ProcessSignal) => Effect.Effect<void, HostFailure>;
  readonly signalPid: (signal: ProcessSignal) => Effect.Effect<void>;
  readonly signalTree: (signal: ProcessSignal) => Effect.Effect<void, HostFailure>;
  readonly writeStdin: (bytes: Uint8Array) => Effect.Effect<void, HostFailure>;
}
export interface AcquiredProcess {
  readonly _tag: "Acquired";
  readonly run: ProcessRun;
}
export interface NativeSpawnFailure {
  readonly _tag: "NativeSpawnFailure";
  readonly error: PlatformError.PlatformError;
}
export type ProcessStart = AcquiredProcess | NativeSpawnFailure;
export class DownloadProcess extends Context.Service<
  DownloadProcess,
  {
    readonly start: (
      spec: ProcessSpec,
      sink: ProcessSink,
      owner?: Scope.Scope
    ) => Effect.Effect<ProcessStart, HostFailure>;
  }
>()("@vidbee/downloader-core/DownloadProcess.service/DownloadProcess") {}
