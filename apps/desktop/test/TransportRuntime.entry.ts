import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";

/**
 * Real runtime fixture for assertions about the entrypoint's execution/teardown semantics.
 *
 * **Example** (Use runtime at its owning boundary)
 *
 * ```ts
 * import { runtime } from "./TransportRuntime.entry.js"
 * import * as Effect from "effect/Effect"
 * const isolated = Effect.scoped(runtime);
 * void isolated;
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const runtime = Effect.acquireRelease(
  Effect.sync(() => ManagedRuntime.make(Layer.empty)),
  (owned) => owned.disposeEffect
);
