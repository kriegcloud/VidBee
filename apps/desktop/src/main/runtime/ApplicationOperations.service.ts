import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Exit from "effect/Exit";
import type { DeliveryError } from "../../renderer/src/transport/DocumentDelivery.errors.js";

/**
 * Separates logical result availability from native release. Growth, cleanup registration and completion are refused after settlement begins; released fails if cleanup ownership could not be discharged.
 *
 * @category type-level
 * @since 0.0.0
 */
export interface OperationHandle<A, E> {
  readonly complete: (exit: Exit.Exit<A, E>) => Effect.Effect<void, DeliveryError>;
  readonly grow: (bytes: number) => Effect.Effect<void, DeliveryError>;
  readonly logical: Effect.Effect<Exit.Exit<A, E>>;
  readonly originAccount: string;
  readonly registerCleanup: (cleanup: Effect.Effect<void>) => Effect.Effect<void, DeliveryError>;
  readonly released: Effect.Effect<void, DeliveryError>;
}
/**
 * Accepts application-scoped native work with settlement ownership established before the handle is returned; closeAdmission rejects new work and drain waits for accepted ownership to settle.
 *
 * @category type-level
 * @since 0.0.0
 */
export interface OperationOwner {
  readonly accept: <A, E>(options: {
    readonly originAccount: string;
    readonly reserveBytes: number;
    readonly run: (handle: OperationHandle<A, E>) => Effect.Effect<void>;
  }) => Effect.Effect<OperationHandle<A, E>, DeliveryError>;
  readonly closeAdmission: Effect.Effect<void>;
  readonly drain: Effect.Effect<void, DeliveryError>;
}
/**
 * Provides application-owned work that survives individual renderer requests; close admission before draining during shutdown, and await released when native ownership must be settled.
 *
 * **Example** (Use ApplicationOperations with its owner)
 *
 * ```ts
 * import { ApplicationOperations } from "./ApplicationOperations.service.js"
 * import * as Effect from "effect/Effect"
 * export const shutdown = ApplicationOperations.use((owner) => owner.closeAdmission.pipe(Effect.andThen(owner.drain)));
 * // Provide the application owner and run shutdown before disposing its scope.
 * ```
 *
 * @category services
 * @since 0.0.0
 */
export class ApplicationOperations extends Context.Service<ApplicationOperations, OperationOwner>()(
  "vidbee/main/runtime/ApplicationOperations.service/ApplicationOperations"
) {}
