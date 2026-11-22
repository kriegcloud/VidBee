import * as A from "effect/Array";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import * as Scope from "effect/Scope";
import { failure } from "../../renderer/src/transport/DocumentDelivery.errors.js";
import type { DeliveryError } from "../../renderer/src/transport/DocumentDelivery.errors.js";
import type { OperationHandle, OperationOwner } from "./ApplicationOperations.service.js";

export interface OperationAccount {
  readonly release: (origin: string, bytes: number) => void;
  readonly reserve: (origin: string, bytes: number) => boolean;
}
/** The caller supplies the application scope, never an individual request scope. */
export const makeOperations = Effect.fn("ApplicationOperations.make")(function* (
  account: OperationAccount,
  maxWork = 1024
) {
  const scope = yield* Scope.Scope;
  let accepting = true;
  let active = HashSet.empty<Effect.Effect<void, DeliveryError>>();
  let failedCleanupTasks = HashMap.empty<Effect.Effect<void, DeliveryError>, ReadonlyArray<Effect.Effect<void>>>();
  const accept: OperationOwner["accept"] = Effect.fn("ApplicationOperations.accept")(function* <A, E>(options: {
    readonly originAccount: string;
    readonly reserveBytes: number;
    readonly run: (handle: OperationHandle<A, E>) => Effect.Effect<void>;
  }) {
    if (
      !accepting ||
      HashSet.size(active) >= maxWork ||
      !Number.isSafeInteger(options.reserveBytes) ||
      options.reserveBytes < 0 ||
      !account.reserve(options.originAccount, options.reserveBytes)
    )
      return yield* failure("OperationCapacity");
    let bytes = options.reserveBytes;
    let sealed = false;
    let completed = false;
    const cleanups: Array<Effect.Effect<void>> = [];
    const logical = Deferred.makeUnsafe<Exit.Exit<A, E>>();
    const released = Deferred.makeUnsafe<void, DeliveryError>();
    const handle: OperationHandle<A, E> = {
      originAccount: options.originAccount,
      logical: Deferred.await(logical),
      released: Deferred.await(released),
      grow: (amount) =>
        Effect.suspend(() => {
          if (sealed || !Number.isSafeInteger(amount) || amount < 0 || !account.reserve(options.originAccount, amount))
            return Effect.fail(failure("OperationCapacity"));
          bytes += amount;
          return Effect.void;
        }),
      registerCleanup: (cleanup) =>
        Effect.suspend(() => {
          if (sealed || cleanups.length >= 16 || !account.reserve(options.originAccount, 256))
            return Effect.fail(failure("CleanupClosed"));
          bytes += 256;
          cleanups.push(cleanup);
          return Effect.void;
        }),
      complete: (exit) =>
        Effect.suspend(() => {
          if (sealed || completed) return Effect.fail(failure("AlreadyCompleted"));
          completed = true;
          Deferred.doneUnsafe(logical, Exit.succeed(exit));
          return Effect.void;
        }),
    };
    active = HashSet.add(active, handle.released);
    const work = Effect.gen(function* () {
      const exit = yield* Effect.exit(Effect.suspend(() => options.run(handle)));
      if (!completed) {
        completed = true;
        Deferred.doneUnsafe(
          logical,
          Exit.succeed(Exit.isFailure(exit) ? Exit.failCause(exit.cause) : Exit.die("OperationIncomplete"))
        );
      } else if (Exit.isFailure(exit))
        yield* Effect.logError("Application operation failed after logical completion", exit.cause);
      sealed = true;
      const exits = yield* Effect.forEach(cleanups, Effect.exit, { concurrency: 1 });
      if (A.some(exits, Exit.isFailure)) {
        failedCleanupTasks = HashMap.set(failedCleanupTasks, handle.released, cleanups);
        Deferred.doneUnsafe(released, Exit.fail(failure("CleanupFailed")));
        return;
      }
      account.release(options.originAccount, bytes);
      bytes = 0;
      active = HashSet.remove(active, handle.released);
      Deferred.doneUnsafe(released, Exit.void);
    });
    yield* Effect.forkIn(work, scope);
    return handle;
  });
  const owner: OperationOwner = {
    accept,
    closeAdmission: Effect.sync(() => {
      accepting = false;
    }),
    drain: Effect.gen(function* () {
      const exits = yield* Effect.forEach(active, Effect.exit, { concurrency: 1 });
      if (HashMap.size(failedCleanupTasks) > 0 || A.some(exits, Exit.isFailure)) return yield* failure("CleanupFailed");
    }),
  };
  return owner;
});
