import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Exit from "effect/Exit";
import type { DeliveryError } from "../../renderer/src/transport/DocumentDelivery.errors.js";

export interface OperationHandle<A, E> {
  readonly complete: (exit: Exit.Exit<A, E>) => Effect.Effect<void, DeliveryError>;
  readonly grow: (bytes: number) => Effect.Effect<void, DeliveryError>;
  readonly logical: Effect.Effect<Exit.Exit<A, E>>;
  readonly originAccount: string;
  readonly registerCleanup: (cleanup: Effect.Effect<void>) => Effect.Effect<void, DeliveryError>;
  readonly released: Effect.Effect<void, DeliveryError>;
}
export interface OperationOwner {
  readonly accept: <A, E>(options: {
    readonly originAccount: string;
    readonly reserveBytes: number;
    readonly run: (handle: OperationHandle<A, E>) => Effect.Effect<void>;
  }) => Effect.Effect<OperationHandle<A, E>, DeliveryError>;
  readonly closeAdmission: Effect.Effect<void>;
  readonly drain: Effect.Effect<void, DeliveryError>;
}
export class ApplicationOperations extends Context.Service<ApplicationOperations, OperationOwner>()(
  "vidbee/main/runtime/ApplicationOperations.service/ApplicationOperations"
) {}
