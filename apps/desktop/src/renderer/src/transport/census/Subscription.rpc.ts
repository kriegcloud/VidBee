import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";
import * as S from "effect/Schema";
import { DeliveryError } from "../DocumentDelivery.errors.js";
import { Completion, Subscription, Token } from "../DocumentDelivery.model.js";
import { RpcUndefined } from "../RpcField.model.js";
import { RpcObserved } from "../RpcObservation.model.js";
import { SubscriptionOperationError } from "./Subscription.errors.js";
import * as M from "./Subscription.model.js";
export const SubscriptionDependency = S.Struct({ subscriptions: Token });
export const QueueDependencies = S.Struct({ subscriptions: Token, downloads: Token });
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
