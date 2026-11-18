import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

/** Named Promise boundaries and scheduled work supplied by the host. */
export class DownloadTiming extends Context.Service<
  DownloadTiming,
  {
    readonly turn: (point: string) => Effect.Effect<void>;
    readonly sleep: (milliseconds: number) => Effect.Effect<void>;
  }
>()("@vidbee/downloader-core/DownloadTiming.service/DownloadTiming") {}

export const DownloadTimingLive = Layer.succeed(DownloadTiming, {
  turn: Effect.fn("DownloadTiming.turn")(() => Effect.void),
  sleep: Effect.fn("DownloadTiming.sleep")((milliseconds) => Effect.sleep(milliseconds)),
});
