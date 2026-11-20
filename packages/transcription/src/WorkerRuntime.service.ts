import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { SherpaProviderProbeResult, SherpaProviderSelection } from "./Host.model.js";
import type { SherpaExecutionProvider } from "./Literal.model.js";
import type { WorkerRuntime as RuntimeValue } from "./Runtime.model.js";
import type {
  BoundaryDecodeError,
  CheckpointFailure,
  HostFailure,
  RuntimeUnavailable,
} from "./Transcription.errors.js";
import type {
  ProbeWorkerProviderInput,
  ProviderSelectionInput,
  ResolveWorkerRuntimeInput,
  RuntimeCommand,
} from "./WorkerRuntime.model.js";
export interface RuntimeProbeCache {
  readonly get: (key: string) => Effect.Effect<unknown, HostFailure>;
  readonly set: (key: string, value: boolean) => Effect.Effect<void, HostFailure | CheckpointFailure>;
}
export interface ResolveRuntimeOptions extends ResolveWorkerRuntimeInput {
  readonly cache?: RuntimeProbeCache | undefined;
  readonly probe?: ((runtime: RuntimeValue) => Effect.Effect<boolean, HostFailure>) | undefined;
}
export class RuntimeCommands extends Context.Service<
  RuntimeCommands,
  { readonly execute: (input: RuntimeCommand) => Effect.Effect<string, HostFailure> }
>()("@vidbee/transcription/WorkerRuntime.service/RuntimeCommands") {}
export class WorkerRuntime extends Context.Service<
  WorkerRuntime,
  {
    readonly readNodeVersion: (path: string) => Effect.Effect<string>;
    readonly probeCacheKey: (path: string) => Effect.Effect<string>;
    readonly createFileProbeCache: (path?: string) => Effect.Effect<RuntimeProbeCache, HostFailure>;
    readonly resolveBundledNodePath: (resources?: string[]) => Effect.Effect<string | null, HostFailure>;
    readonly resolveSystemNodePaths: Effect.Effect<string[], HostFailure>;
    readonly resolve: (
      input?: ResolveRuntimeOptions
    ) => Effect.Effect<RuntimeValue, HostFailure | RuntimeUnavailable | CheckpointFailure>;
    readonly resolvePath: (preferred?: string) => Effect.Effect<string, HostFailure>;
    readonly probeProvider: (
      input: ProbeWorkerProviderInput
    ) => Effect.Effect<SherpaProviderProbeResult, HostFailure | BoundaryDecodeError>;
    readonly probe: (
      input: Omit<ProbeWorkerProviderInput, "provider" | "asrTier" | "benchmark">
    ) => Effect.Effect<boolean, HostFailure | BoundaryDecodeError>;
  }
>()("@vidbee/transcription/WorkerRuntime.service/WorkerRuntime") {}
export interface SelectProviderOptions extends ProviderSelectionInput {
  readonly probe: (provider: SherpaExecutionProvider) => Effect.Effect<SherpaProviderProbeResult, HostFailure>;
}
export class ComputeProvider extends Context.Service<
  ComputeProvider,
  { readonly select: (input: SelectProviderOptions) => Effect.Effect<SherpaProviderSelection, HostFailure> }
>()("@vidbee/transcription/WorkerRuntime.service/ComputeProvider") {}

export class RuntimeProbe extends Context.Service<
  RuntimeProbe,
  {
    readonly run: (
      input: ProbeWorkerProviderInput
    ) => Effect.Effect<SherpaProviderProbeResult, HostFailure | BoundaryDecodeError>;
  }
>()("@vidbee/transcription/WorkerRuntime.service/RuntimeProbe") {}
