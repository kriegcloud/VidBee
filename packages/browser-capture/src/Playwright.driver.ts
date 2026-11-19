import { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import * as A from "effect/Array";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Record from "effect/Record";
import * as S from "effect/Schema";
import { BoundaryDecodeError, HostFailure } from "./Capture.errors.js";
import { CaptureTimers } from "./CaptureTimers.service.js";
import { onlyFansChatResponse } from "./onlyfans-profile.js";
import * as M from "./Playback.model.js";
import { BrowserCallbacks, Playwright } from "./Playwright.service.js";
import * as Programs from "./playback-page.js";
import { pinHighestQualityInPage, spoofLargePlayerBoxInPage } from "./quality.js";
import type { Browser, BrowserContext, Locator, Page, Response } from "playwright-core";
import type { CaptureError } from "./Capture.errors.js";
import type { BrowserPage, BrowserSession, LocatorRef, ResponseRef } from "./Playwright.service.js";

const hideChromeCss = `
html, body { background: #000 !important; overflow: hidden !important; margin: 0 !important; }
video {
  position: fixed !important;
  left: 0 !important;
  top: 0 !important;
  margin: 0 !important;
  max-width: none !important;
  max-height: none !important;
  object-fit: fill !important;
  background: #000 !important;
  z-index: 2147483647 !important;
}
`;

const browserArgs = (width: number, height: number): string[] => [
  `--window-size=${width},${height}`,
  "--window-position=0,0",
  "--kiosk",
  "--start-fullscreen",
  "--no-first-run",
  "--noerrdialogs",
  "--disable-infobars",
  "--disable-session-crashed-bubble",
  "--disable-features=Translate,MediaRouter,AutomationControlled",
  "--autoplay-policy=no-user-gesture-required",
  "--disable-blink-features=AutomationControlled",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--force-device-scale-factor=1",
  "--high-dpi-support=1",
  "--ozone-platform=x11",
];

const listStartsAt = (payload: unknown, messageId: string | null): boolean => {
  if (!Predicate.isTruthy(messageId)) return true;
  if (!Predicate.isObject(payload)) return false;
  const list = payload.list;
  if (!A.isArray(list) || list.length === 0) return false;
  const first = list[0];
  if (!Predicate.isObject(first)) return false;
  return String(first.id ?? "") === messageId;
};
const host = <A>(operation: string, run: () => Promise<A>): Effect.Effect<A, HostFailure> =>
  Effect.tryPromise({
    try: () => Promise.resolve(run()),
    catch: (cause) =>
      HostFailure.make({ operation, legacyMessage: cause instanceof Error ? cause.message : String(cause), cause }),
  });
const decoded = <A, I, R>(
  schema: S.Codec<A, I, R, never>,
  operation: string,
  work: Effect.Effect<unknown, HostFailure>
): Effect.Effect<A, HostFailure | BoundaryDecodeError, R> =>
  work.pipe(
    Effect.flatMap(S.decodeUnknownEffect(schema)),
    Effect.mapError((cause) =>
      S.is(HostFailure)(cause)
        ? cause
        : BoundaryDecodeError.make({ operation, legacyMessage: `Invalid browser ${operation} result`, cause })
    )
  );
const wrapResponse = (response: Response): ResponseRef => ({
  url: () => response.url(),
  ok: () => response.ok(),
  status: () => response.status(),
  json: host("response.json", () => response.json()),
});
const wrapLocator = (locator: Locator): LocatorRef => ({
  first: () => wrapLocator(locator.first()),
  locator: (selector) => wrapLocator(locator.locator(selector)),
  all: host("locator.all", () => locator.all()).pipe(Effect.map((entries) => A.map(entries, wrapLocator))),
  getAttribute: (name, options) =>
    host("locator.getAttribute", () =>
      options === undefined ? locator.getAttribute(name) : locator.getAttribute(name, options)
    ),
  isVisible: host("locator.isVisible", () => locator.isVisible()),
  boundingBox: decoded(
    S.NullOr(M.Rectangle),
    "locator.boundingBox",
    host("locator.boundingBox", () => locator.boundingBox())
  ),
  click: (options) => host("locator.click", () => locator.click(options)),
});
const Carousel = S.NullOr(S.Struct({ active: S.Finite, index: S.Finite }));
const wrapPage = (
  page: Page,
  callbacks: typeof BrowserCallbacks.Service,
  timers: typeof CaptureTimers.Service
): BrowserPage => {
  const listeners: Array<{
    listener: (response: ResponseRef) => Effect.Effect<void, CaptureError>;
    host: (response: Response) => void;
  }> = [];
  return {
    url: () => page.url(),
    isClosed: () => page.isClosed(),
    goto: (url, options) => host("page.goto", () => page.goto(url, options)).pipe(Effect.asVoid),
    bringToFront: host("page.bringToFront", () => page.bringToFront()),
    onResponse: (listener) =>
      Effect.sync(() => {
        const callback = (response: Response): void => callbacks.sync(listener(wrapResponse(response)));
        listeners.push({ listener, host: callback });
        page.on("response", callback);
      }),
    offResponse: (listener) =>
      Effect.sync(() => {
        const index = Option.getOrElse(
          A.findLastIndex(listeners, (entry) => entry.listener === listener),
          () => -1
        );
        const entry = listeners[index];
        if (entry !== undefined) {
          page.off("response", entry.host);
          listeners.splice(index, 1);
        }
      }),
    waitForResponse: (predicate, options) =>
      host("page.waitForResponse", () =>
        page.waitForResponse((response) => callbacks.promise(predicate(wrapResponse(response))), options)
      ).pipe(Effect.map(wrapResponse)),
    locator: (selector) => wrapLocator(page.locator(selector)),
    getByText: (text, options) => wrapLocator(page.getByText(text, options)),
    presentedMessages: Effect.fn("page.presentedMessages")(function* (chatId, anchorId) {
      const result = yield* Deferred.make<unknown, HostFailure>();
      let first: unknown = null;
      const finish = (payload: unknown): void => {
        callbacks.sync(cancel);
        page.off("response", onResponse);
        callbacks.sync(Deferred.succeed(result, payload));
      };
      const cancel = yield* timers.after(
        30_000,
        Effect.sync(() => {
          page.off("response", onResponse);
          callbacks.sync(
            Predicate.isTruthy(first)
              ? Deferred.succeed(result, first)
              : Deferred.fail(
                  result,
                  HostFailure.make({
                    operation: "presentedMessages",
                    legacyMessage: "Timed out waiting for the chat message list",
                    cause: new Error("Timed out waiting for the chat message list"),
                  })
                )
          );
        }),
        { keepAlive: true }
      );
      const onResponse = (response: Response): void => {
        let url: URL;
        try {
          url = new URL(response.url());
        } catch {
          return;
        }
        if (!(onlyFansChatResponse(url, chatId) && response.ok())) return;
        void response
          .json()
          .then((body: unknown) => {
            first ??= body;
            if (listStartsAt(body, anchorId)) finish(body);
          })
          .catch(() => undefined);
      };
      page.on("response", onResponse);
      return { wait: Deferred.await(result) };
    }),
    waitForVideo: host("page.waitForSelector", () => page.waitForSelector("video", { timeout: 45_000 })).pipe(
      Effect.asVoid
    ),
    hideChrome: host("page.addStyleTag", () => page.addStyleTag({ content: hideChromeCss })).pipe(Effect.asVoid),
    click: (x, y) => host("page.mouse.click", () => page.mouse.click(x, y)),
    readMediaState: (expectedDuration) =>
      decoded(
        S.NullOr(M.MediaClock),
        "mediaClock",
        host("page.evaluate", () => page.evaluate(Programs.readMediaStateInPage, expectedDuration))
      ),
    pinQuality: decoded(
      M.DecodedQuality,
      "quality",
      host("page.evaluate", () => page.evaluate(pinHighestQualityInPage))
    ),
    stepToMedia: (mediaId) =>
      decoded(
        Carousel,
        "carousel",
        host("page.evaluate", () => page.evaluate(Programs.stepToMedia, mediaId))
      ),
    swiperPoint: (mediaId) =>
      decoded(
        S.NullOr(M.Position),
        "swiperPoint",
        host("page.evaluate", () => page.evaluate(Programs.swiperPointInPage, mediaId))
      ),
    attachmentPoint: (input) =>
      decoded(
        S.NullOr(M.Position),
        "attachmentPoint",
        host("page.evaluate", () => page.evaluate(Programs.attachmentPointInPage, input))
      ),
    clickMedia: host("page.evaluate", () => page.evaluate(Programs.clickMediaInPage)),
    seekStart: (expectedDuration) =>
      host("page.evaluate", () => page.evaluate(Programs.seekStartInPage, expectedDuration)),
    placeVideo: (input) =>
      decoded(
        S.NullOr(M.Rectangle),
        "rectangle",
        host("page.evaluate", () => page.evaluate(Programs.placeVideoInPage, input))
      ),
    removeMarker: host("page.evaluate", () => page.evaluate(Programs.removeMarkerInPage)),
    viewport: host("page.evaluate", () => page.evaluate(Programs.viewportInPage)),
    profileScroll: (input) =>
      decoded(
        S.Boolean,
        "scroll",
        host("page.evaluate", () => page.evaluate(Programs.profileScrollInPage, input)).pipe(Effect.map(Boolean))
      ),
  };
};
const wrapSession = (
  context: BrowserContext,
  close: Effect.Effect<void, HostFailure>,
  callbacks: typeof BrowserCallbacks.Service,
  timers: typeof CaptureTimers.Service
): BrowserSession => {
  const pages: Array<{ page: Page; ref: BrowserPage }> = [];
  const pageRef = (page: Page): BrowserPage => {
    const existing = Option.getOrUndefined(A.findFirst(pages, (entry) => entry.page === page));
    if (existing !== undefined) return existing.ref;
    const ref = wrapPage(page, callbacks, timers);
    pages.push({ page, ref });
    return ref;
  };
  return {
    pages: () => A.map(context.pages(), pageRef),
    newPage: host("context.newPage", () => context.newPage()).pipe(Effect.map(pageRef)),
    cookies: (origin) => host("context.cookies", () => context.cookies(origin)),
    onClosed: (listener) =>
      Effect.sync(() => {
        context.on("close", listener);
      }),
    close,
  };
};
const makePlaywright = Effect.fn("makePlaywright")(function* () {
  const callbacks = yield* BrowserCallbacks;
  const timers = yield* CaptureTimers;
  const timing = yield* LegacyTiming;
  const install = Effect.fn("installPageNameHelper")(function* (context: BrowserContext) {
    yield* host("context.addInitScript", () => context.addInitScript("globalThis.__name = (target) => target")).pipe(
      Effect.ensuring(timing.turn("installPageNameHelper"))
    );
    yield* host("context.addInitScript", () => context.addInitScript(spoofLargePlayerBoxInPage));
  });
  const captureClose = Effect.fn("captureClose")(function* (context: BrowserContext, browser: Browser | null) {
    yield* host("context.close", () => context.close().catch(() => undefined));
    if (browser !== null) yield* host("browser.close", () => browser.close().catch(() => undefined));
    else yield* timing.turn("closeAbsentBrowser");
  });
  return Playwright.of({
    launch: Effect.fn("Playwright.launch")(function* (input) {
      const { chromium } = yield* host("import.playwright", () => import("playwright-core"));
      const { WAYLAND_DISPLAY: _waylandDisplay, ...sessionEnv } = process.env;
      const env: NodeJS.ProcessEnv = {
        ...sessionEnv,
        DISPLAY: input.display,
        XDG_SESSION_TYPE: "x11",
        GDK_BACKEND: "x11",
      };
      if (Predicate.isTruthy(input.pulseSink)) env.PULSE_SINK = input.pulseSink;
      const args = browserArgs(input.width, input.height);
      if (Predicate.isTruthy(input.userDataDir) && input.userDataDir !== undefined) {
        const directory = input.userDataDir;
        const context = yield* host("chromium.launchPersistentContext", () =>
          chromium.launchPersistentContext(directory, {
            executablePath: input.executablePath,
            headless: false,
            env,
            args,
            ignoreDefaultArgs: ["--enable-automation"],
            viewport: { width: input.width, height: input.height },
            deviceScaleFactor: 1,
            ignoreHTTPSErrors: true,
          })
        );
        yield* install(context);
        const first = context.pages()[0];
        const page = first ?? (yield* host("context.newPage", () => context.newPage()));
        const session = wrapSession(context, captureClose(context, null), callbacks, timers);
        return { session, page: wrapPage(page, callbacks, timers) };
      }
      const browser = yield* host("chromium.launch", () =>
        chromium.launch({
          executablePath: input.executablePath,
          headless: false,
          env,
          args,
          ignoreDefaultArgs: ["--enable-automation"],
        })
      );
      const context = yield* host("browser.newContext", () =>
        browser.newContext({
          viewport: { width: input.width, height: input.height },
          deviceScaleFactor: 1,
          ignoreHTTPSErrors: true,
        })
      );
      yield* install(context);
      if (input.cookies.length > 0) yield* host("context.addCookies", () => context.addCookies(input.cookies));
      if (
        Predicate.isTruthy(input.localStorage) &&
        input.localStorage !== undefined &&
        Record.keys(input.localStorage).length > 0
      ) {
        const seed = input.localStorage;
        yield* host("context.addInitScript", () => context.addInitScript(Programs.seedLocalStorageInPage, seed));
      }
      const page = yield* host("context.newPage", () => context.newPage());
      const session = wrapSession(context, captureClose(context, browser), callbacks, timers);
      return { session, page: wrapPage(page, callbacks, timers) };
    }),
    launchProfile: Effect.fn("Playwright.launchProfile")(function* (input) {
      const { chromium } = yield* host("import.playwright", () => import("playwright-core"));
      yield* input.prepareDirectory;
      const context = yield* host("chromium.launchPersistentContext", () =>
        chromium.launchPersistentContext(input.userDataDir, {
          executablePath: input.executablePath,
          headless: false,
          viewport: null,
          ignoreDefaultArgs: ["--enable-automation"],
          args: ["--no-first-run"],
        })
      );
      return wrapSession(
        context,
        host("context.close", () => context.close()),
        callbacks,
        timers
      );
    }),
  });
});
export const PlaywrightLive = Layer.effect(Playwright)(makePlaywright());
