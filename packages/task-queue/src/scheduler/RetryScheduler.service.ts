import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
export class RetryScheduler extends Context.Service<
  RetryScheduler,
  {
    readonly enqueue: (id: string, at: number) => Effect.Effect<void>;
    readonly remove: (id: string) => Effect.Effect<boolean>;
    readonly tick: Effect.Effect<void>;
    readonly stop: Effect.Effect<void>;
    readonly size: Effect.Effect<number>;
  }
>()("@vidbee/task-queue/scheduler/RetryScheduler.service/RetryScheduler") {}
