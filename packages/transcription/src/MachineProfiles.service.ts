import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { MachineProfile } from "./Asr.model.js";
import type { GpuKind } from "./Literal.model.js";
import type { HostFailure } from "./Transcription.errors.js";
import type { MachineOptions } from "./TranscriptionHost.model.js";
export interface MachineReadPrimitives {
  readonly arch: Effect.Effect<string, HostFailure>;
  readonly cpuCount: Effect.Effect<number, HostFailure>;
  readonly cpuModel: Effect.Effect<string | undefined, HostFailure>;
  readonly platform: Effect.Effect<string, HostFailure>;
  readonly ramBytes: Effect.Effect<number, HostFailure>;
}
export class MachinePrimitives extends Context.Service<MachinePrimitives, MachineReadPrimitives>()(
  "@vidbee/transcription/MachineProfiles.service/MachinePrimitives"
) {}
export class MachineProfiles extends Context.Service<
  MachineProfiles,
  {
    readonly read: (options?: MachineOptions) => Effect.Effect<MachineProfile, HostFailure>;
    readonly gpu: (options?: MachineOptions) => Effect.Effect<{ gpu: GpuKind; gpuName: string | null }, HostFailure>;
    readonly appleSilicon: (
      options?: Pick<MachineOptions, "arch" | "platform" | "cpuModel">
    ) => Effect.Effect<boolean, HostFailure>;
  }
>()("@vidbee/transcription/MachineProfiles.service/MachineProfiles") {}
