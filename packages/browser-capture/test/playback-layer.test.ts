import { expect, layer } from "@effect/vitest";
import { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import { HostFailure } from "../src/Capture.errors.js";
import { CaptureTimers } from "../src/CaptureTimers.service.js";
import { PlaybackLive } from "../src/Playback.layer.js";
import { Playback } from "../src/Playback.service.js";
import { Playwright } from "../src/Playwright.service.js";
import { Recorder } from "../src/Recorder.service.js";
import type { MediaClock } from "../src/Playback.model.js";
import type { BrowserPage, BrowserSession } from "../src/Playwright.service.js";

const harness = () => {
  let now = 0;
  const trace: Array<unknown> = [];
  const controls: {
    navigationWait: Effect.Effect<void> | undefined;
    navigationError: boolean;
    closeError: boolean;
    scanError: boolean;
    read: number;
    ended: boolean;
  } = { navigationWait: undefined, navigationError: false, closeError: false, scanError: false, read: 0, ended: false };
  const prepareFailure = HostFailure.make({ operation: "goto", legacyMessage: "navigation sentinel" });
  const cleanupFailure = HostFailure.make({ operation: "close", legacyMessage: "cleanup sentinel" });
  const page: BrowserPage = {
    url: () => "about:blank",
    isClosed: () => false,
    goto: Effect.fn("fixture.goto")((url) =>
      Effect.suspend(() => {
        trace.push(["goto", url]);
        return controls.navigationWait ?? (controls.navigationError ? Effect.fail(prepareFailure) : Effect.void);
      })
    ),
    bringToFront: Effect.void,
    onResponse: Effect.fn("fixture.onResponse")(() => Effect.void),
    offResponse: Effect.fn("fixture.offResponse")(() => Effect.void),
    waitForResponse: Effect.fn("fixture.waitForResponse")(() => Effect.die("unexpected response wait")),
    locator: () => {
      throw new Error("unexpected locator");
    },
    getByText: () => {
      throw new Error("unexpected locator");
    },
    presentedMessages: Effect.fn("fixture.presentedMessages")(() => Effect.die("unexpected chat wait")),
    waitForVideo: Effect.sync(() => {
      trace.push("video");
    }),
    hideChrome: Effect.sync(() => {
      trace.push("style");
    }),
    click: Effect.fn("fixture.click")(() => Effect.void),
    readMediaState: Effect.fn("fixture.readMediaState")((expected) =>
      Effect.sync((): MediaClock => {
        trace.push(["read", expected]);
        controls.read++;
        return { currentTime: controls.ended ? 8 : 1, duration: 8, paused: false, ended: controls.ended };
      })
    ),
    pinQuality: Effect.sync(() => {
      trace.push("quality");
      return { fps: 30, width: 960, height: 720, method: "fixture" };
    }),
    stepToMedia: Effect.fn("fixture.stepToMedia")(() => Effect.succeed(null)),
    swiperPoint: Effect.fn("fixture.swiperPoint")(() => Effect.succeed(null)),
    attachmentPoint: Effect.fn("fixture.attachmentPoint")(() => Effect.succeed(null)),
    clickMedia: Effect.sync(() => {
      trace.push("clickMedia");
    }),
    seekStart: Effect.fn("fixture.seekStart")(() =>
      Effect.sync(() => {
        trace.push("seek");
      })
    ),
    placeVideo: Effect.fn("fixture.placeVideo")(() =>
      Effect.sync(() => {
        trace.push("place");
        return { x: 3.4, y: 5.6, width: 959, height: 719 };
      })
    ),
    removeMarker: Effect.sync(() => {
      trace.push("removeMarker");
    }),
    viewport: Effect.succeed({ width: 1000, height: 1000 }),
    profileScroll: Effect.fn("fixture.profileScroll")(() => Effect.succeed(false)),
  };
  const session: BrowserSession = {
    pages: () => [page],
    newPage: Effect.succeed(page),
    cookies: Effect.fn("fixture.cookies")(() => Effect.succeed([])),
    onClosed: Effect.fn("fixture.onClosed")(() => Effect.void),
    close: Effect.suspend(() => {
      trace.push("close");
      return controls.closeError ? Effect.fail(cleanupFailure) : Effect.void;
    }),
  };
  const deps = Layer.mergeAll(
    LegacyTiming.layer,
    Layer.succeed(Playwright, {
      launch: Effect.fn("fixture.launch")(() => Effect.succeed({ session, page })),
      launchProfile: Effect.fn("fixture.launchProfile")(() => Effect.succeed(session)),
    }),
    Layer.succeed(CaptureTimers, {
      now: Effect.sync(() => now),
      sleep: Effect.fn("fixture.sleep")((ms) =>
        Effect.sync(() => {
          trace.push(["sleep", ms]);
          now += ms;
        })
      ),
      defer: Effect.fn("fixture.defer")(() => Effect.void),
      after: Effect.fn("fixture.after")(() => Effect.succeed(Effect.void)),
    }),
    Layer.succeed(Recorder, {
      start: Effect.fn("fixture.start")(() => Effect.die("unexpected recorder start")),
      scan: Effect.fn("fixture.scan")(() =>
        Effect.suspend(() => {
          trace.push("scan");
          return controls.scanError ? Effect.fail(prepareFailure) : Effect.succeed({ x: 10.1, y: 20.1 });
        })
      ),
    })
  );
  return { layer: PlaybackLive.pipe(Layer.provide(deps)), controls, trace, prepareFailure, cleanupFailure };
};
const input = () => ({
  url: "https://fixture.invalid/video",
  executablePath: "/fixture/chrome",
  display: ":99",
  width: 1000,
  height: 1000,
  cookies: [],
  ffmpegPath: "/fixture/ffmpeg",
  signal: new AbortController().signal,
});

{
  const h = harness();
  layer(h.layer)((it) => {
    it.effect("preserves prepare order, quality settling, placement and ended progress", () =>
      Effect.gen(function* () {
        const playback = yield* Playback;
        const session = yield* playback.start(input(), {
          log: Effect.fn("fixture.log")((message) =>
            Effect.sync(() => {
              h.trace.push(["log", message]);
            })
          ),
        });
        expect(h.trace).toEqual([["goto", "https://fixture.invalid/video"], "clickMedia", "video", "style"]);
        const playing = yield* session.waitUntilPlaying;
        expect(playing).toEqual({
          fps: 30,
          method: "fixture",
          width: 958,
          height: 718,
          duration: 8,
          originX: 14,
          originY: 26,
        });
        const tail = h.trace.slice(-6);
        expect(tail).toEqual([
          "seek",
          "place",
          ["sleep", 200],
          "scan",
          "removeMarker",
          ["log", "Grab origin 14,26 video 958x718"],
        ]);
        h.controls.ended = true;
        const progress: Array<unknown> = [];
        yield* session.waitUntilEnded((state) =>
          Effect.sync(() => {
            progress.push(state);
          })
        );
        expect(progress).toEqual([{ currentTime: 8, duration: 8 }]);
        yield* session.close;
        expect(h.trace.at(-1)).toBe("close");
      })
    );
  });
}
{
  const h = harness();
  h.controls.navigationError = true;
  layer(h.layer)((it) => {
    it.effect("keeps preparation failure and lets a failed close replace it", () =>
      Effect.gen(function* () {
        const playback = yield* Playback;
        const first = yield* playback
          .start(input(), { log: Effect.fn("fixture.log")(() => Effect.void) })
          .pipe(Effect.flip);
        expect(first).toBe(h.prepareFailure);
        expect(h.trace.at(-1)).toBe("close");
        h.controls.closeError = true;
        const second = yield* playback
          .start(input(), { log: Effect.fn("fixture.log")(() => Effect.void) })
          .pipe(Effect.flip);
        expect(second).toBe(h.cleanupFailure);
      })
    );
  });
}
{
  const h = harness();
  h.controls.scanError = true;
  layer(h.layer)((it) => {
    it.effect("logs scan failure, falls back to zero viewport, and still removes marker", () =>
      Effect.gen(function* () {
        const playback = yield* Playback;
        const messages: Array<string> = [];
        const session = yield* playback.start(input(), {
          log: Effect.fn("fixture.log")((message) =>
            Effect.sync(() => {
              messages.push(message);
            })
          ),
        });
        const playing = yield* session.waitUntilPlaying;
        expect(playing.originX).toBe(3);
        expect(playing.originY).toBe(6);
        expect(messages[0]).toBe("Grab origin scan failed: navigation sentinel");
        expect(h.trace).toContain("removeMarker");
      })
    );
  });
}

{
  const h = harness();
  layer(h.layer)((it) => {
    it.effect("closes the launched session when preparation is interrupted", () =>
      Effect.gen(function* () {
        const gate = yield* Deferred.make<void>();
        h.controls.navigationWait = Deferred.await(gate);
        const playback = yield* Playback;
        const fiber = yield* Effect.forkChild(
          playback.start(input(), { log: Effect.fn("fixture.log")(() => Effect.void) })
        );
        yield* Effect.yieldNow;
        expect(h.trace).toEqual([["goto", "https://fixture.invalid/video"]]);
        yield* Fiber.interrupt(fiber);
        expect(h.trace).toEqual([["goto", "https://fixture.invalid/video"], "close"]);
      })
    );
  });
}
