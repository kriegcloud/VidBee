import * as Context from "effect/Context";
import type { StoredEnqueueItemContext } from "./Subscriptions.model.js";
import type { Operation } from "./SubscriptionTimers.service.js";
export class SubscriptionQueue extends Context.Service<
  SubscriptionQueue,
  {
    readonly enqueue: (context: StoredEnqueueItemContext) => Operation<string | null>;
    readonly historyContains: (url: unknown) => Operation<boolean>;
    readonly taskLookupAvailable: boolean;
    readonly taskExists: (id: string) => Operation<boolean>;
  }
>()("@vidbee/subscriptions-core/SubscriptionQueue.service/SubscriptionQueue") {}
