import type * as Cause from 'effect/Cause'
import type * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import type * as ManagedRuntime from 'effect/ManagedRuntime'

/** Settle directly from the fiber observer, preserving legacy microtask ordering. */
export const runLegacyPromise = <R, ER, A, E>(
  runtime: ManagedRuntime.ManagedRuntime<R, ER>,
  effect: Effect.Effect<A, E, R>,
  mapError: (cause: Cause.Cause<E | ER>) => unknown,
): Promise<A> => new Promise((resolve, reject) => {
  const fiber = runtime.runFork(effect)
  fiber.addObserver(exit => {
    if (Exit.isSuccess(exit)) resolve(exit.value)
    else reject(mapError(exit.cause))
  })
})

/** Unwrap synchronous failures at the host callback boundary. */
export const runLegacySync = <R, ER, A, E>(
  runtime: ManagedRuntime.ManagedRuntime<R, ER>,
  effect: Effect.Effect<A, E, R>,
  mapError: (cause: Cause.Cause<E | ER>) => unknown,
): A => {
  const exit = runtime.runSyncExit(effect)
  if (Exit.isFailure(exit)) throw mapError(exit.cause)
  return exit.value
}
