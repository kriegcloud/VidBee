import { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as MutableHashMap from "effect/MutableHashMap";
import * as O from "effect/Option";
import * as S from "effect/Schema";
import { SubscriptionDispatch } from "./SubscriptionDispatch.service.js";
import { withLegacyFinally } from "./SubscriptionFinally.js";
import { SubscriptionLog } from "./SubscriptionLog.service.js";
import {
  SchedulerWork,
  SubscriptionScheduler,
  SubscriptionSchedulerSettings,
} from "./SubscriptionScheduler.service.js";
import { HostFailure } from "./Subscriptions.errors.js";
import { SubscriptionTimers } from "./SubscriptionTimers.service.js";
import { DEFAULT_FEED_CHECK_INTERVAL_MS, DEFAULT_REFRESH_DEDUPE_WINDOW_MS } from "./types.js";
import type { SchedulerOptions } from "./SubscriptionScheduler.service.js";
import type { TimerCancel } from "./SubscriptionTimers.service.js";
export const layer = (options: SchedulerOptions = {}) =>
  Layer.effect(
    SubscriptionScheduler,
    Effect.gen(function* () {
      const work = yield* SchedulerWork;
      const timers = yield* SubscriptionTimers;
      const log = yield* SubscriptionLog;
      const dispatch = yield* SubscriptionDispatch;
      const timing = yield* LegacyTiming;
      const overrideOption = yield* Effect.serviceOption(SubscriptionSchedulerSettings);
      const override = O.getOrUndefined(overrideOption);
      const interval = override?.intervalMs ?? Effect.succeed(options.intervalMs ?? DEFAULT_FEED_CHECK_INTERVAL_MS);
      const dedupe =
        override?.dedupeMs ?? Effect.succeed(options.refreshDedupeWindowMs ?? DEFAULT_REFRESH_DEDUPE_WINDOW_MS);
      const recent = MutableHashMap.empty<string, number>();
      let timer: TimerCancel | null = null;
      let running = false;
      let pending = false;
      let stopped = false;
      let generation = 0;
      const runIfIdle: import("./SubscriptionTimers.service.js").Operation<void> = Effect.suspend(() => {
        if (running) {
          pending = true;
          return Effect.void;
        }
        running = true;
        const body = work.runAll.pipe(
          Effect.catch((error) =>
            log.write("error", "scheduler: runAll threw", { err: S.is(HostFailure)(error) ? error.original : error })
          )
        );
        const cleanup = Effect.gen(function* () {
          running = false;
          if (pending && !stopped) {
            pending = false;
            yield* dispatch.detach(runIfIdle);
          }
        });
        return withLegacyFinally(body, cleanup);
      });
      const scheduleNext = Effect.fnUntraced(function* (delay?: number) {
        if (stopped) return;
        if (timer !== null) yield* timer;
        const milliseconds = delay ?? (yield* interval);
        timer = yield* timers.after(milliseconds, {
          run: Effect.suspend(() => {
            timer = null;
            return tick;
          }),
        });
      });
      const tick: import("./SubscriptionTimers.service.js").Operation<void> = Effect.suspend(() => {
        if (stopped) return Effect.void;
        const current = generation;
        const body = Effect.gen(function* () {
          if (yield* work.isLeader) {
            yield* runIfIdle.pipe(withLegacyFinally(timing.turn("scheduler:tick:runIfIdle")));
          } else yield* log.write("info", "scheduler: skipping tick (not leader)");
        });
        const cleanup = Effect.suspend(() => (!stopped && current === generation ? scheduleNext() : Effect.void));
        return withLegacyFinally(body, cleanup);
      });
      return SubscriptionScheduler.of({
        start: Effect.fnUntraced(function* (delay) {
          stopped = false;
          generation++;
          yield* scheduleNext(delay ?? 0);
        }),
        stop: Effect.gen(function* () {
          stopped = true;
          generation++;
          pending = false;
          if (timer !== null) {
            yield* timer;
            timer = null;
          }
        }),
        triggerNow: Effect.fnUntraced(function* (id) {
          if (id !== undefined && Boolean(id)) {
            const now = yield* timers.now;
            const last = O.getOrUndefined(MutableHashMap.get(recent, id));
            const dedupeMs = yield* dedupe;
            if (last !== undefined && now - last < dedupeMs) {
              yield* log.write("info", "scheduler: dropping triggerNow within dedupe window", {
                subscriptionId: id,
                ageMs: now - last,
              });
              return;
            }
            MutableHashMap.set(recent, id, now);
            const cutoff = now - (yield* dedupe) * 4;
            for (const [key, time] of recent) if (time < cutoff) MutableHashMap.remove(recent, key);
            yield* work.runOne(id);
            return;
          }
          yield* runIfIdle.pipe(withLegacyFinally(timing.turn("scheduler:triggerNow:runIfIdle")));
        }),
      });
    })
  );
