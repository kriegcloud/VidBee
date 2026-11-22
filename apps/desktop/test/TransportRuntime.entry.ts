import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";

/**
 * Acquires a real empty managed runtime for entrypoint lifecycle tests and disposes it at scope exit; execute test fibers before leaving the acquisition scope.
 *
 * **Example** (Use runtime with its owner)
 *
 * ```ts
 * import { runtime } from "./TransportRuntime.entry.js"
 * import * as Effect from "effect/Effect"
 * import * as Fiber from "effect/Fiber"
 * export const observed = Effect.scoped(Effect.gen(function* () {
 *   const owned = yield* runtime;
 *   const fiber = owned.runFork(Effect.succeed(42));
 *   return yield* Fiber.join(fiber);
 * }));
 * Effect.runSync(observed) // => 42
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const runtime = Effect.acquireRelease(
  Effect.sync(() => ManagedRuntime.make(Layer.empty)),
  (owned) => owned.disposeEffect
);
