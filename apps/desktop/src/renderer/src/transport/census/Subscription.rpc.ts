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
 * Binds a feed read to the active subscription observation token.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { SubscriptionDependency } from "./Subscription.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(SubscriptionDependency)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link SubscriptionDependency}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type SubscriptionDependency = typeof SubscriptionDependency.Type;
/**
 * Binds queue admission to both feed and download observation tokens.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { QueueDependencies } from "./Subscription.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(QueueDependencies)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link QueueDependencies}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type QueueDependencies = typeof QueueDependencies.Type;
/**
 * Declares the frozen RPC surface for feed subscription reads, edits and queue admission; share this group between handler layers and clients to keep payload, completion and stream contracts aligned.
 *
 * **Example** (Use SubscriptionRpcs with its owner)
 *
 * ```ts
 * import { SubscriptionRpcs } from "./Subscription.rpc.js"
 * import * as RpcClient from "effect/rpc/RpcClient"
 * export const make = RpcClient.make(SubscriptionRpcs);
 * // Provide the document-owned RpcClient.Protocol and run make in the client scope.
 * // The resulting typed client exposes only this capability group's declared commands.
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
