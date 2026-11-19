import { expect, layer } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Option from "effect/Option";
import * as RuntimeScheduler from "effect/Scheduler";
import { LegacyTiming } from "../src/LegacyTiming.service.js";
import { layer as admissionLayer } from "../src/SourceAdmission.layer.js";
import { SourceAdmission } from "../src/SourceAdmission.service.js";
import { make as makeScheduler } from "../src/scheduler/Scheduler.layer.js";
import { layer as storeLayer } from "../src/TaskStore.layer.js";
import { TaskStore } from "../src/TaskStore.service.js";
import { task } from "./fixtures.js";
import { releaseFromForeignOwner } from "./legacy/foreign.js";

layer(Layer.mergeAll(storeLayer, admissionLayer, LegacyTiming.layer), { buildPerTest: true })((it) => {
  it.effect("M6: interrupting dispatch rolls back slots, group counts and source admission", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore;
      const admission = yield* SourceAdmission;
      yield* store.insert(task("interrupted", { groupKey: "g" }));
      yield* store.insert(task("next", { groupKey: "g" }));
      const entered = yield* Deferred.make<void>();
      const scheduler = yield* makeScheduler({
        maxConcurrency: 1,
        dispatch: Effect.fnUntraced(function* (id) {
          if (id === "interrupted") {
            yield* Deferred.succeed(entered, undefined);
            return yield* Effect.never;
          }
          return true;
        }),
        demote: () => Effect.void,
      });
      const dispatch = yield* scheduler.enqueue("interrupted", 0).pipe(Effect.forkChild);
      yield* Deferred.await(entered);
      yield* Fiber.interrupt(dispatch);
      const empty = yield* scheduler.stats;
      expect(empty.running).toBe(0);
      expect(empty.perGroup).toEqual({});
      const lease = yield* admission.tryAcquire("https://example.com/other");
      expect(Option.isSome(lease)).toBe(true);
      if (Option.isSome(lease)) yield* lease.value;
      yield* scheduler.sweepDeadSlots(() => false);
      yield* scheduler.enqueue("next", 0);
      const next = yield* scheduler.stats;
      expect(next.running).toBe(1);
      yield* scheduler.releaseSlot("next");
    })
  );
  for (const count of [2, 3]) {
    it.effect(`R5: interrupted batch of ${count} restores every undispatched heap entry in order`, () =>
      Effect.gen(function* () {
        const store = yield* TaskStore;
        const entered = yield* Deferred.make<void>();
        const dispatched: string[] = [];
        const scheduler = yield* makeScheduler({
          maxConcurrency: count,
          admissionEnabled: false,
          dispatch: Effect.fnUntraced(function* (id) {
            dispatched.push(id);
            if (id === "a") {
              yield* Deferred.succeed(entered, undefined);
              return yield* Effect.never;
            }
            return true;
          }),
          demote: () => Effect.void,
        });
        for (let i = 0; i < count; i++) {
          const id = `old${i}`;
          yield* store.insert(task(id));
          yield* scheduler.enqueue(id, 0);
        }
        for (const id of ["a", "b", "c"].slice(0, count)) {
          yield* store.insert(task(id));
          yield* scheduler.enqueue(id, id === "a" ? 0 : 5);
        }
        yield* store.insert(task("later"));
        yield* scheduler.enqueue("later", 5);
        const batch = yield* scheduler.sweepDeadSlots(() => false).pipe(Effect.forkChild);
        yield* Deferred.await(entered);
        yield* Fiber.interrupt(batch);
        expect((yield* scheduler.stats).queued).toBe(count);
        yield* scheduler.kick;
        expect(dispatched.slice(count)).toEqual([...["a", "b", "c"].slice(0, count), "later"]);
        expect((yield* scheduler.stats).running).toBe(count);
        for (const id of ["b", "c"].slice(0, count - 1)) yield* scheduler.releaseSlot(id);
        yield* scheduler.releaseSlot("later");
        expect((yield* scheduler.stats).perGroup).toEqual({});
      })
    );
  }
  it.effect("M1: sweep evaluates the live accessor inside the lock after dispatch completes", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore;
      const admission = yield* SourceAdmission;
      yield* store.insert(task("live", { status: "queued" }));
      const enter = yield* Deferred.make<void>();
      const finish = yield* Deferred.make<void>();
      let live = false;
      const scheduler = yield* makeScheduler({
        maxConcurrency: 1,
        dispatch: Effect.fnUntraced(function* () {
          yield* Deferred.succeed(enter, undefined);
          yield* Deferred.await(finish);
          live = true;
          return true;
        }),
        demote: () => Effect.void,
      });
      const dispatch = yield* scheduler.enqueue("live", 0).pipe(Effect.forkChild);
      yield* Deferred.await(enter);
      // Construct the sweep while the task is still starting; evaluating it must read live later.
      const sweep = scheduler.sweepDeadSlots(() => Effect.sync(() => live));
      yield* Deferred.succeed(finish, undefined);
      yield* Fiber.join(dispatch);
      yield* sweep;
      const stats = yield* scheduler.stats;
      expect(stats.running).toBe(1);
      const lease = yield* admission.tryAcquire("https://example.com/other");
      expect(Option.isNone(lease)).toBe(true);
      yield* scheduler.releaseSlot("live");
    })
  );
});

