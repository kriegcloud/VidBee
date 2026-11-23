import * as A from "effect/Array";
import * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import * as O from "effect/Option";
import * as Result from "effect/Result";
import * as Atom from "effect/reactivity/Atom";
import { failure } from "../transport/DocumentDelivery.errors.js";
import { makeDeliveryGate } from "../transport/DocumentDelivery.service.js";
import { makeRecovery } from "./StreamRecovery.atoms.js";
import type * as Fiber from "effect/Fiber";
import type * as ManagedRuntime from "effect/ManagedRuntime";
import type * as AtomRegistry from "effect/reactivity/AtomRegistry";
import type { DeliveryError, TransportFailure } from "../transport/DocumentDelivery.errors.js";
import type { ResourceBudget, RetentionLease } from "../transport/ElectronRpc.model.js";

/**
 * Owns invocation fibers and callbacks for one renderer document; departure settles callers before registry disposal and client retirement cancels only that client’s work.
 *
 * **Example** (Use makeInvocationOwner with its owner)
 *
 * ```ts
 * import { makeInvocationOwner } from "./RendererInvocation.entry.js"
 * import * as Effect from "effect/Effect"
 * export const start = (options: Parameters<typeof makeInvocationOwner>[0]) => {
 *   const owner = makeInvocationOwner(options);
 *   const results: unknown[] = [];
 *   owner.invoke({ effect: Effect.succeed(42), settle: (exit) => { results.push(exit); } });
 *   return { results, dispose: () => owner.close(() => {}) };
 * };
 * // start receives the live document runtime; call dispose before runtime disposal.
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const makeInvocationOwner = ({
  runtime,
  resources,
}: {
  readonly runtime: ManagedRuntime.ManagedRuntime<never, never>;
  readonly resources?: import("../transport/ElectronRpc.model.js").ResourceBudget;
}) => {
  let closed = false;
  let retiredClients = HashSet.empty<number>();
  let serial = 0;
  let pending = HashMap.empty<number, () => void>();
  let pendingClients = HashMap.empty<number, number>();
  let reservations = HashMap.empty<number, import("../transport/ElectronRpc.model.js").RetentionLease>();
  let callbacks: ReadonlyArray<{
    readonly id: number;
    readonly bytes: number;
    readonly callback: () => void;
    active: boolean;
    readonly retention?: import("../transport/ElectronRpc.model.js").RetentionLease;
  }> = [];
  let callbackBytes = 0;
  let emitting = 0;
  const pruneCallbacks = () => {
    callbacks = A.filter(callbacks, (entry) => {
      if (entry.active) return true;
      callbackBytes -= entry.bytes;
      entry.retention?.release();
      return false;
    });
  };
  const invoke = <A, E>({
    effect,
    settle,
    client = 0,
  }: {
    readonly client?: number;
    readonly effect: Effect.Effect<A, E>;
    readonly settle: (exit: Exit.Exit<A, E | DeliveryError>) => void;
  }) => {
    const retention = resources?.claim("invocation", 256);
    const clientPending = A.filter(HashMap.values(pendingClients), (value) => value === client).length;
    if (
      closed ||
      HashSet.has(retiredClients, client) ||
      clientPending >= 256 ||
      (resources !== undefined && retention === undefined) ||
      HashMap.size(pending) >= 1024 ||
      serial >= Number.MAX_SAFE_INTEGER
    ) {
      retention?.release();
      settle(Exit.fail(failure("InvocationCapacity")));
      return;
    }
    const id = ++serial;
    pendingClients = HashMap.set(pendingClients, id, client);
    if (retention !== undefined) reservations = HashMap.set(reservations, id, retention);
    let fiber: Fiber.Fiber<A, E> | undefined;
    let finished = false;
    const finish = (exit: Exit.Exit<A, E | DeliveryError>) => {
      if (finished) return;
      finished = true;
      pending = HashMap.remove(pending, id);
      pendingClients = HashMap.remove(pendingClients, id);
      const retained = HashMap.get(reservations, id);
      if (retained._tag === "Some") retained.value.release();
      reservations = HashMap.remove(reservations, id);
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
    for (const callback of callbacks) callback.retention?.release();
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
    const retention = resources?.claim("auth", bytes);
    if (resources !== undefined && retention === undefined) return Result.fail(failure("AuthCallbackCapacity"));
    const id = ++serial;
    const registration = { id, bytes, callback, active: true, ...(retention === undefined ? {} : { retention }) };
    callbacks = A.append(callbacks, registration);
    callbackBytes += bytes;
    let active = true;
    return Result.succeed(() => {
      if (!active) return;
      active = false;
      registration.active = false;
      if (emitting === 0) pruneCallbacks();
    });
  };
  return {
    invoke,
    invokePromise,
    retireClient: (client: number) => {
      if (HashSet.has(retiredClients, client)) return;
      if (HashSet.size(retiredClients) >= 64) {
        close(() => {});
        return;
      }
      retiredClients = HashSet.add(retiredClients, client);
      for (const [id, owner] of HashMap.toEntries(pendingClients))
        if (owner === client)
          pending.pipe(HashMap.get(id), (entry) => {
            if (entry._tag === "Some") entry.value();
          });
    },
    close,
    registerAuth,
    emitAuth: () => {
      if (closed) return;
      emitting++;
      try {
        for (let index = 0; index < callbacks.length; index++) {
          const entry = callbacks[index];
          if (entry?.active === true) entry.callback();
        }
      } finally {
        emitting--;
        if (emitting === 0) pruneCallbacks();
      }
    },
    callbackStats: () => ({ count: callbacks.length, bytes: callbackBytes }),
    pending: () => HashMap.size(pending),
  };
};

/**
 * Creates the invocation facade over a borrowed document runtime; composition must close the returned owner before disposing that runtime.
 *
 * **Example** (Use makeInvocationEntry with its owner)
 *
 * ```ts
 * import { makeInvocationEntry } from "./RendererInvocation.entry.js"
 * import * as Effect from "effect/Effect"
 * export const start = (runtime: Parameters<typeof makeInvocationEntry>[0]) => {
 *   const owner = makeInvocationEntry(runtime);
 *   const results: unknown[] = [];
 *   owner.invoke({ effect: Effect.succeed(42), settle: (exit) => { results.push(exit); } });
 *   return { results, dispose: () => owner.close(() => {}) };
 * };
 * // Call the returned dispose function on permanent departure.
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const makeInvocationEntry = (runtime: ManagedRuntime.ManagedRuntime<never, never>) =>
  makeInvocationOwner({ runtime });

/**
 * Stores the current typed transport failure in the document atom registry; report is suitable for the connection failure callback and close prevents later registry writes.
 *
 * **Example** (Use makeTransportFailureOwner with its owner)
 *
 * ```ts
 * import { makeTransportFailureOwner } from "./RendererInvocation.entry.js"
 * import * as AtomRegistry from "effect/reactivity/AtomRegistry"
 * export const registry = AtomRegistry.make();
 * export const owner = makeTransportFailureOwner(registry);
 * owner.close();
 * registry.dispose();
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const makeTransportFailureOwner = (registry: AtomRegistry.AtomRegistry) => {
  const atom = Atom.make<O.Option<TransportFailure>>(O.none()).pipe(Atom.keepAlive);
  let live = true;
  return {
    atom,
    report: (failure: TransportFailure) => {
      if (live) registry.set(atom, O.some(failure));
    },
    close: () => {
      live = false;
    },
  };
};

/**
 * Combines document invocation, delivery, authentication and repair ownership. Permanent departure closes subordinate admission and settles work before disposing the atom registry.
 *
 * **Example** (Use makeRendererDocumentOwner with its owner)
 *
 * ```ts
 * import { makeRendererDocumentOwner } from "./RendererInvocation.entry.js"
 * export const own = (options: Parameters<typeof makeRendererDocumentOwner>[0]) => {
 *   const document = makeRendererDocumentOwner(options);
 *   return () => document.close();
 * };
 * // Pass the document runtime and registry disposer; invoke the returned function on HMR or departure.
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const makeRendererDocumentOwner = ({
  runtime,
  resources,
  disposeRegistry,
}: {
  readonly runtime: ManagedRuntime.ManagedRuntime<never, never>;
  readonly resources: ResourceBudget;
  readonly disposeRegistry: () => void;
}) => {
  const invocation = makeInvocationOwner({ runtime, resources });
  const delivery = makeDeliveryGate({ resources });
  let closed = false;
  let registryDisposed = false;
  let retired = HashSet.empty<string>();
  let retirementExhausted = false;
  let repairs = HashMap.empty<
    string,
    { readonly client: string; readonly owner: ReturnType<typeof makeRecovery>; readonly retained: RetentionLease }
  >();
  const retireRepairs = (client?: string) => {
    for (const [key, record] of HashMap.toEntries(repairs))
      if (client === undefined || record.client === client) {
        record.owner.dispose();
        record.retained.release();
        repairs = HashMap.remove(repairs, key);
      }
  };
  const disposeDocument = (dispose = disposeRegistry) => {
    if (!closed) {
      closed = true;
      invocation.close(() => {});
      delivery.disconnect();
      retireRepairs();
    }
    if (registryDisposed) return;
    registryDisposed = true;
    dispose();
  };
  return {
    invoke: invocation.invoke,
    invokePromise: invocation.invokePromise,
    registerAuth: invocation.registerAuth,
    emitAuth: invocation.emitAuth,
    pending: invocation.pending,
    delivery,
    recovery: ({ client, family }: { readonly client: string; readonly family: string }) => {
      if (closed || retirementExhausted || HashSet.has(retired, client)) return Result.fail(failure("RepairCapacity"));
      const key = `${client.length}:${client}${family.length}:${family}`;
      const old = HashMap.get(repairs, key);
      if (O.isSome(old)) return Result.succeed(old.value.owner);
      if (closed || HashMap.size(repairs) >= 16) return Result.fail(failure("RepairCapacity"));
      const retained = resources.account.reserve(256 + key.length * 2);
      if (retained === undefined) return Result.fail(failure("RepairCapacity"));
      const owner = makeRecovery({ resources });
      repairs = HashMap.set(repairs, key, { client, owner, retained });
      return Result.succeed(owner);
    },
    retireClient: ({ id, tokenClient }: { readonly id: number; readonly tokenClient: string }) => {
      if (HashSet.size(retired) < 64) retired = HashSet.add(retired, tokenClient);
      else retirementExhausted = true;
      invocation.retireClient(id);
      delivery.retireClient(tokenClient);
      retireRepairs(tokenClient);
      if (retirementExhausted) disposeDocument();
    },
    close: disposeDocument,
  };
};
