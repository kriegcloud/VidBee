import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { HostFailure } from "./Subscriptions.errors.js";
import type { ChangedEvent } from "./Subscriptions.model.js";
export type Unsubscribe = Effect.Effect<boolean>;
export interface SubscriptionChangedSink {
  readonly emit: (event: ChangedEvent) => Effect.Effect<void, HostFailure>;
}
export class SubscriptionEvents extends Context.Service<
  SubscriptionEvents,
  {
    readonly emit: (event: ChangedEvent) => Effect.Effect<void, HostFailure>;
    readonly subscribe: (sink: SubscriptionChangedSink) => Effect.Effect<Unsubscribe>;
  }
>()("@vidbee/subscriptions-core/SubscriptionEvents.service/SubscriptionEvents") {}
