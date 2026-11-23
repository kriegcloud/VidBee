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

/**
 * Reserves and releases bytes and optional native slots in the originating application account; a renderer departure does not transfer this ownership to another client.
 *
 * @category type-level
 * @since 0.0.0
 */
export interface OperationAccount {
  readonly begin?: (origin: string) => (() => void) | undefined;
  readonly release: (origin: string, bytes: number) => void;
  readonly reserve: (origin: string, bytes: number) => boolean;
}
/**
 * Accepts work into an application scope before returning its handle. Logical completion may precede native release; scope interruption settles both signals and attempts every registered cleanup.
 *
 * **Example** (Use makeOperations with its owner)
 *
 * ```ts
 * import { makeOperations } from "./ApplicationOperations.layer.js"
 * import * as Effect from "effect/Effect"
 * export const shutdown = Effect.scoped(Effect.gen(function* () {
 *   const owner = yield* makeOperations({ reserve: () => true, release: () => {} });
 *   yield* owner.closeAdmission;
 *   yield* owner.drain;
 * }));
 * // Run shutdown at the application entrypoint; success means no accepted native ownership remains.
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
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
    const releaseNative = account.begin?.(options.originAccount);
    if (
      (account.begin !== undefined && releaseNative === undefined) ||
      !accepting ||
      scope.state._tag === "Closed" ||
      HashSet.size(active) >= maxWork ||
      !Number.isSafeInteger(options.reserveBytes) ||
      options.reserveBytes < 0 ||
      !account.reserve(options.originAccount, options.reserveBytes)
    ) {
      releaseNative?.();
      return yield* failure("OperationCapacity");
    }
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
    let settled = false;
    const settle = Effect.fn("ApplicationOperations.settle")(function* (exit: Exit.Exit<void>) {
      if (settled) return;
      settled = true;
      sealed = true;
      if (!completed) {
        completed = true;
        Deferred.doneUnsafe(
          logical,
          Exit.succeed(Exit.isFailure(exit) ? Exit.failCause(exit.cause) : Exit.die("OperationIncomplete"))
        );
      } else if (Exit.isFailure(exit))
        yield* Effect.logError("Application operation failed after logical completion", exit.cause).pipe(
          Effect.ignoreCause
        );
      const exits = yield* Effect.forEach(cleanups, Effect.exit, { concurrency: 1 });
      if (A.some(exits, Exit.isFailure)) {
        failedCleanupTasks = HashMap.set(failedCleanupTasks, handle.released, cleanups);
        Deferred.doneUnsafe(released, Exit.fail(failure("CleanupFailed")));
        return;
      }
      account.release(options.originAccount, bytes);
      releaseNative?.();
      bytes = 0;
      active = HashSet.remove(active, handle.released);
      Deferred.doneUnsafe(released, Exit.void);
    });
    // One sequential child owns termination before fallback settlement, regardless of the parent strategy.
    // Install the fallback first so the later worker finalizer runs before it (LIFO).
    const settlementScope = yield* Scope.fork(scope, "sequential");
    yield* Scope.addFinalizer(settlementScope, settle(Exit.interrupt()));
    const work = Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        if (settled) return;
        const exit = yield* Effect.exit(restore(Effect.suspend(() => options.run(handle))));
        yield* settle(exit);
      })
    ).pipe(Effect.ensuring(Scope.close(settlementScope, Exit.void)));
    yield* Effect.forkIn(work, settlementScope);
    return handle;
  }, Effect.uninterruptible);
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
