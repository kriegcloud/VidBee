import * as Effect from "effect/Effect";
import { dual } from "effect/Function";
import * as Layer from "effect/Layer";
import * as MutableHashMap from "effect/MutableHashMap";
import * as Option from "effect/Option";
import { QueueTimers } from "../QueueTimers.service.js";
import { TaskQueueHooks } from "../TaskQueue.service.js";
import { Watchdog } from "./Watchdog.service.js";
import type { Cancel } from "../QueueTimers.service.js";
import type { WatchdogEntry } from "./Watchdog.service.js";
export interface WatchdogOptions {
  readonly processingIdleMs?: number;
  readonly runningIdleMs?: number;
}
export const make = Effect.fnUntraced(function* (
  onStalled: (id: string, entry: Readonly<WatchdogEntry>) => Effect.Effect<void>,
  options: WatchdogOptions = {}
) {
  const timers = yield* QueueTimers;
  const entries = MutableHashMap.empty<string, WatchdogEntry>();
  const get = (id: string) => Option.getOrUndefined(MutableHashMap.get(entries, id));
  const schedule = Effect.fnUntraced(function* (entry: WatchdogEntry): Effect.fn.Return<Cancel> {
    const idle =
      entry.status === "processing" ? (options.processingIdleMs ?? 600000) : (options.runningIdleMs ?? 60000);
    const now = yield* timers.now;
    return yield* timers.after(
      Math.max(0, entry.lastBumpAt + idle - now),
      Effect.gen(function* () {
        const current = get(entry.taskId);
        if (current !== entry) return;
        const time = yield* timers.now;
        if (time - current.lastBumpAt >= idle) {
          MutableHashMap.remove(entries, entry.taskId);
          yield* onStalled(entry.taskId, current).pipe(
            Effect.catchCause((cause) => Effect.logError("task_queue_watchdog_threw", cause))
          );
          return;
        }
        current.timer = yield* schedule(current);
      }),
      { keepAlive: true }
    );
  });
  const disarm = Effect.fnUntraced(function* (id: string) {
    const entry = get(id);
    if (entry === undefined) return;
    if (entry.timer !== null) yield* entry.timer;
    MutableHashMap.remove(entries, id);
  });
  return Watchdog.of({
    arm: Effect.fnUntraced(function* (id, status) {
      yield* disarm(id);
      const now = yield* timers.now;
      const entry: WatchdogEntry = { taskId: id, status, lastBumpAt: now, timer: null };
      entry.timer = yield* schedule(entry);
      MutableHashMap.set(entries, id, entry);
    }),
    promoteToProcessing: Effect.fnUntraced(function* (id) {
      const entry = get(id);
      if (entry === undefined) return;
      if (entry.timer !== null) yield* entry.timer;
      entry.status = "processing";
      entry.lastBumpAt = yield* timers.now;
      entry.timer = yield* schedule(entry);
    }),
    bump: Effect.fnUntraced(function* (id, silence = 0) {
      const entry = get(id);
      if (entry === undefined) return;
      const allowance = Number.isFinite(silence) ? Math.max(0, Math.min(silence, 600000)) : 0;
      entry.lastBumpAt = (yield* timers.now) + allowance;
    }),
    disarm,
    size: Effect.sync(() => MutableHashMap.size(entries)),
  });
});
export const layer: {
  (
    options?: WatchdogOptions
  ): (
    onStalled: (id: string, entry: Readonly<WatchdogEntry>) => Effect.Effect<void>
  ) => Layer.Layer<Watchdog, never, QueueTimers>;
  (
    onStalled: (id: string, entry: Readonly<WatchdogEntry>) => Effect.Effect<void>,
    options?: WatchdogOptions
  ): Layer.Layer<Watchdog, never, QueueTimers>;
} = dual(
  (args) => typeof args[0] === "function",
  (onStalled: (id: string, entry: Readonly<WatchdogEntry>) => Effect.Effect<void>, options?: WatchdogOptions) =>
    Layer.effect(Watchdog, make(onStalled, options))
);

export const layerFromHooks = (options?: WatchdogOptions) =>
  Layer.effect(
    Watchdog,
    Effect.gen(function* () {
      const hooks = yield* TaskQueueHooks;
      return yield* make(hooks.stalled, options);
    })
  );