const messages: unknown[] = [];
const ownerLogger = Logger.make((entry) => {
  messages.push(entry.message);
});
layer(
  Layer.mergeAll(
    storeLayer,
    admissionLayer,
    LegacyTiming.layer,
    Logger.layer([ownerLogger]),
    Layer.succeed(RuntimeScheduler.PreventSchedulerYield, true)
  ),
  { buildPerTest: true }
)((it) => {
  it.effect("M8: a foreign admission release re-enters the queue logger and yield policy synchronously", () =>
    Effect.gen(function* () {
      messages.length = 0;
      const store = yield* TaskStore;
      const admission = yield* SourceAdmission;
      const release = yield* admission.acquire("https://example.com/map");
      yield* store.insert(task("owner"));
      const order: string[] = [];
      const scheduler = yield* makeScheduler({
        maxConcurrency: 1,
        dispatch: Effect.fnUntraced(function* () {
          const preventYield = yield* RuntimeScheduler.PreventSchedulerYield;
          expect(preventYield).toBe(true);
          order.push("dispatch");
          yield* Effect.logError("owner-sink");
          return true;
        }),
        demote: () => Effect.void,
      });
      yield* scheduler.enqueue("owner", 0);
      order.push("before-release");
      releaseFromForeignOwner(release);
      order.push("after-release");
      expect(order).toEqual(["before-release", "dispatch", "after-release"]);
      expect(messages).toContainEqual(["owner-sink"]);
      yield* scheduler.releaseSlot("owner");
    })
  );
});

let acceptedTurn: Deferred.Deferred<void> | undefined;
const adoptionTiming = Layer.succeed(LegacyTiming, {
  turn: Effect.fn("adoptionTiming.turn")((point) =>
    point === "scheduler.dispatch.callback"
      ? Effect.gen(function* () {
          if (acceptedTurn !== undefined) yield* Deferred.succeed(acceptedTurn, undefined);
          return yield* Effect.never;
        })
      : Effect.void
  ),
});
layer(Layer.mergeAll(storeLayer, admissionLayer, adoptionTiming), { buildPerTest: true })((it) => {
  it.effect("M6: interruption after acceptance keeps the live reservation and admission lease", () =>
    Effect.gen(function* () {
      acceptedTurn = yield* Deferred.make<void>();
      const store = yield* TaskStore;
      const admission = yield* SourceAdmission;
      yield* store.insert(task("accepted"));
      const scheduler = yield* makeScheduler({
        maxConcurrency: 1,
        dispatch: () => Effect.succeed(true),
        demote: () => Effect.void,
      });
      const dispatch = yield* scheduler.enqueue("accepted", 0).pipe(Effect.forkChild);
      yield* Deferred.await(acceptedTurn);
      yield* Fiber.interrupt(dispatch);
      const stats = yield* scheduler.stats;
      expect(stats.running).toBe(1);
      const blocked = yield* admission.tryAcquire("https://example.com/other");
      expect(Option.isNone(blocked)).toBe(true);
      yield* scheduler.releaseSlot("accepted");
      const empty = yield* scheduler.stats;
      expect(empty.running).toBe(0);
    })
  );
});

let lockTurns = 0;
let beforeCallback: Deferred.Deferred<void> | undefined;
let leaveLock: Deferred.Deferred<void> | undefined;
const boundaryTiming = Layer.succeed(LegacyTiming, {
  turn: Effect.fn("boundaryTiming.turn")((point) =>
    Effect.suspend(() => {
      if (
        point !== "scheduler.lock.body" ||
        ++lockTurns !== 2 ||
        beforeCallback === undefined ||
        leaveLock === undefined
      )
        return Effect.void;
      return Deferred.succeed(beforeCallback, undefined).pipe(Effect.andThen(Deferred.await(leaveLock)));
    })
  ),
});
layer(Layer.mergeAll(storeLayer, admissionLayer, boundaryTiming), { buildPerTest: true })((it) => {
  it.effect("R5: interruption at restore boundary restores an id whose callback never starts", () =>
    Effect.gen(function* () {
      lockTurns = 0;
      beforeCallback = yield* Deferred.make<void>();
      leaveLock = yield* Deferred.make<void>();
      const store = yield* TaskStore;
      yield* store.insert(task("boundary"));
      let calls = 0;
      const scheduler = yield* makeScheduler({
        maxConcurrency: 1,
        admissionEnabled: false,
        dispatch: Effect.fn("boundary.dispatch")(() =>
          Effect.sync(() => {
            calls++;
            return true;
          })
        ),
        demote: () => Effect.void,
      });
      const dispatch = yield* scheduler.enqueue("boundary", 7).pipe(Effect.forkChild);
      yield* Deferred.await(beforeCallback);
      const interrupted = yield* Fiber.interrupt(dispatch).pipe(Effect.forkChild);
      yield* Effect.yieldNow;
      yield* Deferred.succeed(leaveLock, undefined);
      yield* Fiber.join(interrupted);
      expect(calls).toBe(0);
      expect((yield* scheduler.stats).running).toBe(0);
      expect((yield* scheduler.stats).queued).toBe(1);
      yield* scheduler.kick;
      expect(calls).toBe(1);
      yield* scheduler.releaseSlot("boundary");
    })
  );
});
