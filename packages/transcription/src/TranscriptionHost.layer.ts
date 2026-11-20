import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as P from "effect/Predicate";
import { classifyMachine, osKindFor, resolveGpuProfile } from "./asr-recommend.js";
import { TranscriptionFiles } from "./TranscriptionFiles.service.js";
import { TranscriptionHost, TranscriptionHostPrimitives } from "./TranscriptionHost.service.js";
export const TranscriptionHostLive = Layer.effect(
  TranscriptionHost,
  Effect.gen(function* () {
    const host = yield* TranscriptionHostPrimitives;
    const fs = yield* TranscriptionFiles;
    const path = yield* Path.Path;
    const libraryDirectory = Effect.gen(function* () {
      const snapshot = yield* host.snapshot;
      const os = snapshot.platform === "win32" ? "win" : snapshot.platform;
      const id = `sherpa-onnx-${os}-${snapshot.arch}`;
      const direct = yield* host.resolveModule(`${id}/package.json`).pipe(
        Effect.map(path.dirname),
        Effect.orElseSucceed(() => null)
      );
      if (direct !== null) return direct;
      const addon = yield* host.resolveModule("sherpa-onnx-node/package.json").pipe(Effect.orElseSucceed(() => null));
      if (addon === null) return null;
      const sibling = path.join(path.dirname(addon), "..", id);
      return (yield* fs.exists(path.join(sibling, "package.json"))) ? sibling : null;
    });
    return TranscriptionHost.of({
      snapshot: host.snapshot,
      libraryDirectory,
      lowerPriority: host.lowerPriority,
      isProcessAlive: host.isProcessAlive,
      workerEnvironment: Effect.fn("TranscriptionHost.workerEnvironment")(function* (extra, electronAsNode) {
        const snapshot = yield* host.snapshot;
        const env = { ...snapshot.environment, ...extra };
        if (electronAsNode !== false) env.ELECTRON_RUN_AS_NODE = "1";
        const directory = yield* libraryDirectory;
        if (directory === null || !P.isTruthy(directory)) return env;
        if (snapshot.platform === "darwin")
          env.DYLD_LIBRARY_PATH = P.isTruthy(env.DYLD_LIBRARY_PATH)
            ? `${directory}:${env.DYLD_LIBRARY_PATH}`
            : directory;
        if (snapshot.platform === "linux")
          env.LD_LIBRARY_PATH = P.isTruthy(env.LD_LIBRARY_PATH) ? `${directory}:${env.LD_LIBRARY_PATH}` : directory;
        if (snapshot.platform === "win32") env.PATH = P.isTruthy(env.PATH) ? `${directory};${env.PATH}` : directory;
        return env;
      }),
      machine: Effect.fn("TranscriptionHost.machine")(function* (options) {
        const snapshot = yield* host.snapshot;
        const platform = options?.platform ?? snapshot.platform;
        const arch = options?.arch ?? snapshot.arch;
        const resolved = resolveGpuProfile({
          ...options,
          platform,
          arch,
          cpuModel: options?.cpuModel ?? snapshot.cpuModel,
        });
        return {
          arch,
          class: classifyMachine(snapshot.ramBytes, snapshot.cpuCount),
          cpuCount: snapshot.cpuCount,
          gpu: resolved.gpu,
          gpuName: resolved.gpuName,
          os: osKindFor(platform),
          ramBytes: snapshot.ramBytes,
        };
      }),
    });
  })
);
