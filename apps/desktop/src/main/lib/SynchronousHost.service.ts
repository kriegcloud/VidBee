import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { DeliveryError } from "../../renderer/src/transport/DocumentDelivery.errors.js";

/**
 * Restricts synchronous host access to the live call phase. Register release callbacks immediately after acquisition; use is revoked before interruption or cleanup begins.
 *
 * @category type-level
 * @since 0.0.0
 */
export interface SynchronousCall {
  readonly cleanup: (release: () => void) => void;
  readonly use: <A>(body: () => A) => A;
}
/**
 * Runs qualified synchronous compatibility work using a warmed runtime; ordinary authority is revoked on suspension and only captured release callbacks remain authorized during teardown.
 *
 * **Example** (Use SynchronousHost with its owner)
 *
 * ```ts
 * import { SynchronousHost } from "./SynchronousHost.service.js"
 * import * as Effect from "effect/Effect"
 * export const read = SynchronousHost.use((host) => Effect.sync(() => host.run((call) => Effect.sync(() => call.use(() => 42)))));
 * // Provide the warmed compatibility host; successful synchronous execution returns 42.
 * ```
 *
 * @category services
 * @since 0.0.0
 */
export class SynchronousHost extends Context.Service<
  SynchronousHost,
  {
    readonly run: <A, E>(make: (call: SynchronousCall) => Effect.Effect<A, E>) => A;
    readonly drain: Effect.Effect<void, DeliveryError>;
  }
>()("vidbee/main/lib/SynchronousHost.service/SynchronousHost") {}
