import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { playbackHasAdvanced, waitUntilPlaybackAdvances } from "../src/player.js";

const advancingSignal = new AbortController().signal;
const cancelledController = new AbortController();
cancelledController.abort();
const deadlineSignal = new AbortController().signal;

it.effect("polls stopped clocks and resolves only an advancing unpaused sample", () =>
  Effect.gen(function* () {
    let now = 0;
    const trace: Array<string> = [];
    const states = [
      null,
      { currentTime: 0.08, duration: 9, paused: true, ended: false },
      { currentTime: 0.08, duration: 9, paused: false, ended: false },
    ];
    let index = 0;
    const result = yield* waitUntilPlaybackAdvances(
      () =>
        Effect.sync(() => {
          trace.push("read");
          return states[index++] ?? null;
        }),
      {
        signal: advancingSignal,
        timeoutMs: 1000,
        now: Effect.sync(() => now),
        sleep: (ms) =>
          Effect.sync(() => {
            trace.push(`sleep:${ms}`);
            now += ms;
          }),
      }
    );
    expect(result.currentTime).toBe(0.08);
    expect(trace).toEqual(["read", "sleep:250", "read", "sleep:250", "read"]);
  })
);
it.effect("checks cancellation before reading and preserves exact deadline failure", () =>
  Effect.gen(function* () {
    let reads = 0;
    const aborted = yield* Effect.exit(
      waitUntilPlaybackAdvances(
        () =>
          Effect.sync(() => {
            reads++;
            return null;
          }),
        {
          signal: cancelledController.signal,
          timeoutMs: 1000,
          now: Effect.succeed(0),
          sleep: () => Effect.void,
        }
      )
    );
    expect(Exit.isFailure(aborted)).toBe(true);
    expect(reads).toBe(0);
    let now = 0;
    const failure = yield* waitUntilPlaybackAdvances(() => Effect.succeed(null), {
      signal: deadlineSignal,
      timeoutMs: 500,
      now: Effect.sync(() => now),
      sleep: (ms) =>
        Effect.sync(() => {
          now += ms;
        }),
    }).pipe(Effect.flip);
    expect(failure.legacyMessage).toBe("Timed out waiting for in-browser playback to start");
    expect(now).toBe(500);
  })
);
it("keeps the moving-clock threshold", () => {
  expect(playbackHasAdvanced(null)).toBe(false);
  expect(playbackHasAdvanced({ currentTime: 0.05, duration: 2, paused: false, ended: false })).toBe(false);
  expect(playbackHasAdvanced({ currentTime: 0.051, duration: 2, paused: false, ended: false })).toBe(true);
});
