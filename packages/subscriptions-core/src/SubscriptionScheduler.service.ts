import * as Context from "effect/Context";
import * as S from "effect/Schema";
import type * as Effect from "effect/Effect";
import type { HostFailure } from "./Subscriptions.errors.js";
import type { Operation } from "./SubscriptionTimers.service.js";
export const SchedulerOptions = S.Struct({
  intervalMs: S.Finite.pipe(S.optional),
  refreshDedupeWindowMs: S.Finite.pipe(S.optional),
});
export type SchedulerOptions = typeof SchedulerOptions.Type;
export class SchedulerWork extends Context.Service<
  SchedulerWork,
  {
    readonly runAll: Operation<void>;
    readonly runOne: (id: string) => Operation<void>;
    readonly isLeader: Effect.Effect<boolean, HostFailure>;
  }
>()("@vidbee/subscriptions-core/SubscriptionScheduler.service/SchedulerWork") {}
export class SubscriptionScheduler extends Context.Service<
  SubscriptionScheduler,
  {
    readonly start: (delay?: number) => Operation<void>;
    readonly stop: Operation<void>;
    readonly triggerNow: (id?: string) => Operation<void>;
  }
>()("@vidbee/subscriptions-core/SubscriptionScheduler.service/SubscriptionScheduler") {}

// The temporary host owner can expose its mutable normalized options. Native
// callers use the immutable layer options unless this capability is supplied.
export class SubscriptionSchedulerSettings extends Context.Service<
  SubscriptionSchedulerSettings,
  {
    readonly intervalMs: Effect.Effect<number, HostFailure>;
    readonly dedupeMs: Effect.Effect<number, HostFailure>;
  }
>()("@vidbee/subscriptions-core/SubscriptionScheduler.service/SubscriptionSchedulerSettings") {}
export class SubscriptionSchedulerHost extends Context.Service<
  SubscriptionSchedulerHost,
  {
    readonly timers: import("./SubscriptionTimers.service.js").SubscriptionTimers["Service"];
    readonly log: import("./SubscriptionLog.service.js").SubscriptionLog["Service"];
  }
>()("@vidbee/subscriptions-core/SubscriptionScheduler.service/SubscriptionSchedulerHost") {}
