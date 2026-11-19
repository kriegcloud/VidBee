import * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";
import { PlaybackFailure } from "./Capture.errors.js";
import type { CaptureError } from "./Capture.errors.js";
import type { MediaClock } from "./Playback.model.js";

export type { MediaClock } from "./Playback.model.js";
export type { PlaybackSession } from "./Playback.service.js";

/** Playback has started only after the media clock moves while the element is playing. */
export const playbackHasAdvanced = (state: MediaClock | null): boolean =>
  Boolean(Boolean(state) && state !== null && state.currentTime > 0.05 && !state.paused);

export const playbackFailure = (legacyMessage: string): PlaybackFailure =>
  PlaybackFailure.make({ operation: "playback", legacyMessage });
export const checkPlaybackAbort = (signal: AbortSignal): Effect.Effect<void, PlaybackFailure> =>
  signal.aborted ? Effect.fail(playbackFailure("Capture cancelled")) : Effect.void;

/** Resolve with the first moving clock sample, preserving one read and sleep per polling turn. */
export const waitUntilPlaybackAdvances = Effect.fn("waitUntilPlaybackAdvances")(function* (
  read: () => Effect.Effect<MediaClock | null, CaptureError>,
  input: {
    readonly timeoutMs: number;
    readonly signal: AbortSignal;
    readonly sleep: (ms: number) => Effect.Effect<void, CaptureError>;
    readonly now: Effect.Effect<number>;
  }
) {
  const deadline = (yield* input.now) + input.timeoutMs;
  while ((yield* input.now) < deadline) {
    yield* checkPlaybackAbort(input.signal);
    const state = yield* read();
    if (Predicate.isNotNull(state) && playbackHasAdvanced(state)) return state;
    yield* input.sleep(250);
  }
  return yield* playbackFailure("Timed out waiting for in-browser playback to start");
});
