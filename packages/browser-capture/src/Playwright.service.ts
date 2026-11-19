import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { BoundaryDecodeError, CaptureError, HostFailure } from "./Capture.errors.js";
import type { PlaywrightCookie } from "./Cookies.model.js";
import type { DecodedQuality, MediaClock, Position, Rectangle } from "./Playback.model.js";

export type BrowserError = HostFailure | BoundaryDecodeError;
export type BrowserEffect<A> = Effect.Effect<A, BrowserError>;
export interface ResponseRef {
  readonly json: BrowserEffect<unknown>;
  readonly ok: () => boolean;
  readonly status: () => number;
  readonly url: () => string;
}
export interface LocatorRef {
  readonly all: BrowserEffect<ReadonlyArray<LocatorRef>>;
  readonly boundingBox: BrowserEffect<Rectangle | null>;
  readonly click: (options: { readonly timeout: number }) => BrowserEffect<void>;
  readonly first: () => LocatorRef;
  readonly getAttribute: (
    name: string,
    options?: { readonly timeout: number } | undefined
  ) => BrowserEffect<string | null>;
  readonly isVisible: BrowserEffect<boolean>;
  readonly locator: (selector: string) => LocatorRef;
}
export interface BrowserPage {
  readonly attachmentPoint: (input: { needles: string[]; labels: string[] }) => BrowserEffect<Position | null>;
  readonly bringToFront: BrowserEffect<void>;
  readonly click: (x: number, y: number) => BrowserEffect<void>;
  readonly clickMedia: BrowserEffect<void>;
  readonly getByText: (text: string, options: { readonly exact: boolean }) => LocatorRef;
  readonly goto: (
    url: string,
    options: { readonly waitUntil: "domcontentloaded"; readonly timeout: number }
  ) => BrowserEffect<void>;
  readonly hideChrome: BrowserEffect<void>;
  readonly isClosed: () => boolean;
  readonly locator: (selector: string) => LocatorRef;
  readonly offResponse: (listener: (response: ResponseRef) => Effect.Effect<void, CaptureError>) => Effect.Effect<void>;
  readonly onResponse: (listener: (response: ResponseRef) => Effect.Effect<void, CaptureError>) => Effect.Effect<void>;
  readonly pinQuality: BrowserEffect<DecodedQuality>;
  readonly placeVideo: (input: { expected: number; width: number; height: number }) => BrowserEffect<Rectangle | null>;
  readonly presentedMessages: (
    chatId: string,
    anchorId: string | null
  ) => Effect.Effect<{ readonly wait: BrowserEffect<unknown> }, CaptureError>;
  readonly profileScroll: (input: { nested: boolean; chat: boolean }) => BrowserEffect<boolean>;
  readonly readMediaState: (expected: number) => BrowserEffect<MediaClock | null>;
  readonly removeMarker: BrowserEffect<void>;
  readonly seekStart: (expected: number) => BrowserEffect<void>;
  readonly stepToMedia: (id: string) => BrowserEffect<{ readonly active: number; readonly index: number } | null>;
  readonly swiperPoint: (id: string) => BrowserEffect<Position | null>;
  readonly url: () => string;
  readonly viewport: BrowserEffect<unknown>;
  readonly waitForResponse: (
    predicate: (response: ResponseRef) => Effect.Effect<boolean, CaptureError>,
    options: { readonly timeout: number }
  ) => BrowserEffect<ResponseRef>;
  readonly waitForVideo: BrowserEffect<void>;
}
export interface BrowserSession {
  readonly close: BrowserEffect<void>;
  readonly cookies: (origin: string) => BrowserEffect<ReadonlyArray<{ readonly name: string; readonly value: string }>>;
  readonly newPage: BrowserEffect<BrowserPage>;
  readonly onClosed: (listener: () => void) => Effect.Effect<void>;
  readonly pages: () => ReadonlyArray<BrowserPage>;
}
export interface CaptureBrowserInput {
  readonly cookies: PlaywrightCookie[];
  readonly display: string;
  readonly executablePath: string;
  readonly height: number;
  readonly localStorage?: Record<string, string> | undefined;
  readonly pulseSink?: string | undefined;
  readonly userDataDir?: string | undefined;
  readonly width: number;
}
export interface PlaywrightShape {
  readonly launch: (
    input: CaptureBrowserInput
  ) => BrowserEffect<{ readonly session: BrowserSession; readonly page: BrowserPage }>;
  readonly launchProfile: (input: {
    readonly executablePath: string;
    readonly userDataDir: string;
    readonly prepareDirectory: BrowserEffect<void>;
  }) => BrowserEffect<BrowserSession>;
}
export class Playwright extends Context.Service<Playwright, PlaywrightShape>()(
  "@vidbee/browser-capture/Playwright.service/Playwright"
) {}

export class BrowserCallbacks extends Context.Service<
  BrowserCallbacks,
  {
    readonly sync: (effect: Effect.Effect<void, CaptureError>) => void;
    readonly promise: <A>(effect: Effect.Effect<A, CaptureError>) => Promise<A>;
  }
>()("@vidbee/browser-capture/Playwright.service/BrowserCallbacks") {}
