import * as Context from "effect/Context";
import type { FeedCancellationToken } from "./FeedCancellation.service.js";
import type { Operation } from "./SubscriptionTimers.service.js";
export interface FeedResponse {
  /** Compatibility transports retain Response.ok independently of a supplied status. */
  readonly ok?: boolean | undefined;
  readonly status: number;
  readonly text: Operation<string>;
  readonly url: string;
}
export class FeedHttp extends Context.Service<
  FeedHttp,
  {
    readonly open: (url: string, cancellation: FeedCancellationToken) => Operation<FeedResponse>;
  }
>()("@vidbee/subscriptions-core/FeedHttp.service/FeedHttp") {}
