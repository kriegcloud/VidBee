import { expect, layer as testLayer } from "@effect/vitest";
import { ProcessRequests } from "@vidbee/task-queue/ProcessControl.service";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PlatformError from "effect/PlatformError";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import { DownloadProcess } from "../src/DownloadProcess.service.js";
import { layer } from "../src/Process.driver.js";
import type { ProcessEvent, ProcessSpec } from "../src/Process.model.js";

const spec: ProcessSpec = {
  command: "fixture",
  argv: [],
  env: undefined,
  extendEnv: false,
  cwd: undefined,
  detached: true,
  windowsHide: true,
  stdin: "ignore",
  stdout: "pipe",
  stderr: "pipe",
};
const error = PlatformError.badArgument({ module: "ChildProcess", method: "spawn", description: "fixture failure" });
const requests = Layer.succeed(ProcessRequests, {
  pid: Effect.fn("fixture.pid")(() => Effect.void),
  group: Effect.fn("fixture.group")(() => Effect.void),
  tree: Effect.fn("fixture.tree")(() => Effect.void),
});
const makeHandle = (
  stdout: Stream.Stream<Uint8Array, PlatformError.PlatformError>,
  exitCode: Effect.Effect<ChildProcessSpawner.ExitCode, PlatformError.PlatformError>
): ChildProcessSpawner.ChildProcessHandle => ({
  "~effect/process/ChildProcessSpawner/ChildProcessHandle": "~effect/process/ChildProcessSpawner/ChildProcessHandle",
  pid: ChildProcessSpawner.ProcessId(42),
  exitCode,
  isRunning: Effect.succeed(true),
  kill: Effect.fn("fixture.forbiddenKill")(() => Effect.die("handle.kill must never be called")),
  stdin: Sink.drain,
  stdout,
  stderr: Stream.empty,
  all: Stream.empty,
  getInputFd: () => Sink.drain,
  getOutputFd: () => Stream.empty,
  unref: Effect.succeed(Effect.void),
});
const provided = (spawn: ChildProcessSpawner.ChildProcessSpawner["Service"]["spawn"]) =>
  layer.pipe(
    Layer.provide(
      Layer.merge(requests, Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, ChildProcessSpawner.make(spawn)))
    )
  );

testLayer(provided(Effect.fn("fixture.spawnFailure")(() => Effect.fail(error))))("spawn failure", (it) => {
  it.effect("acquisition failure retains the PlatformError and produces no events", () =>
    Effect.gen(function* () {
      const service = yield* DownloadProcess;
      const events: Array<ProcessEvent> = [];
      const result = yield* service.start(spec, {
        emit: Effect.fn("fixture.emitFailure")((event) =>
          Effect.sync(() => {
            events.push(event);
          })
        ),
        abort: Effect.void,
      });
      expect(result).toEqual({ _tag: "NativeSpawnFailure", error });
      expect(events).toEqual([]);
    })
  );
});

testLayer(
  provided(Effect.fn("fixture.spawnStreamFailure")(() => Effect.succeed(makeHandle(Stream.fail(error), Effect.never))))
)("stream failure", (it) => {
  it.effect("stream failure completes without waiting for an impossible exit", () =>
    Effect.gen(function* () {
      const service = yield* DownloadProcess;
      const complete = yield* Deferred.make<ProcessEvent>();
      const result = yield* service.start(spec, {
        emit: Effect.fn("fixture.emit")((event) =>
          event._tag === "complete" ? Deferred.succeed(complete, event).pipe(Effect.asVoid) : Effect.void
        ),
        abort: Effect.void,
      });
      expect(result._tag).toBe("Acquired");
      const event = yield* Deferred.await(complete);
      expect(event).toEqual({ _tag: "complete", outcome: { _tag: "Native", result: { _tag: "Failure", error } } });
    })
  );
});

const preAborted = new AbortController();
preAborted.abort();
testLayer(provided(Effect.fn("fixture.abortedSpawnFailure")(() => Effect.fail(error))))(
  "pre-aborted acquisition",
  (it) => {
    it.effect("enters cancellation even when acquisition fails without a handle", () =>
      Effect.gen(function* () {
        const service = yield* DownloadProcess;
        let cancelled = false;
        const result = yield* service.start(
          { ...spec, abortSignal: preAborted.signal },
          {
            emit: Effect.fn("fixture.unusedEmit")(() => Effect.void),
            abort: Effect.sync(() => {
              cancelled = true;
            }),
          }
        );
        expect(result._tag).toBe("NativeSpawnFailure");
        expect(cancelled).toBe(true);
      })
    );
  }
);

const fixtureRelease = Deferred.makeUnsafe<void>();
const fixtureStdoutEnd = Deferred.makeUnsafe<void>();
const lifecycleSpawner = Layer.succeed(
  ChildProcessSpawner.ChildProcessSpawner,
  ChildProcessSpawner.make(
    Effect.fn("fixture.lifecycleSpawn")(function* () {
      yield* Effect.addFinalizer(() => Deferred.succeed(fixtureRelease, undefined));
      return makeHandle(
        fixtureStdoutEnd.pipe(
          Deferred.await,
          Stream.fromEffect,
          Stream.map(() => new Uint8Array([1]))
        ),
        Effect.succeed(ChildProcessSpawner.ExitCode(0))
      );
    })
  )
);
const lifecycleLayer = layer.pipe(Layer.provideMerge(lifecycleSpawner), Layer.provide(requests));
testLayer(lifecycleLayer)("attempt observation and scope", (it) => {
  it.effect("numeric exit is recorded before output completion and attempt cleanup", () =>
    Effect.gen(function* () {
      const service = yield* DownloadProcess;
      const exited = yield* Deferred.make<void>();
      const completed = yield* Deferred.make<void>();
      const events: string[] = [];
      yield* service.start(spec, {
        abort: Effect.void,
        emit: Effect.fn("fixture.lifecycleEvent")(function* (event) {
          events.push(event._tag);
          if (event._tag === "nativeExit") yield* Deferred.succeed(exited, undefined);
          if (event._tag === "complete") yield* Deferred.succeed(completed, undefined);
        }),
      });
      yield* Deferred.await(exited);
      expect(events).not.toContain("complete");
      yield* Deferred.succeed(fixtureStdoutEnd, undefined);
      yield* Deferred.await(completed);
      yield* Deferred.await(fixtureRelease);
      expect(events).toContain("stdoutEnd");
      expect(events).toContain("stderrEnd");
      expect(events[events.length - 1]).toBe("complete");
    })
  );
});
