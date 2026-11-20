import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { MachineProfile } from "./Asr.model.js";
import type { HostFailure } from "./Transcription.errors.js";
import type { Environment, HostSnapshot, MachineOptions } from "./TranscriptionHost.model.js";
export class TranscriptionHostPrimitives extends Context.Service<
  TranscriptionHostPrimitives,
  {
    readonly snapshot: Effect.Effect<HostSnapshot, HostFailure>;
    readonly resolveModule: (id: string) => Effect.Effect<string, HostFailure>;
    readonly lowerPriority: (pid: number) => Effect.Effect<void, HostFailure>;
    readonly isProcessAlive: (pid: number) => Effect.Effect<boolean, HostFailure>;
  }
>()("@vidbee/transcription/TranscriptionHost.service/TranscriptionHostPrimitives") {}
export class TranscriptionHost extends Context.Service<
  TranscriptionHost,
  {
    readonly snapshot: Effect.Effect<HostSnapshot, HostFailure>;
    readonly workerEnvironment: (
      extra?: Environment,
      electronAsNode?: boolean
    ) => Effect.Effect<Environment, HostFailure>;
    readonly machine: (options?: MachineOptions) => Effect.Effect<MachineProfile, HostFailure>;
    readonly libraryDirectory: Effect.Effect<string | null, HostFailure>;
    readonly lowerPriority: (pid: number) => Effect.Effect<void, HostFailure>;
    readonly isProcessAlive: (pid: number) => Effect.Effect<boolean, HostFailure>;
  }
>()("@vidbee/transcription/TranscriptionHost.service/TranscriptionHost") {}
