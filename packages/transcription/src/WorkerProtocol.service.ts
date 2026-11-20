import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { PipelineResult } from "./Pipeline.model.js";
import type { BoundaryDecodeError, CheckpointFailure, HostFailure } from "./Transcription.errors.js";
import type { WorkerInbound, WorkerWireInbound, WorkerWireOutbound } from "./Worker.model.js";
export class WorkerProtocol extends Context.Service<
  WorkerProtocol,
  {
    readonly encode: (message: WorkerInbound) => Effect.Effect<string, HostFailure>;
    readonly parseInbound: (line: string) => Effect.Effect<WorkerWireInbound | null, BoundaryDecodeError>;
    readonly parseLine: (line: string) => Effect.Effect<unknown>;
    readonly parse: (line: string) => Effect.Effect<WorkerWireOutbound | null, BoundaryDecodeError>;
    readonly readResult: (
      message: { readonly result?: unknown; readonly resultPath?: unknown },
      workDir: string
    ) => Effect.Effect<PipelineResult, HostFailure | BoundaryDecodeError | CheckpointFailure>;
  }
>()("@vidbee/transcription/WorkerProtocol.service/WorkerProtocol") {}

/** The compatibility driver preserves original JSON.parse syntax exceptions. */
export class WorkerResultJson extends Context.Service<
  WorkerResultJson,
  {
    readonly parse: (text: string) => Effect.Effect<unknown, HostFailure>;
  }
>()("@vidbee/transcription/WorkerProtocol.service/WorkerResultJson") {}
