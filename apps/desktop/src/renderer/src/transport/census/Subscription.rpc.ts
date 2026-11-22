import { $DesktopId } from "@vidbee/identity/packages";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";
import * as S from "effect/Schema";
import { DeliveryError } from "../DocumentDelivery.errors.js";
import { Completion, Subscription, Token } from "../DocumentDelivery.model.js";
import { RpcUndefined } from "../RpcField.model.js";
import { RpcObserved } from "../RpcObservation.model.js";
import { SubscriptionOperationError } from "./Subscription.errors.js";
import * as M from "./Subscription.model.js";

const $TransportId = $DesktopId.create("renderer/src/transport/census/Subscription.rpc");

/**
 * Validates Subscription Dependency at the desktop capability boundary before dispatch.
 *
 * **Example** (Use SubscriptionDependency at its owning boundary)
 *
 * ```ts
 * import { SubscriptionDependency } from "./Subscription.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(SubscriptionDependency);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const SubscriptionDependency = S.Struct({ subscriptions: Token }).pipe(
  $TransportId.annoteSchema("SubscriptionDependency", {
    description: "Subscription Dependency boundary in the desktop transport contract.",
  })
);
/**
 * Describes Subscription Dependency ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type SubscriptionDependency = typeof SubscriptionDependency.Type;
/**
 * Validates Queue Dependencies at the desktop capability boundary before dispatch.
 *
 * **Example** (Use QueueDependencies at its owning boundary)
 *
 * ```ts
 * import { QueueDependencies } from "./Subscription.rpc.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(QueueDependencies);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const QueueDependencies = S.Struct({ subscriptions: Token, downloads: Token }).pipe(
  $TransportId.annoteSchema("QueueDependencies", {
    description: "Queue Dependencies boundary in the desktop transport contract.",
  })
);
/**
 * Describes Queue Dependencies ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type QueueDependencies = typeof QueueDependencies.Type;
/**
 * Validates Subscription Rpcs at the desktop capability boundary before dispatch.
 *
 * **Example** (Use SubscriptionRpcs at its owning boundary)
 *
 * ```ts
 * import { SubscriptionRpcs } from "./Subscription.rpc.js"
 * import * as RpcClient from "effect/rpc/RpcClient"
 * const client = RpcClient.make(SubscriptionRpcs);
 * void client;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const SubscriptionRpcs = RpcGroup.make(
  Rpc.make("Subscriptions.List", {
    payload: { token: Token },
    success: Completion({ success: RpcObserved(M.DesktopSubscriptionList), error: SubscriptionOperationError }),
    error: DeliveryError,
  }),
  Rpc.make("Subscriptions.Resolve", {
    payload: M.ResolveSubscription,
    success: Completion({ success: RpcObserved(M.ResolvedFeed), error: SubscriptionOperationError }),
    error: DeliveryError,
  }),
  Rpc.make("Subscriptions.Create", {
    payload: { input: M.CreateSubscription, delivery: QueueDependencies },
    success: Completion({ success: RpcObserved(M.DesktopSubscription), error: SubscriptionOperationError }),
    error: DeliveryError,
  }),
  Rpc.make("Subscriptions.Update", {
    payload: { ...M.UpdateSubscriptionRequest.fields, delivery: SubscriptionDependency },
    success: Completion({
      success: S.Union([RpcObserved(M.DesktopSubscriptionMutation), RpcUndefined]),
      error: SubscriptionOperationError,
    }),
    error: DeliveryError,
  }),
  Rpc.make("Subscriptions.Remove", {
    payload: { ...M.SubscriptionId.fields, delivery: QueueDependencies },
    success: Completion({ success: S.Boolean, error: SubscriptionOperationError }),
    error: DeliveryError,
  }),
  Rpc.make("Subscriptions.Refresh", {
    payload: { ...M.RefreshSubscription.fields, delivery: QueueDependencies },
    success: Completion({ success: S.Void, error: SubscriptionOperationError }),
    error: DeliveryError,
  }),
  Rpc.make("Subscriptions.QueueItem", {
    payload: { ...M.QueueSubscriptionItem.fields, delivery: QueueDependencies },
    success: Completion({ success: S.Boolean, error: SubscriptionOperationError }),
    error: DeliveryError,
  }),
  Rpc.make("Subscriptions.Changes", {
    success: M.DesktopSubscriptionList.pipe(RpcObserved, Subscription),
    error: S.Union([SubscriptionOperationError, DeliveryError]),
    stream: true,
  })
);
