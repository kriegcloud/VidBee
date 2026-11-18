import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
export class LegacyTiming extends Context.Service<
  LegacyTiming,
  { readonly turn: (point: string) => Effect.Effect<void> }
>()("@vidbee/task-queue/LegacyTiming.service/LegacyTiming") {
  static readonly layer = Layer.succeed(LegacyTiming, { turn: Effect.fn("LegacyTiming.turn")(() => Effect.void) });
}
