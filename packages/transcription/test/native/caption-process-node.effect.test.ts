import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import { layer as capabilitiesLayer } from "@vidbee/downloader-core/ProcessCapabilities.layer";
import { requestLayer } from "@vidbee/task-queue/ProcessControl.driver";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Scope from "effect/Scope";
import * as TestClock from "effect/testing/TestClock";
import { makeLayer } from "../../src/CaptionProcessOwner.layer.js";
import { CaptionProcessOwner } from "../../src/CaptionProcessOwner.service.js";
import { layer as processLayer } from "../../src/TranscriptionProcess.layer.js";
import { TranscriptionProcess } from "../../src/TranscriptionProcess.service.js";
import { pinnedNode } from "../fixtures/pinned-node.js";
import type { WorkerProcessRun } from "../../src/TranscriptionProcess.service.js";

const ownerLayer = makeLayer(() => Effect.void);

const ready = Deferred.makeUnsafe<void>();
const term = Deferred.makeUnsafe<void>();
let ownedRun: WorkerProcessRun | undefined;
const recordingProcess = Layer.effect(
  TranscriptionProcess,
  Effect.gen(function* () {
    const original = yield* TranscriptionProcess;
    return TranscriptionProcess.of({
      start: Effect.fn("fixture.recordCaption")(function* (spec, sink, scope) {
        const result = yield* original.start(
          spec,
          {
            abort: sink.abort,
            emit: Effect.fn("fixture.captionOutput")(function* (event) {
              if (event._tag === "stdout") yield* Deferred.succeed(ready, undefined);
              if (event._tag === "stderr") yield* Deferred.succeed(term, undefined);
              yield* sink.emit(event);
            }),
          },
          scope
        );
        if (result._tag === "Acquired") ownedRun = result.run;
        return result;
      }),
    });
  })
);
class CaptionFixture extends Context.Service<
  CaptionFixture,
  {
    readonly owner: typeof CaptionProcessOwner.Service;
    readonly shutdown: Effect.Effect<void>;
  }
>()("@vidbee/transcription/test/native/caption-process-node.effect.test/CaptionFixture") {}
const fixture = Layer.effect(
  CaptionFixture,
  Effect.gen(function* () {
    const ownerScope = yield* Scope.make();
    const context = yield* Layer.buildWithScope(ownerLayer, ownerScope);
    return { owner: Context.get(context, CaptionProcessOwner), shutdown: Scope.close(ownerScope, Exit.void) };
  })
);
const nativeProcess = processLayer.pipe(Layer.provide(capabilitiesLayer), Layer.provide(requestLayer));
const testLayer = fixture.pipe(
  Layer.provide(recordingProcess.pipe(Layer.provide(nativeProcess))),
  Layer.provideMerge(NodeServices.layer)
);
layer(testLayer)("native caption owner shutdown", (it) => {
  it.effect(
    "TERM timeout returns while alive; owner shutdown waits until the test explicitly releases the child",
    () =>
      Effect.gen(function* () {
        const fixture = yield* CaptionFixture;
        const node = yield* pinnedNode;
        const capture = yield* fixture.owner
          .capture(
            {
              command: node,
              argv: [
                "-e",
                "process.on('SIGTERM',()=>process.stderr.write('term'));process.stdout.write('ready');setInterval(()=>{},1000)",
              ],
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
            },
            50
          )
          .pipe(Effect.result, Effect.forkScoped);
        yield* Deferred.await(ready);
        const run = ownedRun;
        if (run === undefined) return yield* Effect.die("missing owned capture");
        yield* Effect.addFinalizer(() =>
          run.process.signalChild("SIGKILL").pipe(Effect.ignore, Effect.andThen(fixture.shutdown))
        );
        yield* TestClock.adjust(50);
        const result = yield* Fiber.join(capture);
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") expect(result.failure.legacyMessage).toBe(`${node} timed out after 50ms`);
        yield* Deferred.await(term);
        let reaped = false;
        yield* run.awaitReaped.pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              reaped = true;
            })
          ),
          Effect.forkScoped
        );
        yield* Effect.yieldNow;
        expect(reaped).toBe(false);
        let shutdownComplete = false;
        const shutdown = yield* fixture.shutdown.pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              shutdownComplete = true;
            })
          ),
          Effect.forkScoped
        );
        yield* Effect.yieldNow;
        expect(shutdownComplete).toBe(false);
        // Test-owned release only: the production caption policy sends no escalation.
        yield* run.process.signalChild("SIGKILL");
        yield* Fiber.join(shutdown);
        expect(shutdownComplete).toBe(true);
        yield* Effect.yieldNow;
        expect(reaped).toBe(true);
      }),
    { timeout: 30000 }
  );
});
