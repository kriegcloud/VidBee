import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Predicate from "effect/Predicate";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as Str from "effect/String";
import { HostFailure } from "./Capture.errors.js";
import { CaptureHostDriver } from "./CaptureHost.service.js";
import type { HostSnapshot } from "./Host.model.js";
export interface NativeHostCapabilities {
  readonly makeAbortController: () => AbortController;
  readonly snapshot: () => HostSnapshot;
}
const failure = (operation: string) => (cause: unknown) =>
  HostFailure.make({ operation, cause, legacyMessage: cause instanceof Error ? cause.message : String(cause) });
export const NativeCaptureHostDriver = (capabilities: NativeHostCapabilities) =>
  Layer.effect(
    CaptureHostDriver,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      return CaptureHostDriver.of({
        snapshot: Effect.try({ try: capabilities.snapshot, catch: failure("snapshot") }),
        makeAbortController: capabilities.makeAbortController,
        exists: Effect.fn("CaptureHostDriver.exists")((file) =>
          fs.exists(file).pipe(Effect.mapError(failure("exists")))
        ),
        which: Effect.fn("CaptureHost.which")(
          function* (binary) {
            const output = yield* spawner
              .string(ChildProcess.make("which", [binary]))
              .pipe(Effect.orElseSucceed(() => ""));
            const found = Str.split(Str.trim(output), /\r?\n/)[0];
            return found !== undefined && Predicate.isTruthy(found) && (yield* fs.exists(found)) ? found : null;
          },
          Effect.orElseSucceed(() => null)
        ),
        probeDisplay: Effect.fn("CaptureHostDriver.probeDisplay")((display, timeoutMs) =>
          spawner.exitCode(ChildProcess.make("xdpyinfo", ["-display", display])).pipe(
            Effect.scoped,
            Effect.map((code) => code === 0),
            Effect.timeout(timeoutMs),
            Effect.orElseSucceed(() => false)
          )
        ),
      });
    })
  );
