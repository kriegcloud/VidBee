import { expect, layer } from "@effect/vitest";
import { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { layer as fillLayer } from "../../src/MinimalModelFill.layer.js";
import { MinimalFillHooks, MinimalFillSchedule, MinimalModelFill } from "../../src/MinimalModelFill.service.js";
import { Models } from "../../src/Models.service.js";
import type { HostFailure } from "../../src/Transcription.errors.js";

class FillFixture extends Context.Service<
  FillFixture,
  {
    readonly fill: typeof MinimalModelFill.Service;
    readonly actions: Effect.Effect<void, HostFailure>[];
    readonly trace: string[];
    readonly release: Effect.Effect<void>;
  }
>()("@vidbee/transcription/test/native/minimal-model-fill.effect.test/FillFixture") {}
const fixture = Layer.effect(
  FillFixture,
  Effect.gen(function* () {
    const gate = yield* Deferred.make<void>();
    const actions: Effect.Effect<void, HostFailure>[] = [];
    const trace: string[] = [];
    const unused = Effect.die("unused fixture operation");
    const models = Layer.succeed(Models, {
      modelsDir: "fixture",
      status: Effect.fn("Models.status")(() => unused),
      pathFor: Effect.fn("Models.pathFor")(() => unused),
      pathByRole: Effect.fn("Models.pathByRole")(() => unused),
      pathById: Effect.fn("Models.pathById")(() => unused),
      incompleteModelIssue: Effect.fn("Models.incompleteModelIssue")(() => unused),
      ensureReady: Effect.fn("Models.ensureReady")(() =>
        Deferred.await(gate).pipe(
          Effect.as({
            ready: true,
            version: "fixture",
            bytes: 0,
            files: [],
            tiers: [],
            downloads: [],
            downloading: null,
          })
        )
      ),
      ensureReadyAllowCancel: Effect.fn("Models.ensureReadyAllowCancel")(() => unused),
      redownload: unused,
      removeTier: Effect.fn("Models.removeTier")(() => unused),
      cancelDownload: Effect.fn("Models.cancelDownload")(() => unused),
      subscribe: Effect.fn("Models.subscribe")(() => unused),
    });
    const schedule = Layer.succeed(MinimalFillSchedule, {
      schedule: Effect.fn("MinimalFillSchedule.schedule")((action, ms) =>
        Effect.sync(() => {
          actions.push(action);
          trace.push(`schedule:${ms}`);
          return {
            truthy: true,
            cancel: Effect.sync(() => {
              trace.push("cancel");
            }),
          };
        })
      ),
    });
    const hooks = Layer.succeed(MinimalFillHooks, {
      ready: Effect.sync(() => {
        trace.push("ready");
      }),
      failed: Effect.fn("MinimalFillHooks.failed")(() =>
        Effect.sync(() => {
          trace.push("failed");
        })
      ),
    });
    const scope = yield* Effect.scope;
    const context = yield* Layer.buildWithScope(
      fillLayer.pipe(
        Layer.provide(models),
        Layer.provide(schedule),
        Layer.provide(hooks),
        Layer.provide(LegacyTiming.layer)
      ),
      scope
    );
    return {
      fill: Context.get(context, MinimalModelFill),
      actions,
      trace,
      release: Deferred.succeed(gate, undefined).pipe(Effect.asVoid),
    };
  })
);
layer(fixture)("native minimal model fill", (it) => {
  it.effect("stop cancels the timer but keeps an in-flight successful ensure continuation", () =>
    Effect.gen(function* () {
      const f = yield* FillFixture;
      const handle = yield* f.fill.start();
      const action = f.actions[0];
      if (action === undefined) return yield* Effect.die("timer not scheduled");
      yield* action;
      yield* handle.stop;
      yield* f.release;
      yield* Effect.yieldNow;
      expect(f.trace).toEqual(["schedule:0", "cancel", "ready"]);
      yield* action;
      expect(f.trace).toEqual(["schedule:0", "cancel", "ready"]);
    })
  );
});
