import * as Context from "effect/Context";
import type * as M from "./Subscription.model.js";
import type { StoreEffect } from "./SubscriptionStore.service.js";
export interface LeaderCasRequest {
  readonly expectedLeaseId: string | null;
  readonly next: Pick<M.LeaderState, "kind" | "pid" | "startedAt" | "heartbeatAt" | "lockExpiresAt" | "leaseId">;
  readonly now: number;
}
export interface SubscriptionMetaShape {
  readonly casLeader: (request: LeaderCasRequest) => StoreEffect<boolean>;
  readonly readLeader: StoreEffect<M.LeaderState>;
  readonly readPreferred: StoreEffect<M.LeaderKind | null>;
  readonly writePreferred: (kind: M.LeaderKind | null) => StoreEffect<void>;
}
export class SubscriptionMeta extends Context.Service<SubscriptionMeta, SubscriptionMetaShape>()(
  "@vidbee/subscriptions-core/SubscriptionMeta.service/SubscriptionMeta"
) {}
