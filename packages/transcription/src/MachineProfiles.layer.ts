import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { classifyMachine, isAppleSilicon, osKindFor, resolveGpuProfile } from "./asr-recommend.js";
import { MachinePrimitives, MachineProfiles } from "./MachineProfiles.service.js";
import type { MachineReadPrimitives } from "./MachineProfiles.service.js";
import type { MachineOptions } from "./TranscriptionHost.model.js";
/** Host observations stay lazy and ordered as the old public helpers read them. */
export const makeService = (host: MachineReadPrimitives) => {
  const gpu = Effect.fn("MachineProfiles.gpu")(function* (options?: MachineOptions) {
    const cpuModel = options?.cpuModel ?? (yield* host.cpuModel);
    const arch = options?.arch ?? (yield* host.arch);
    const platform = options?.platform ?? (yield* host.platform);
    return resolveGpuProfile({ ...options, cpuModel, arch, platform });
  });
  return MachineProfiles.of({
    gpu,
    appleSilicon: Effect.fn("MachineProfiles.appleSilicon")(function* (options) {
      const arch = options?.arch ?? (yield* host.arch);
      const cpuModel = options?.cpuModel;
      const platform = options?.platform ?? (yield* host.platform);
      return isAppleSilicon({ arch, platform, cpuModel });
    }),
    read: Effect.fn("MachineProfiles.read")(function* (options) {
      const platform = options?.platform ?? (yield* host.platform);
      const arch = options?.arch ?? (yield* host.arch);
      const os = osKindFor(platform);
      const ramBytes = yield* host.ramBytes;
      const observedCount = yield* host.cpuCount;
      const cpuCount = Math.max(1, observedCount);
      const resolved = yield* gpu({
        arch,
        platform,
        cpuModel: options?.cpuModel,
        devices: options?.devices,
        gpu: options?.gpu,
        gpuName: options?.gpuName,
      });
      return {
        arch,
        class: classifyMachine(ramBytes, cpuCount),
        cpuCount,
        gpu: resolved.gpu,
        gpuName: resolved.gpuName,
        os,
        ramBytes,
      };
    }),
  });
};
export const MachineProfilesLive = Layer.effect(MachineProfiles, Effect.map(MachinePrimitives, makeService));
