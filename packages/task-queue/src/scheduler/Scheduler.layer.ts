import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as MutableHashMap from "effect/MutableHashMap";
import * as MutableHashSet from "effect/MutableHashSet";
import * as Option from "effect/Option";
import * as P from "effect/Predicate";
import * as R from "effect/Record";
import * as Semaphore from "effect/Semaphore";
import { LegacyTiming } from "../LegacyTiming.service.js";
import { RegistryInspection } from "../RegistryInspection.service.js";
import { SourceAdmission } from "../SourceAdmission.service.js";
import { InvalidConcurrency } from "../TaskQueue.errors.js";
import { TaskQueueHooks } from "../TaskQueue.service.js";
import { TaskStore } from "../TaskStore.service.js";
import { canAdmitTranscription, isDownloadTaskKind, TRANSCRIPTION_GROUP_KEY } from "../types.js";
import { MinHeap } from "../util/min-heap.js";
import { Scheduler } from "./Scheduler.service.js";
import type { Release } from "../SourceAdmission.service.js";
export interface SchedulerOptions<E> {
  readonly admissionEnabled?: boolean;
  readonly defaultMaxPerGroup?: number | null;
  readonly demote: (id: string) => Effect.Effect<void, E>;
  readonly dispatch: (id: string) => Effect.Effect<boolean, E>;
  readonly maxConcurrency: number;
}
export const make = Effect.fnUntraced(function* <E>(options: SchedulerOptions<E>) {
  const store = yield* TaskStore;
  const admission = yield* SourceAdmission;
  const timing = yield* LegacyTiming;
  const scope = yield* Effect.scope;
  const owner = yield* Effect.context<never>();
  const mutex = yield* Semaphore.make(1);
  const ready = new MinHeap<{ taskId: string; priority: number; seq: number }>((a, b) =>
    a.priority === b.priority ? a.seq - b.seq : a.priority - b.priority
  );
  const running = MutableHashSet.empty<string>();
  const reservations = MutableHashMap.empty<string, number>();
  let reservationSeq = 0;
  const reservation = (id: string) => Option.getOrElse(MutableHashMap.get(reservations, id), () => 0);
  const runningIds = () =>
    A.sort(Array.from(running), (a: string, b: string) =>
      reservation(a) < reservation(b) ? -1 : reservation(a) > reservation(b) ? 1 : 0
    );
  const dispatching = MutableHashSet.empty<string>();
  const groups = MutableHashMap.empty<string, number>();
  const caps = MutableHashMap.empty<string, number | null>();
  const leases = MutableHashMap.empty<string, Release>();
  const inspection = yield* Effect.serviceOption(RegistryInspection);
  if (Option.isSome(inspection))
    inspection.value.register("scheduler", () => ({
      running: MutableHashSet.size(running),
      dispatching: MutableHashSet.size(dispatching),
      reservations: MutableHashMap.size(reservations),
      leases: MutableHashMap.size(leases),
      groups: MutableHashMap.size(groups),
      ready: ready.size(),
    }));
  let seq = 0;
  let max = options.maxConcurrency;
  let downloadMax: number | null = null;
  const groupCount = (key: string) => Option.getOrElse(MutableHashMap.get(groups, key), () => 0);
  const inc = (key: string) => MutableHashMap.set(groups, key, groupCount(key) + 1);
  const dec = (key: string) => {
    const n = groupCount(key);
    if (n <= 1) MutableHashMap.remove(groups, key);
    else MutableHashMap.set(groups, key, n - 1);
  };
  const releaseAdmission = Effect.fnUntraced(function* (id: string) {
    const release = MutableHashMap.get(leases, id);
    MutableHashMap.remove(leases, id);
    if (Option.isSome(release)) yield* release.value;
  });
  const lock = Effect.fnUntraced(function* <A, E, R>(body: Effect.Effect<A, E, R>) {
    return yield* Effect.gen(function* () {
      yield* timing.turn("scheduler.lock.acquire");
      const result = yield* body;
      yield* timing.turn("scheduler.lock.body");
      return result;
    }).pipe(mutex.withPermits(1));
  });
  const pop = Effect.fnUntraced(function* () {
    const skipped: Array<{ taskId: string; priority: number; seq: number }> = [];
    let chosen: (typeof skipped)[number] | undefined;
    while (ready.size() > 0) {
      const top = ready.pop();
      if (top === undefined) break;
      const task = yield* store.get(top.taskId);
      if (task === undefined || MutableHashSet.has(running, top.taskId)) continue;
      const cap = Option.getOrElse(MutableHashMap.get(caps, task.groupKey), () => options.defaultMaxPerGroup ?? null);
      let waits = false;
      if (downloadMax !== null && (task.kind === "transcription" || task.groupKey === TRANSCRIPTION_GROUP_KEY)) {
        let count = 0;
        for (const id of runningIds()) {
          const current = yield* store.get(id);
          if (current !== undefined && isDownloadTaskKind(current.kind)) count++;
        }
        waits = !canAdmitTranscription(count, downloadMax);
      }
      if (waits || (cap !== null && groupCount(task.groupKey) >= cap)) {
        skipped.push(top);
        continue;
      }
      if (options.admissionEnabled !== false && task.kind !== "transcription") {
        const release = yield* admission.tryAcquire(task.input.url);
        if (Option.isNone(release)) {
          skipped.push(top);
          continue;
        }
        MutableHashMap.set(leases, top.taskId, release.value);
      }
      chosen = top;
      break;
    }
    for (const entry of skipped) ready.push(entry);
    return chosen;
  });
  const rollback = Effect.fnUntraced(function* (id: string) {
    MutableHashSet.remove(dispatching, id);
    yield* lock(
      Effect.gen(function* () {
        yield* releaseAdmission(id);
        if (MutableHashSet.has(running, id)) {
          MutableHashSet.remove(running, id);
          MutableHashMap.remove(reservations, id);
          const task = yield* store.get(id);
          if (task !== undefined && P.isTruthy(task.groupKey)) dec(task.groupKey);
        }
      })
    );
  });
  const dispatch = Effect.fnUntraced(function* () {
    const ids: string[] = [];
    const undispatched = new MinHeap<{ taskId: string; priority: number; seq: number }>((a, b) => a.seq - b.seq);
    yield* Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        yield* lock(
          Effect.gen(function* () {
            while (MutableHashSet.size(running) < max && ready.size() > 0) {
              const candidate = yield* pop();
              if (candidate === undefined) break;
              const task = yield* store.get(candidate.taskId);
              if (task === undefined) {
                yield* releaseAdmission(candidate.taskId);
                continue;
              }
              MutableHashSet.add(running, candidate.taskId);
              MutableHashMap.set(reservations, candidate.taskId, ++reservationSeq);
              MutableHashSet.add(dispatching, candidate.taskId);
              inc(task.groupKey);
              ids.push(candidate.taskId);
              undispatched.push(candidate);
            }
          })
        );
        for (const id of ids) {
          const ok = yield* restore(
            Effect.suspend(() => {
              undispatched.remove((entry) => entry.taskId === id);
              return options.dispatch(id);
            }).pipe(
              Effect.catchCause((cause) => Effect.logError("task_queue_dispatch_threw", cause).pipe(Effect.as(false))),
              Effect.onExit((exit) =>
                Effect.sync(() => {
                  // Acceptance transfers the reservation before any later timing/adoption turn.
                  if (Exit.isSuccess(exit) && exit.value) MutableHashSet.remove(dispatching, id);
                })
              ),
              Effect.tap(() => timing.turn("scheduler.dispatch.callback"))
            )
          );
          if (ok) MutableHashSet.remove(dispatching, id);
          else yield* rollback(id);
        }
      }).pipe(
        Effect.ensuring(
          Effect.gen(function* () {
            for (const id of ids) if (MutableHashSet.has(dispatching, id)) yield* rollback(id);
            if (undispatched.size() > 0)
              yield* lock(
                Effect.sync(() => {
                  for (const entry of undispatched.toArray()) ready.push(entry);
                })
              );
          })
        )
      )
    );
  });
  const ensureEnqueued = Effect.fnUntraced(function* (id: string, priority: number) {
    yield* lock(
      Effect.sync(() => {
        if (!MutableHashSet.has(running, id) && !A.some(ready.toArray(), (entry) => entry.taskId === id))
          ready.push({ taskId: id, priority, seq: ++seq });
      })
    );
    yield* dispatch();
    yield* timing.turn("scheduler.enqueue.dispatch");
  });
  const detach = (effect: Effect.Effect<void>) =>
    effect.pipe(Effect.provideContext(owner), Effect.forkIn(scope, { startImmediately: true }), Effect.asVoid);
  yield* Effect.acquireRelease(admission.subscribe(detach(dispatch())), (off) => Effect.sync(off));
  return Scheduler.of({
    enqueue: ensureEnqueued,
    ensureEnqueued,
    dequeue: Effect.fnUntraced(function* (id) {
      const result = yield* lock(Effect.sync(() => ready.remove((entry) => entry.taskId === id) != null));
      yield* timing.turn("scheduler.dequeue.adoption.1");
      yield* timing.turn("scheduler.dequeue.adoption.2");
      return result;
    }),
    kick: dispatch(),
    releaseSlot: Effect.fnUntraced(function* (id) {
      yield* lock(
        Effect.gen(function* () {
          yield* releaseAdmission(id);
          if (!MutableHashSet.has(running, id)) return;
          MutableHashSet.remove(running, id);
          MutableHashMap.remove(reservations, id);
          const task = yield* store.get(id);
          if (task !== undefined && P.isTruthy(task.groupKey)) dec(task.groupKey);
        })
      );
      yield* dispatch();
    }),
    sweepDeadSlots: Effect.fnUntraced(function* (isLive) {
      yield* lock(
        Effect.gen(function* () {
          for (const id of runningIds()) {
            if (MutableHashSet.has(dispatching, id)) continue;
            const live = isLive(id);
            if (Effect.isEffect(live) ? yield* live : live) continue;
            MutableHashSet.remove(running, id);
            MutableHashMap.remove(reservations, id);
            yield* releaseAdmission(id);
          }
          MutableHashMap.clear(groups);
          for (const id of runningIds()) {
            const task = yield* store.get(id);
            if (task !== undefined) inc(task.groupKey);
          }
        })
      );
      yield* dispatch();
    }),
    setMaxConcurrency: Effect.fnUntraced(function* (n) {
      if (!Number.isInteger(n) || n < 1)
        return yield* InvalidConcurrency.make({ legacyMessage: `maxConcurrency must be ≥ 1 integer, got ${n}` });
      const demote: string[] = [];
      yield* lock(
        Effect.gen(function* () {
          max = n;
          while (MutableHashSet.size(running) > max) {
            let victim: string | undefined;
            let priority = -1;
            for (const id of runningIds()) {
              const task = yield* store.get(id);
              if (task !== undefined && task.priority > priority) {
                priority = task.priority;
                victim = id;
              }
            }
            if (!P.isTruthy(victim) || victim === undefined) break;
            demote.push(victim);
            MutableHashSet.remove(running, victim);
            MutableHashMap.remove(reservations, victim);
            const task = yield* store.get(victim);
            if (task !== undefined && P.isTruthy(task.groupKey)) dec(task.groupKey);
          }
        })
      );
      for (const id of demote)
        yield* options.demote(id).pipe(
          Effect.andThen(releaseAdmission(id)),
          Effect.catchCause((cause) => Effect.logError("task_queue_demote_threw", cause))
        );
      yield* detach(dispatch());
    }),
    setMaxConcurrentDownloads: Effect.fnUntraced(function* (n) {
      if (!Number.isInteger(n) || n < 1)
        return yield* InvalidConcurrency.make({
          legacyMessage: `maxConcurrentDownloads must be ≥ 1 integer, got ${n}`,
        });
      yield* lock(
        Effect.sync(() => {
          downloadMax = n;
        })
      );
      yield* dispatch();
    }),
    setMaxPerGroup: Effect.fnUntraced(function* (key, n) {
      yield* lock(
        Effect.gen(function* () {
          if (n == null) MutableHashMap.remove(caps, key);
          else {
            if (!Number.isInteger(n) || n < 1)
              return yield* InvalidConcurrency.make({
                legacyMessage: `maxPerGroup must be null or ≥ 1 integer, got ${n}`,
              });
            MutableHashMap.set(caps, key, n);
          }
        })
      );
      yield* detach(dispatch());
    }),
    stats: Effect.sync(() => ({
      running: MutableHashSet.size(running),
      queued: ready.size(),
      capacity: max,
      perGroup: R.fromEntries(groups),
    })),
  });
});
export const layer = <E>(options: SchedulerOptions<E>) => Layer.effect(Scheduler, make(options));

export const layerFromHooks = (
  options: Omit<SchedulerOptions<import("../TaskQueue.service.js").QueueError>, "dispatch" | "demote">
) =>
  Layer.effect(
    Scheduler,
    Effect.gen(function* () {
      const hooks = yield* TaskQueueHooks;
      return yield* make({ ...options, dispatch: hooks.dispatch, demote: hooks.demote });
    })
  );
