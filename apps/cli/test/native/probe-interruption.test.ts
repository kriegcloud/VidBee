import { expect, layer } from "@effect/vitest";
import { layer as nativeProcess } from "@vidbee/downloader-core/Process.driver";
import { ProcessRequests } from "@vidbee/task-queue/ProcessControl.service";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import { CliHost } from "../../src/CliHost.service.js";
import { CliProbeLive, CliProbeProcessLive } from "../../src/CliProbe.layer.js";
import { CliProbe } from "../../src/CliProbe.service.js";
import { fixtureHost } from "./fixtures.js";

let released = 0;
let observers = 0;
const started = Deferred.makeUnsafe<void>();
const watch = Effect.acquireUseRelease(
  Effect.sync(() => {
    observers++;
    if (observers === 3) Deferred.doneUnsafe(started, Effect.void);
  }),
  () => Effect.never,
  () =>
    Effect.sync(() => {
      observers--;
    })
);
const spawner = Layer.succeed(
  ChildProcessSpawner.ChildProcessSpawner,
  ChildProcessSpawner.make(
    Effect.fn("fixture.heldSpawn")(function* () {
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          released++;
        })
      );
      return {
        "~effect/process/ChildProcessSpawner/ChildProcessHandle":
          "~effect/process/ChildProcessSpawner/ChildProcessHandle" as const,
        pid: ChildProcessSpawner.ProcessId(42),
        exitCode: watch,
        isRunning: Effect.succeed(true),
        kill: Effect.fn("fixture.kill")(() => Effect.void),
        stdin: Sink.drain,
        stdout: Stream.fromEffect(watch),
        stderr: Stream.fromEffect(watch),
        all: Stream.empty,
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
        unref: Effect.succeed(Effect.void),
      };
    })
  )
);
const requests = Layer.succeed(ProcessRequests, {
  pid: Effect.fn("fixture.pid")(() => Effect.void),
  group: Effect.fn("fixture.group")(() => Effect.void),
  tree: Effect.fn("fixture.tree")(() => Effect.void),
});
const process = CliProbeProcessLive.pipe(
  Layer.provide(nativeProcess.pipe(Layer.provide(Layer.merge(spawner, requests))))
);
layer(CliProbeLive.pipe(Layer.provide(Layer.merge(process, Layer.succeed(CliHost, fixtureHost)))))((it) => {
  it.effect("interrupting a probe awaits child release and every observer while the layer stays live", () =>
    Effect.gen(function* () {
      const probe = yield* CliProbe;
      const fiber = yield* probe.run({ argv: [] }).pipe(Effect.forkScoped);
      yield* Deferred.await(started);
      expect(observers).toBe(3);
      yield* Fiber.interrupt(fiber);
      expect(released).toBe(1);
      expect(observers).toBe(0);
    })
  );
});
