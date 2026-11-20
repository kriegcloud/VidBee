import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { AsrTierId, SherpaExecutionProvider } from "./Literal.model.js";
import type { PipelineResult } from "./Pipeline.model.js";
import type { TranscriptionSink } from "./Pipeline.service.js";
import type { PipelineInput } from "./PipelineInput.model.js";
import type { SherpaOperations } from "./Sherpa.service.js";
import type { HostFailure, TranscriptionError } from "./Transcription.errors.js";
import type { WorkerOutbound, WorkerStartMessage, WorkerWireProbe } from "./Worker.model.js";
export interface WorkerPreparation {
  readonly wait: Effect.Effect<void, TranscriptionError>;
}
export interface WorkerModelSession {
  readonly beginPrepare: (tier: AsrTierId, skip: boolean) => Effect.Effect<WorkerPreparation, TranscriptionError>;
  readonly config: (
    tier: AsrTierId,
    provider: SherpaExecutionProvider
  ) => Effect.Effect<Record<string, unknown> | null, TranscriptionError>;
  readonly run: (
    message: WorkerStartMessage,
    input: PipelineInput,
    sink: TranscriptionSink
  ) => Effect.Effect<PipelineResult, TranscriptionError>;
}
export class WorkerSessionFactory extends Context.Service<
  WorkerSessionFactory,
  {
    readonly create: (modelsDir: string) => Effect.Effect<WorkerModelSession, TranscriptionError>;
    readonly probeAddon: Effect.Effect<SherpaOperations, TranscriptionError>;
    readonly fakeProbe: Effect.Effect<boolean, HostFailure>;
  }
>()("@vidbee/transcription/WorkerHandler.service/WorkerSessionFactory") {}
export class WorkerOutput extends Context.Service<
  WorkerOutput,
  {
    readonly send: (message: WorkerOutbound) => Effect.Effect<void, HostFailure>;
    readonly flush: Effect.Effect<void, HostFailure>;
  }
>()("@vidbee/transcription/WorkerHandler.service/WorkerOutput") {}
export class WorkerHandler extends Context.Service<
  WorkerHandler,
  {
    readonly start: (message: WorkerStartMessage, signal: AbortSignal) => Effect.Effect<void, HostFailure>;
    readonly probe: (message: WorkerWireProbe) => Effect.Effect<void, HostFailure>;
  }
>()("@vidbee/transcription/WorkerHandler.service/WorkerHandler") {}
