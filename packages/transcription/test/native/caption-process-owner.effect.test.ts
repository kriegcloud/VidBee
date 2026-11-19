import { expect, layer } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Scope from "effect/Scope";
import * as TestClock from "effect/testing/TestClock";
import { makeLayer } from "../../src/CaptionProcessOwner.layer.js";
import { CaptionProcessOwner } from "../../src/CaptionProcessOwner.service.js";
import { TranscriptionProcess } from "../../src/TranscriptionProcess.service.js";
import type { ProcessSink } from "@vidbee/downloader-core/DownloadProcess.service";
import type { ProcessOutcome } from "@vidbee/downloader-core/Process.model";
import type { TranscriptionProcessSpec } from "../../src/TranscriptionProcess.model.js";
import type { WorkerProcessStart } from "../../src/TranscriptionProcess.service.js";

const ownerLayer = makeLayer(() => Effect.void);

const spec: TranscriptionProcessSpec = {
  command: "fixture-caption",
  argv: [],
  env: undefined,
  extendEnv: false,
  cwd: undefined,
  detached: true,
  windowsHide: true,
  stdin: "ignore",
  stdout: "pipe",
  stderr: "pipe",
  stdoutConsumption: "events",
  stderrConsumption: "events",
};
const reaped = Deferred.makeUnsafe<ProcessOutcome>();
const started = Deferred.makeUnsafe<void>();
const signals: string[] = [];
let output: ProcessSink | undefined;
let cleanup = 0;
const processLayer = Layer.succeed(TranscriptionProcess, {
  start: Effect.fn("fixture.captionStart")(function* (
    _spec: TranscriptionProcessSpec,
    sink: ProcessSink,
    scope: Scope.Scope
  ) {
    output = sink;
    yield* Scope.addFinalizer(
      scope,
      Deferred.await(reaped).pipe(
        Effect.andThen(
          Effect.sync(() => {
            cleanup += 1;
          })
        )
      )
    );
    yield* Deferred.succeed(started, undefined);
    const result: WorkerProcessStart = {
      _tag: "Acquired",
      run: {
        process: {
          pid: 42,
          signalChild: (signal) =>
            Effect.sync(() => {
              signals.push(signal);
            }),
          signalPid: () => Effect.void,
          signalGroup: () => Effect.void,
          signalTree: () => Effect.void,
        },
        signallingState: Effect.succeed({ _tag: "Native" }),
        writeInput: () => Effect.void,
        endInput: Effect.void,
        awaitReaped: Deferred.await(reaped),
        terminate: () => Effect.die("caption timeout must not escalate"),
      },
    };
    return result;
  }),
});
layer(ownerLayer.pipe(Layer.provide(processLayer)))("caption process owner", (it) => {
  it.effect(
    "timeout publishes failure before exit, retaining the child until late completion",
    () =>
      Effect.gen(function* () {
        const owner = yield* CaptionProcessOwner;
        const capture = yield* owner.capture(spec, 50).pipe(Effect.result, Effect.forkScoped);
        yield* Deferred.await(started);
        yield* TestClock.adjust(50);
        const result = yield* Fiber.join(capture);
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure")
          expect(result.failure.legacyMessage).toBe("fixture-caption timed out after 50ms");
        expect(signals).toEqual(["SIGTERM"]);
        const isReaped = yield* Deferred.isDone(reaped);
        expect(isReaped).toBe(false);
        expect(cleanup).toBe(0);
        const sink = output;
        if (sink === undefined) return yield* Effect.die("missing fixture sink");
        yield* sink.emit({ _tag: "stdout", chunk: new TextEncoder().encode("late output") });
        const outcome: ProcessOutcome = { _tag: "Native", result: { _tag: "ExitCode", code: 0 } };
        yield* sink.emit({ _tag: "complete", outcome });
        yield* Deferred.succeed(reaped, outcome);
        yield* Effect.yieldNow;
        expect(cleanup).toBe(1);
        expect(signals).toEqual(["SIGTERM"]);
      }),
    { timeout: 30000 }
  );
});
