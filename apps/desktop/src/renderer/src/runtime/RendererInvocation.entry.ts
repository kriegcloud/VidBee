import * as A from "effect/Array";
import * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as HashMap from "effect/HashMap";
import * as Result from "effect/Result";
import { failure } from "../transport/DocumentDelivery.errors.js";
import type * as Fiber from "effect/Fiber";
import type * as ManagedRuntime from "effect/ManagedRuntime";
import type { DeliveryError } from "../transport/DocumentDelivery.errors.js";

/** One owner per document, closed before registry disposal on HMR/permanent departure. */
export const makeInvocationEntry = (runtime: ManagedRuntime.ManagedRuntime<never, never>) => {
  let closed = false;
  let serial = 0;
  let pending = HashMap.empty<number, () => void>();
  let callbacks: ReadonlyArray<{ readonly id: number; readonly bytes: number; readonly callback: () => void }> = [];
  let callbackBytes = 0;
  const invoke = <A, E>({
    effect,
    settle,
  }: {
    readonly effect: Effect.Effect<A, E>;
    readonly settle: (exit: Exit.Exit<A, E | DeliveryError>) => void;
  }) => {
    if (closed || HashMap.size(pending) >= 1024 || serial >= Number.MAX_SAFE_INTEGER) {
      settle(Exit.fail(failure("InvocationCapacity")));
      return;
    }
    const id = ++serial;
    let fiber: Fiber.Fiber<A, E> | undefined;
    let finished = false;
    const finish = (exit: Exit.Exit<A, E | DeliveryError>) => {
      if (finished) return;
      finished = true;
      pending = HashMap.remove(pending, id);
      settle(exit);
    };
    pending = HashMap.set(pending, id, () => {
      finish(failure("DocumentClosed").pipe(Exit.fail));
      fiber?.interruptUnsafe();
    });
    const start = Deferred.makeUnsafe<void>();
    fiber = runtime.runFork(Effect.andThen(Deferred.await(start), effect));
    fiber.addObserver(finish);
    if (finished || closed) fiber.interruptUnsafe();
    else Deferred.doneUnsafe(start, Exit.void);
  };
  const close = (disposeRegistry: () => void) => {
    if (closed) return;
    closed = true;
    const callers = pending;
    // Settle all callers before disposing the registry that may clear atom listeners.
    for (const cancel of HashMap.values(callers)) cancel();
    pending = HashMap.empty();
    callbacks = [];
    callbackBytes = 0;
    disposeRegistry();
  };
  const invokePromise = <A, E>(effect: Effect.Effect<A, E>): Promise<A> => {
    const result = Promise.withResolvers<A>();
    invoke({
      effect,
      settle: (exit) => {
        if (Exit.isSuccess(exit)) result.resolve(exit.value);
        else result.reject(Cause.squash(exit.cause));
      },
    });
    return result.promise;
  };
  const registerAuth = ({
    callback,
    retainedBytes,
  }: {
    readonly callback: () => void;
    readonly retainedBytes: number;
  }) => {
    const bytes = Math.max(256, retainedBytes);
    if (
      closed ||
      !Number.isSafeInteger(retainedBytes) ||
      retainedBytes < 0 ||
      callbacks.length >= 256 ||
      callbackBytes + bytes > 256 * 1024 ||
      serial >= Number.MAX_SAFE_INTEGER
    )
      return Result.fail(failure("AuthCallbackCapacity"));
    const id = ++serial;
    callbacks = A.append(callbacks, { id, bytes, callback });
    callbackBytes += bytes;
    let active = true;
    return Result.succeed(() => {
      if (!active) return;
      active = false;
      if (A.some(callbacks, (entry) => entry.id === id)) callbackBytes -= bytes;
      callbacks = A.filter(callbacks, (entry) => entry.id !== id);
    });
  };
  return {
    invoke,
    invokePromise,
    close,
    registerAuth,
    emitAuth: () => {
      if (closed) return;
      for (let index = 0; index < callbacks.length; index++) callbacks[index]?.callback();
    },
    callbackStats: () => ({ count: callbacks.length, bytes: callbackBytes }),
    pending: () => HashMap.size(pending),
  };
};
