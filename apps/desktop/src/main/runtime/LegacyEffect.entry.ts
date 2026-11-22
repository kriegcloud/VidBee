import * as Cause from "effect/Cause";
import * as Exit from "effect/Exit";
import * as Scheduler from "effect/Scheduler";
import { unwrapOriginal } from "../lib/OriginalFailure.errors.js";
import type * as Effect from "effect/Effect";
import type * as ManagedRuntime from "effect/ManagedRuntime";

/** Observes the settled fiber directly so native Promise adapters keep synchronous prefixes and do not gain the extra runPromise settlement turn.
 * **Example** (Observe an application Effect)
 * ```ts
 * import { legacyPromise } from './LegacyEffect.entry.js'
 * import * as ManagedRuntime from 'effect/ManagedRuntime'
 * import * as Layer from 'effect/Layer'
 * import * as Effect from 'effect/Effect'
 * const owner = ManagedRuntime.make(Layer.empty)
 * export const result = legacyPromise({runtime:owner, effect:Effect.succeed(42)}) // resolves to 42
 * // Dispose the application owner after accepted native work has settled.
 * ```
 * @category interop
 * @since 0.0.0
 */
export const legacyPromise = <R, A, E>({
  runtime,
  effect,
}: {
  readonly runtime: ManagedRuntime.ManagedRuntime<R, never>;
  readonly effect: Effect.Effect<A, E, R>;
}): Promise<A> => {
  const result = Promise.withResolvers<A>();
  const fiber = runtime.runFork(effect, { scheduler: new Scheduler.MixedScheduler("sync") });
  fiber.addObserver((exit) => {
    if (Exit.isSuccess(exit)) result.resolve(exit.value);
    else result.reject(exit.cause.pipe(Cause.squash, unwrapOriginal));
  });
  fiber.currentDispatcher.flush();
  return result.promise;
};
