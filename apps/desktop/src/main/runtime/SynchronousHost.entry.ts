import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as HashMap from "effect/HashMap";
import * as Result from "effect/Result";
import * as Scheduler from "effect/Scheduler";
import { failure } from "../../renderer/src/transport/DocumentDelivery.errors.js";
import type * as ManagedRuntime from "effect/ManagedRuntime";
import type { SynchronousCall } from "../lib/SynchronousHost.service.js";

/** Warmed compatibility runner; reservations survive uninterruptible accidental suspension. */
export const makeSynchronousHost = ({
  runtime,
  capacity = 64,
  reserve,
  release,
}: {
  readonly runtime: ManagedRuntime.ManagedRuntime<never, never>;
  readonly capacity?: number;
  readonly reserve: (bytes: number) => boolean;
  readonly release: (bytes: number) => void;
}) => {
  let count = 0;
  let serial = 0;
  let retained = HashMap.empty<number, Effect.Effect<void>>();
  let failures = HashMap.empty<number, ReadonlyArray<() => void>>();
  const reject = (reason: string): never => Result.getOrThrowWith(Result.fail(failure(reason)), (error) => error);
  const run = <A, E>(make: (call: SynchronousCall) => Effect.Effect<A, E>): A => {
    if (count >= capacity || serial >= Number.MAX_SAFE_INTEGER || !reserve(4096)) return reject("CleanupCapacity");
    count++;
    const id = ++serial;
    let active = true;
    let cleaned = false;
    const cleanups: Array<() => void> = [];
    const call: SynchronousCall = {
      use: (body) => (active ? body() : reject("SynchronousCallRevoked")),
      cleanup: (body) => {
        if (!active || cleanups.length >= 8) return reject("CleanupCapacity");
        cleanups.push(body);
      },
    };
    const finish = () => {
      if (cleaned) return;
      cleaned = true;
      const failed: Array<() => void> = [];
      for (const cleanup of cleanups) {
        const result = Result.try({ try: cleanup, catch: () => failure("CleanupFailed") });
        if (Result.isFailure(result)) failed.push(cleanup);
      }
      if (failed.length > 0) failures = HashMap.set(failures, id, failed);
      else {
        count--;
        retained = HashMap.remove(retained, id);
        release(4096);
      }
    };
    const fiber = runtime.runFork(
      Effect.suspend(() => make(call)),
      { scheduler: new Scheduler.MixedScheduler("sync") }
    );
    retained = HashMap.set(retained, id, Fiber.await(fiber).pipe(Effect.asVoid));
    fiber.currentDispatcher.flush();
    const exit = fiber.pollUnsafe();
    active = false;
    if (exit !== undefined) {
      finish();
      if (Exit.isSuccess(exit)) return exit.value;
      return Result.getOrThrowWith(exit.cause.pipe(Cause.squash, Result.fail), (error) => error);
    }
    // The same cleanup transition handles immediate and suspended exits.
    fiber.addObserver(finish);
    fiber.interruptUnsafe();
    fiber.currentDispatcher.flush();
    return reject("SynchronousHostSuspended");
  };
  return {
    run,
    drain: Effect.gen(function* () {
      yield* Effect.all(retained.pipe(HashMap.values), { concurrency: 1, discard: true });
      if (HashMap.size(failures) > 0) return yield* failure("CleanupFailed");
    }),
    stats: () => ({ count, bytes: count * 4096, cleanupFailures: HashMap.size(failures) }),
  };
};
