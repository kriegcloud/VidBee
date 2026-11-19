import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { AcquireResult } from "./Leader.model.js";
import type { LeaderState } from "./Subscription.model.js";
import type { HostFailure } from "./Subscriptions.errors.js";
import type { Operation } from "./SubscriptionTimers.service.js";
export class LeaderStateSink extends Context.Service<
  LeaderStateSink,
  {
    readonly emit: (state: LeaderState, isLeader: boolean) => Effect.Effect<void, HostFailure>;
  }
>()("@vidbee/subscriptions-core/SubscriptionLeader.service/LeaderStateSink") {}
export class SubscriptionLeader extends Context.Service<
  SubscriptionLeader,
  {
    readonly isLeader: Effect.Effect<boolean>;
    readonly tryAcquire: Operation<AcquireResult>;
    readonly heartbeat: Operation<boolean>;
    readonly release: Operation<void>;
    readonly observe: Operation<LeaderState>;
  }
>()("@vidbee/subscriptions-core/SubscriptionLeader.service/SubscriptionLeader") {}
