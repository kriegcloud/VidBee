import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
export class QueueRandom extends Context.Service<
  QueueRandom,
  { readonly next: Effect.Effect<number>; readonly uuid: Effect.Effect<string> }
>()("@vidbee/task-queue/QueueRandom.service/QueueRandom") {}
