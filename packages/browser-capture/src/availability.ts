import * as Effect from "effect/Effect";
import { CaptureHost } from "./CaptureHost.service.js";
import { CaptureTimers } from "./CaptureTimers.service.js";
import { VIRTUAL_DISPLAY_SIZE } from "./quality.js";

export const LINUX_BROWSER_PATHS: Record<string, readonly string[]> = {
  brave: [
    "/usr/bin/brave",
    "/usr/bin/brave-browser",
    "/usr/bin/brave-browser-stable",
    "/opt/brave.com/brave/brave",
    "/opt/brave.com/brave/brave-browser",
  ],
  chrome: ["/usr/bin/google-chrome-stable", "/usr/bin/google-chrome", "/usr/bin/chrome", "/opt/google/chrome/chrome"],
  chromium: ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/lib/chromium/chromium"],
  edge: ["/usr/bin/microsoft-edge", "/usr/bin/microsoft-edge-stable"],
};

export const DEFAULT_CAPTURE_SIZE = VIRTUAL_DISPLAY_SIZE;
export const waitForDisplay = Effect.fn("waitForDisplay")(function* (display: string, timeoutMs = 5000) {
  const host = yield* CaptureHost;
  const timers = yield* CaptureTimers;
  const started = yield* timers.now;
  const deadline = started + timeoutMs;
  while ((yield* timers.now) < deadline) {
    if (yield* host.probeDisplay(display, 1000)) return;
    yield* (timers.sleepProbe ?? timers.sleep)(50);
  }
});
