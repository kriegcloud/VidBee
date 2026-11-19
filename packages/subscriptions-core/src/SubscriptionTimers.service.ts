import * as Context from "effect/Context";
import type { DbRowDecodeError } from "@vidbee/db";
import type * as Effect from "effect/Effect";
import type { SqlError } from "effect/sql/SqlError";
import type { HostFailure, SubscriptionsError } from "./Subscriptions.errors.js";
export type SubscriptionFailure = SubscriptionsError | DbRowDecodeError | SqlError;
export type Operation<A> = Effect.Effect<A, SubscriptionFailure>;
export type TimerCancel = Effect.Effect<void, HostFailure>;
export interface ScheduledCommand {
  readonly run: Operation<void>;
}
export class SubscriptionTimers extends Context.Service<
  SubscriptionTimers,
  {
    readonly now: Effect.Effect<number, HostFailure>;
    readonly after: (ms: number, command: ScheduledCommand) => Effect.Effect<TimerCancel, HostFailure>;
    readonly every: (ms: number, command: ScheduledCommand) => Effect.Effect<TimerCancel, HostFailure>;
  }
>()("@vidbee/subscriptions-core/SubscriptionTimers.service/SubscriptionTimers") {}
