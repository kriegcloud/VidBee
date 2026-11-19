import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { layer as watchdogLayer } from "../src/process/Watchdog.layer.js";
import { Watchdog } from "../src/process/Watchdog.service.js";
import { QueueTimers } from "../src/QueueTimers.service.js";

const timers = Layer.succeed(QueueTimers, {
  now: Effect.succeed(0),
  sleep: Effect.fn("fixture.sleep")(() => Effect.void),
  after: Effect.fn("fixture.after")(() => Effect.succeed(Effect.void)),
});
for (const options of [undefined, { runningIdleMs: 1 }]) {
  for (const shape of ["first", "last"]) {
    const onStalled = () => Effect.void;
    const selected = shape === "first" ? watchdogLayer(onStalled, options) : watchdogLayer(options)(onStalled);
    layer(selected.pipe(Layer.provide(timers)), { buildPerTest: true })((it) => {
      it.effect(`dual audit: watchdog ${shape} with ${options === undefined ? "default" : "explicit"} options`, () =>
        Effect.gen(function* () {
          const watchdog = yield* Watchdog;
          yield* watchdog.arm("dual", "running");
          const count = yield* watchdog.size;
          expect(count).toBe(1);
          yield* watchdog.disarm("dual");
          const empty = yield* watchdog.size;
          expect(empty).toBe(0);
        })
      );
    });
  }
}
