import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { CaptureError } from "./Capture.errors.js";
import type { MediaClock, Playing } from "./Playback.model.js";
import type { CaptureBrowserInput } from "./Playwright.service.js";
export interface PlaybackInput extends CaptureBrowserInput {
  readonly ffmpegPath: string;
  readonly signal: AbortSignal;
  readonly url: string;
  readonly videoOrdinal?: number | undefined;
}
export interface PlaybackSink {
  readonly log: (message: string) => Effect.Effect<void, CaptureError>;
}
export interface PlaybackSession {
  readonly close: Effect.Effect<void, CaptureError>;
  readonly mediaId: string | null;
  readonly waitUntilEnded: (
    onProgress: (state: Pick<MediaClock, "currentTime" | "duration">) => Effect.Effect<void, CaptureError>
  ) => Effect.Effect<void, CaptureError>;
  readonly waitUntilPlaying: Effect.Effect<Playing, CaptureError>;
}
export class Playback extends Context.Service<
  Playback,
  {
    readonly start: (input: PlaybackInput, sink: PlaybackSink) => Effect.Effect<PlaybackSession, CaptureError>;
  }
>()("@vidbee/browser-capture/Playback.service/Playback") {}
