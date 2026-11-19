import { parseBrowserCookiesSetting } from "@vidbee/downloader-core/browser-cookies-setting";
import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Predicate from "effect/Predicate";
import { LINUX_BROWSER_PATHS } from "./availability.js";
import { DisplayUnavailable } from "./Capture.errors.js";
import { CaptureHost, CaptureHostDriver } from "./CaptureHost.service.js";
export const CaptureHostLive = Layer.effect(
  CaptureHost,
  Effect.gen(function* () {
    const driver = yield* CaptureHostDriver;
    const path = yield* Path.Path;
    const browser = Effect.fn("CaptureHost.browser")(function* (preference?: string) {
      const preferred = parseBrowserCookiesSetting(preference).browser;
      const names = [preferred, "brave", "chrome", "chromium", "edge"];
      const order = A.filter(
        names,
        (name, index) => Predicate.isTruthy(name) && name !== "none" && names.indexOf(name) === index
      );
      for (const name of order) {
        for (const candidate of LINUX_BROWSER_PATHS[name] ?? []) if (yield* driver.exists(candidate)) return candidate;
        const found = yield* driver.which(name);
        if (found !== null && Predicate.isTruthy(found)) return found;
      }
      for (const name of [
        "google-chrome-stable",
        "google-chrome",
        "brave",
        "brave-browser",
        "chromium",
        "microsoft-edge",
      ]) {
        const found = yield* driver.which(name);
        if (found !== null) return found;
      }
      return null;
    });
    return CaptureHost.of({
      snapshot: driver.snapshot,
      probeDisplay: driver.probeDisplay,
      makeAbortController: driver.makeAbortController,
      browser,
      xvfb: driver.which("Xvfb"),
      pactl: driver.which("pactl"),
      available: Effect.gen(function* () {
        const snapshot = yield* driver.snapshot;
        if (snapshot.environment.VIDBEE_BROWSER_CAPTURE === "0" || snapshot.platform !== "linux") return false;
        const xvfb = yield* driver.which("Xvfb");
        if (!Predicate.isTruthy(xvfb)) return false;
        const resolved = yield* browser();
        return Predicate.isTruthy(resolved);
      }),
      displayNumber: Effect.gen(function* () {
        for (let display = 90; display < 130; display += 1) {
          if (
            !(yield* driver.exists(`/tmp/.X${display}-lock`)) &&
            !(yield* driver.exists(path.join("/tmp", ".X11-unix", `X${display}`)))
          )
            return display;
        }
        return yield* DisplayUnavailable.make({
          operation: "displayNumber",
          legacyMessage: "No free Xvfb display in :90-:129",
        });
      }),
    });
  })
);
