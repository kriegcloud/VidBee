import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { FeedCancellationToken } from "./FeedCancellation.service.js";
import type { HostFailure } from "./Subscriptions.errors.js";
export interface CheckToken {
  readonly aborted: Effect.Effect<boolean, HostFailure>;
  readonly cancel: Effect.Effect<void, HostFailure>;
  readonly cancellation: FeedCancellationToken;
}
export class CheckCancellation extends Context.Service<
  CheckCancellation,
  {
    readonly make: Effect.Effect<CheckToken>;
  }
>()("@vidbee/subscriptions-core/CheckCancellation.service/CheckCancellation") {}
