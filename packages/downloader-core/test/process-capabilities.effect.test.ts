import { expect, layer } from "@effect/vitest";
import { ProcessRequests } from "@vidbee/task-queue/ProcessControl.service";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as Scope from "effect/Scope";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import { layer as capabilitiesLayer } from "../src/ProcessCapabilities.layer.js";
import { ProcessCapabilities } from "../src/ProcessCapabilities.service.js";
import type { ProcessEvent } from "../src/Process.model.js";
import type { ProcessCapabilitiesSpec } from "../src/ProcessCapabilities.model.js";

const spec: ProcessCapabilitiesSpec = {
  command: "fixture",
  argv: [],
  env: undefined,
  extendEnv: false,
  cwd: undefined,
  detached: true,
  windowsHide: true,
  stdin: "pipe",
  stdout: "pipe",
  stderr: "pipe",
  stdoutConsumption: "leaveUnread",
  stderrConsumption: "leaveUnread",
};
const exit = Deferred.makeUnsafe<ChildProcessSpawner.ExitCode>();
const inputGate = Deferred.makeUnsafe<void>();
let sinkRuns = 0;
let outputRuns = 0;
const input: Uint8Array[] = [];
const signals: string[] = [];
const handle: ChildProcessSpawner.ChildProcessHandle = {
  "~effect/process/ChildProcessSpawner/ChildProcessHandle": "~effect/process/ChildProcessSpawner/ChildProcessHandle",
  pid: ChildProcessSpawner.ProcessId(42),
  exitCode: Deferred.await(exit),
  isRunning: Effect.succeed(true),
  kill: () => Effect.die("waiting handle.kill is forbidden"),
  stdin: Sink.make<Uint8Array>()((stream) =>
    Effect.sync(() => {
      sinkRuns += 1;
    }).pipe(
      Effect.andThen(
        Stream.runForEach(stream, (bytes) =>
          Deferred.await(inputGate).pipe(
            Effect.andThen(
              Effect.sync(() => {
                input.push(bytes);
              })
            )
          )
        )
      ),
      Effect.andThen(Deferred.succeed(exit, ChildProcessSpawner.ExitCode(0))),
      Effect.asVoid
    )
  ),
  stdout: Stream.suspend(() => {
    outputRuns += 1;
    return Stream.empty;
  }),
  stderr: Stream.suspend(() => {
    outputRuns += 1;
    return Stream.empty;
  }),
  all: Stream.empty,
  getInputFd: () => Sink.drain,
  getOutputFd: () => Stream.empty,
  unref: Effect.succeed(Effect.void),
};
const requests = Layer.succeed(ProcessRequests, {
  pid: Effect.fn("fixture.pid")((_pid, signal) =>
    Effect.sync(() => {
      signals.push(signal);
    })
  ),
  group: Effect.fn("fixture.group")(() => Effect.void),
  tree: Effect.fn("fixture.tree")(() => Effect.void),
});
const testLayer = capabilitiesLayer.pipe(
  Layer.provide(
    Layer.merge(
      requests,
      Layer.succeed(
        ChildProcessSpawner.ChildProcessSpawner,
        ChildProcessSpawner.make(Effect.fn("fixture.spawn")(() => Effect.succeed(handle)))
      )
    )
  )
);
layer(testLayer)("additive native capabilities", (it) => {
  it.effect(
    "one feeder admits writes before writable progress; unread outputs are never consumed",
    () =>
      Effect.gen(function* () {
        const service = yield* ProcessCapabilities;
        const owner = yield* Effect.scope;
        const events: ProcessEvent[] = [];
        const started = yield* service.start(
          spec,
          {
            abort: Effect.void,
            emit: (event) =>
              Effect.sync(() => {
                events.push(event);
              }),
          },
          owner
        );
        if (started._tag !== "Acquired") return yield* Effect.die("fixture did not start");
        const state = yield* started.run.signallingState;
        expect(state).toEqual({ _tag: "Native" });
        yield* started.run.writeInput(new Uint8Array([1, 2]));
        yield* started.run.writeInput(new Uint8Array([3]));
        expect(input).toEqual([]);
        expect(sinkRuns).toBe(1);
        expect(outputRuns).toBe(0);
        let ended = false;
        const ending = yield* started.run.endInput.pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              ended = true;
            })
          ),
          Effect.forkScoped
        );
        yield* Effect.yieldNow;
        expect(ended).toBe(true);
        yield* Deferred.succeed(inputGate, undefined);
        yield* Fiber.join(ending);
        const outcome = yield* started.run.awaitReaped;
        expect(outcome).toEqual({ _tag: "Native", result: { _tag: "ExitCode", code: 0 } });
        expect(input).toEqual([new Uint8Array([1, 2]), new Uint8Array([3])]);
        expect(outputRuns).toBe(0);
        expect(signals).toEqual([]);
        expect(events).toEqual([
          { _tag: "nativeExit", result: { _tag: "ExitCode", code: 0 } },
          { _tag: "complete", outcome },
        ]);
      }),
    { timeout: 30000 }
  );
  it.effect("rejects unread disposition conflicts before acquiring a child", () =>
    Effect.gen(function* () {
      const service = yield* ProcessCapabilities;
      const owner = yield* Scope.make();
      const attempted = yield* service
        .start({ ...spec, stdout: "ignore" }, { abort: Effect.void, emit: () => Effect.void }, owner)
        .pipe(Effect.result);
      expect(attempted._tag).toBe("Failure");
    })
  );
});
