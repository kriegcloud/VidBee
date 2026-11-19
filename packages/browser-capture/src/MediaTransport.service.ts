import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { TransferSink } from "./BrowserProfiles.service.js";
import type { CaptureError } from "./Capture.errors.js";
export interface MediaResponse {
  readonly contentLength: string | null;
  readonly contentType: string | null;
  readonly copy: (
    path: string,
    signal: AbortSignal,
    sink: TransferSink
  ) => Effect.Effect<{ bytes: number; total: number }, CaptureError>;
  readonly hasBody: boolean;
  readonly ok: boolean;
  readonly release: Effect.Effect<void>;
  readonly status: number;
}
export class MediaTransport extends Context.Service<
  MediaTransport,
  {
    readonly open: (url: string, referer: string, signal: AbortSignal) => Effect.Effect<MediaResponse, CaptureError>;
  }
>()("@vidbee/browser-capture/MediaTransport.service/MediaTransport") {}
