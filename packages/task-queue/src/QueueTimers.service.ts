import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
export type Cancel = Effect.Effect<void>;
export class QueueTimers extends Context.Service<
  QueueTimers,
  {
    readonly now: Effect.Effect<number>;
    readonly after: (
      ms: number,
      effect: Effect.Effect<void>,
      options: { readonly keepAlive: boolean }
    ) => Effect.Effect<Cancel>;
    readonly sleep: (ms: number) => Effect.Effect<void>;
  }
>()("@vidbee/task-queue/QueueTimers.service/QueueTimers") {}
