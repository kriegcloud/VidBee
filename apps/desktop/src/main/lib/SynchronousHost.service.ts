import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { DeliveryError } from "../../renderer/src/transport/DocumentDelivery.errors.js";

/**
 * Qualified ordinary authority is revoked before interruption; cleanup is captured release only.
 *
 * @category type-level
 * @since 0.0.0
 */
export interface SynchronousCall {
  readonly cleanup: (release: () => void) => void;
  readonly use: <A>(body: () => A) => A;
}
/**
 * Supplies Synchronous Host through the owning application or document scope.
 *
 * **Example** (Use SynchronousHost at its owning boundary)
 *
 * ```ts
 * import { SynchronousHost } from "./SynchronousHost.service.js"
 * import * as Effect from "effect/Effect"
 * const access = SynchronousHost.use(Effect.succeed);
 * void access;
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
