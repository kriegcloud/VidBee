import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { HostFailure } from "./Downloader.errors.js";
import type { ProcessStart } from "./DownloadProcess.service.js";
import type { ProcessSpec } from "./Process.model.js";
import type { WrapperObservation } from "./YtDlpWrapper.model.js";

export interface WrapperSink {
  readonly abort: Effect.Effect<void>;
  readonly emit: (observation: WrapperObservation) => Effect.Effect<void>;
}
/** The injected legacy seam observes wrapper events directly, without a second conversion. */
export class YtDlpProcess extends Context.Service<
  YtDlpProcess,
  {
    readonly start: (spec: ProcessSpec, sink: WrapperSink) => Effect.Effect<ProcessStart, HostFailure>;
  }
>()("@vidbee/downloader-core/YtDlpProcess.service/YtDlpProcess") {}
