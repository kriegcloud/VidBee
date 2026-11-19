import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";
import type { HostFailure } from "./Downloader.errors.js";
import type { NativeSpawnFailure, ProcessRun, ProcessSink } from "./DownloadProcess.service.js";
import type { ProcessOutcome } from "./Process.model.js";
import type { LiveSignallingState, ProcessCapabilitiesSpec } from "./ProcessCapabilities.model.js";

export interface ProcessCapabilitiesRun {
  readonly awaitReaped: Effect.Effect<ProcessOutcome, HostFailure>;
  readonly endInput: Effect.Effect<void, HostFailure>;
  readonly process: ProcessRun;
  readonly signallingState: Effect.Effect<LiveSignallingState, HostFailure>;
  readonly terminate: (graceMs: number) => Effect.Effect<void, HostFailure>;
  readonly writeInput: (bytes: Uint8Array) => Effect.Effect<void, HostFailure>;
}
export interface AcquiredProcessCapabilities {
  readonly _tag: "Acquired";
  readonly run: ProcessCapabilitiesRun;
}
export type ProcessCapabilitiesStart = AcquiredProcessCapabilities | NativeSpawnFailure;

/** Additive process acquisition; the supplied owner outlives each individual caller. */
export class ProcessCapabilities extends Context.Service<
  ProcessCapabilities,
  {
    readonly start: (
      spec: ProcessCapabilitiesSpec,
      sink: ProcessSink,
      owner: Scope.Scope
    ) => Effect.Effect<ProcessCapabilitiesStart, HostFailure>;
  }
>()("@vidbee/downloader-core/ProcessCapabilities.service/ProcessCapabilities") {}
