import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { FeedCancelled, HostFailure } from "./Subscriptions.errors.js";

export interface CancellationSnapshot {
  readonly aborted: boolean;
  readonly reason: unknown;
}
export interface AbortNoticeSink {
  readonly emit: (reason: unknown) => Effect.Effect<void, HostFailure>;
}
export interface FeedCancellationToken {
  readonly check: Effect.Effect<void, FeedCancelled | HostFailure>;
  readonly snapshot: Effect.Effect<CancellationSnapshot, HostFailure>;
  readonly subscribe: (sink: AbortNoticeSink) => Effect.Effect<Effect.Effect<boolean>, HostFailure>;
}
export interface OwnedFeedCancellation {
  readonly abort: (reason: unknown) => Effect.Effect<void, HostFailure>;
  readonly dispose: Effect.Effect<void, HostFailure>;
  readonly token: FeedCancellationToken;
}
export class FeedCancellation extends Context.Service<
  FeedCancellation,
  {
    readonly make: Effect.Effect<OwnedFeedCancellation>;
  }
>()("@vidbee/subscriptions-core/FeedCancellation.service/FeedCancellation") {}
