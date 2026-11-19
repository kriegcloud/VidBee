import { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Predicate from "effect/Predicate";
import * as Str from "effect/String";
import { CaptureTimers } from "./CaptureTimers.service.js";
import { capturePageUrl } from "./drm.js";
import { chatVideoAttachments, chatVideoByOrdinal } from "./onlyfans-profile.js";
import { Playback } from "./Playback.service.js";
import { Playwright } from "./Playwright.service.js";
import { checkPlaybackAbort, playbackFailure, waitUntilPlaybackAdvances } from "./player.js";
import { evenSize } from "./quality.js";
import { Recorder } from "./Recorder.service.js";
import type { DecodedQuality } from "./Playback.model.js";
import type { PlaybackInput, PlaybackSink } from "./Playback.service.js";
import type { BrowserPage } from "./Playwright.service.js";
import type { ChatVideoAttachment } from "./Profile.model.js";

const clockLabels = (durationSec: number | null): string[] => {
  if (!Predicate.isTruthy(durationSec) || durationSec === null || durationSec <= 0) return [];
  const total = Math.round(durationSec);
  const minutes = Math.floor(total / 60);
  const seconds = Str.padStart(2, "0")(String(total % 60));
  const short = `${minutes}:${seconds}`;
  const padded = `${Str.padStart(2, "0")(String(minutes))}:${seconds}`;
  return short === padded ? [short] : [short, padded];
};
const attachmentNeedles = (video: ChatVideoAttachment): string[] => {
  const needles = [video.id];
  if (!Predicate.isTruthy(video.previewPath) || video.previewPath === null) return needles;
  needles.push(video.previewPath);
  const file = Str.split(video.previewPath, "/").pop() ?? "";
  for (const part of Str.split(file, /[._]/)) if (part.length >= 16) needles.push(part);
  return needles;
};
const makePlayback = Effect.fn("makePlayback")(function* () {
  const timing = yield* LegacyTiming;
  const browser = yield* Playwright;
  const timers = yield* CaptureTimers;
  const recorder = yield* Recorder;
  const readMediaState = (page: BrowserPage, expected: number) =>
    page
      .readMediaState(expected)
      .pipe(
        Effect.ensuring(timing.turn("readMediaState.adopt")),
        Effect.ensuring(timing.turn("readMediaState.return"))
      );
  const openSwiperMedia = Effect.fn("openSwiperMedia")(function* (page: BrowserPage, id: string) {
    let landed = false;
    for (let step = 0; step < 16; step += 1) {
      const state = yield* page.stepToMedia(id);
      if (state === null) {
        yield* timers.sleep(500);
        continue;
      }
      if (state.active === state.index) {
        landed = true;
        break;
      }
      yield* timers.sleep(1500);
    }
    if (!landed) return false;
    yield* timers.sleep(400);
    const point = yield* page.swiperPoint(id);
    if (point === null) return false;
    yield* page.click(point.x, point.y);
    return true;
  });
  const clickAttachment = Effect.fn("clickAttachment")(function* (page: BrowserPage, video: ChatVideoAttachment) {
    const point = yield* page.attachmentPoint({
      needles: attachmentNeedles(video),
      labels: clockLabels(video.durationSec),
    });
    if (point === null) return false;
    yield* page.click(point.x, point.y);
    return true;
  });
  const assertPlayingDuration = Effect.fn("assertPlayingDuration")(function* (
    page: BrowserPage,
    video: ChatVideoAttachment,
    signal: AbortSignal
  ) {
    if (!Predicate.isTruthy(video.durationSec) || video.durationSec === null) return;
    const deadline = (yield* timers.now) + 15_000;
    let duration = 0;
    while ((yield* timers.now) < deadline) {
      yield* checkPlaybackAbort(signal);
      duration = (yield* readMediaState(page, video.durationSec ?? 0))?.duration ?? 0;
      if (duration > 0) break;
      yield* timers.sleep(200);
    }
    if (duration > 0 && Math.abs(duration - video.durationSec) > 2)
      return yield* playbackFailure(
        `Playing duration ${duration}s does not match media ${video.id} (${video.durationSec}s)`
      );
  });
  const preparePage = Effect.fn("preparePage")(function* (page: BrowserPage, input: PlaybackInput, sink: PlaybackSink) {
    const target = capturePageUrl(input.url, input.videoOrdinal);
    const chatId = (() => {
      try {
        const parts = A.filter(Str.split(new URL(target).pathname, "/"), Boolean);
        const id = parts[3];
        return id !== undefined && /^\d+$/.test(id) ? id : null;
      } catch {
        return null;
      }
    })();
    const ordinal = input.videoOrdinal;
    const onChat = Boolean(chatId) && Str.replace(/\/$/, "")(new URL(target).pathname) === `/my/chats/chat/${chatId}`;
    const selecting = Boolean(ordinal && onChat);
    const anchorId = selecting ? new URL(target).searchParams.get("firstId") : null;
    const presented = selecting && chatId !== null ? yield* page.presentedMessages(chatId, anchorId) : null;
    yield* page.goto(target, { waitUntil: "domcontentloaded", timeout: 45_000 });
    if (!(selecting && Predicate.isTruthy(ordinal) && ordinal !== undefined && presented !== null)) {
      yield* page.clickMedia;
      yield* page.waitForVideo;
      yield* page.hideChrome;
      return { mediaId: null, durationSec: null };
    }
    const payload = yield* presented.wait.pipe(
      Effect.ensuring(timing.turn("presentedMessages.catch")),
      Effect.ensuring(timing.turn("presentedMessages.await"))
    );
    if (!Predicate.isTruthy(payload)) return yield* playbackFailure("Timed out waiting for the chat message list");
    const videos = chatVideoAttachments(payload);
    yield* sink.log(
      `Chat videos: ${A.join(
        A.map(videos, (video, index) => `${index + 1}:${video.id}:${video.durationSec ?? 0}`),
        " "
      )}`
    );
    const video = chatVideoByOrdinal(payload, ordinal);
    if (video === undefined || video === null)
      return yield* playbackFailure(`The chat message list has no video at position ${ordinal}`);
    if (video.state === "locked") return yield* playbackFailure(`Video ${ordinal} (${video.id}) is locked`);
    yield* sink.log(`Recording OnlyFans media ${video.id}`);
    const opened =
      (yield* openSwiperMedia(page, video.id).pipe(Effect.ensuring(timing.turn("openSwiperMedia")))) ||
      (yield* clickAttachment(page, video).pipe(Effect.ensuring(timing.turn("clickAttachment"))));
    yield* sink.log(
      opened
        ? `Opened OnlyFans media ${video.id}`
        : `Could not click OnlyFans media ${video.id}; opening its gallery page`
    );
    if (!opened && chatId !== null)
      yield* page.goto(`https://onlyfans.com/my/chats/chat/${chatId}/gallery?media=${video.id}`, {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      });
    yield* page.waitForVideo;
    yield* assertPlayingDuration(page, video, input.signal).pipe(Effect.ensuring(timing.turn("assertPlayingDuration")));
    yield* page.hideChrome;
    return { mediaId: video.id, durationSec: video.durationSec };
  });
  const waitForSettledQuality = Effect.fn("waitForSettledQuality")(function* (page: BrowserPage, signal: AbortSignal) {
    const deadline = (yield* timers.now) + 12_000;
    let best: DecodedQuality = { fps: 0, height: 0, method: "none", width: 0 };
    let bestPixels = 0;
    let stableSince = yield* timers.now;
    while ((yield* timers.now) < deadline) {
      yield* checkPlaybackAbort(signal);
      const quality = yield* page.pinQuality;
      const pixels = quality.width * quality.height;
      if (pixels > bestPixels) {
        best = quality;
        bestPixels = pixels;
        stableSince = yield* timers.now;
      } else if (bestPixels > 0 && (yield* timers.now) - stableSince >= 2500) break;
      yield* timers.sleep(300);
    }
    return best.width > 0 && best.height > 0 ? { ...best, ...evenSize(best.width, best.height) } : best;
  });
  return Playback.of({
    start: Effect.fn("Playback.start")(function* (input, sink) {
      const launched = yield* browser.launch(input).pipe(Effect.ensuring(timing.turn("launchCaptureBrowser")));
      const page = launched.page;
      const selected = yield* Effect.uninterruptibleMask((restore) =>
        restore(preparePage(page, input, sink)).pipe(
          Effect.ensuring(timing.turn("preparePage")),
          Effect.catchCause((cause) =>
            launched.session.close.pipe(
              Effect.ensuring(timing.turn("prepareFailureClose")),
              Effect.andThen(Effect.failCause(cause))
            )
          )
        )
      );
      const expectedDuration = selected.durationSec ?? 0;
      const waitUntilPlaying = Effect.fn("Playback.waitUntilPlaying")(function* () {
        const state = yield* waitUntilPlaybackAdvances(() => readMediaState(page, expectedDuration), {
          timeoutMs: 60_000,
          signal: input.signal,
          now: timers.now,
          sleep: Effect.fnUntraced(
            function* (ms) {
              yield* page.pinQuality.pipe(Effect.ignore, Effect.ensuring(timing.turn("pinQuality.catch")));
              yield* timers.sleep(ms);
            },
            (effect) => effect.pipe(Effect.ensuring(timing.turn("playbackSleep")))
          ),
        }).pipe(Effect.ensuring(timing.turn("waitUntilPlaybackAdvances")));
        const quality = yield* waitForSettledQuality(page, input.signal).pipe(
          Effect.ensuring(timing.turn("waitForSettledQuality"))
        );
        yield* page.seekStart(expectedDuration).pipe(Effect.ignore);
        const placed = yield* page.placeVideo({
          expected: expectedDuration,
          width: quality.width,
          height: quality.height,
        });
        yield* timers.sleep(200);
        const viewport = yield* recorder
          .scan({
            ffmpegPath: input.ffmpegPath,
            display: input.display,
            scanWidth: input.width,
            scanHeight: input.height,
          })
          .pipe(
            Effect.catch(
              Effect.fnUntraced(function* (error) {
                yield* sink.log(`Grab origin scan failed: ${error.legacyMessage}`);
                return { x: 0, y: 0 };
              })
            ),
            Effect.ensuring(timing.turn("measureGrabOrigin.catch")),
            Effect.ensuring(timing.turn("measureGrabOrigin.await"))
          );
        yield* page.removeMarker;
        const origin = {
          x: Math.max(0, Math.round(viewport.x + (placed?.x ?? 0))),
          y: Math.max(0, Math.round(viewport.y + (placed?.y ?? 0))),
        };
        if (placed !== null && placed.width > 2 && placed.height > 2) {
          quality.width = Math.round(placed.width) - (Math.round(placed.width) % 2);
          quality.height = Math.round(placed.height) - (Math.round(placed.height) % 2);
        }
        yield* sink.log(`Grab origin ${origin.x},${origin.y} video ${quality.width}x${quality.height}`);
        return { ...quality, duration: state.duration > 0 ? state.duration : 0, originX: origin.x, originY: origin.y };
      });
      return {
        mediaId: selected.mediaId,
        waitUntilPlaying: waitUntilPlaying(),
        waitUntilEnded: Effect.fn("Playback.waitUntilEnded")(function* (onProgress) {
          const started = yield* timers.now;
          let duration = 0;
          while (true) {
            yield* checkPlaybackAbort(input.signal);
            const state = yield* readMediaState(page, expectedDuration);
            if (state === null) {
              yield* timers.sleep(250);
              continue;
            }
            duration = state.duration > 0 ? state.duration : duration;
            yield* onProgress({ currentTime: state.currentTime, duration });
            if (state.ended || (duration > 0 && state.currentTime >= duration - 0.35)) return;
            if (duration > 0 && (yield* timers.now) - started > duration * 1000 + 15_000) return;
            yield* timers.sleep(400);
          }
        }),
        close: launched.session.close,
      };
    }),
  });
});
export const PlaybackLive = Layer.effect(Playback)(makePlayback());
