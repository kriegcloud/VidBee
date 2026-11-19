import { expect, it } from "@effect/vitest";
import { DownloadProcess } from "@vidbee/downloader-core/DownloadProcess.service";
import { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { browserProfilesLayer } from "../src/BrowserProfiles.layer.js";
import { BrowserProfiles, ProfileHost } from "../src/BrowserProfiles.service.js";
import { HostFailure } from "../src/Capture.errors.js";
import { CaptureFiles } from "../src/CaptureFiles.service.js";
import { CaptureHost } from "../src/CaptureHost.service.js";
import { CaptureTimers } from "../src/CaptureTimers.service.js";
import { MediaTransport } from "../src/MediaTransport.service.js";
import { onlyFansAdapter } from "../src/onlyfans-profile.js";
import { Playwright } from "../src/Playwright.service.js";
import { ProfileCodecLive } from "../src/ProfileCodec.layer.js";
import type { BrowserSession } from "../src/Playwright.service.js";

const unused = Effect.die("unexpected fixture operation");
const newController = () => new AbortController();
const sentinel = HostFailure.make({ operation: "launch", legacyMessage: "launch sentinel" });
let launches = 0;
let failures = 0;
const closed: Array<() => void> = [];
const session: BrowserSession = {
  pages: () => [],
  newPage: Effect.fail(HostFailure.make({ operation: "newPage", legacyMessage: "page sentinel" })),
  cookies: Effect.fn("fixture.cookies")(() => Effect.succeed([])),
  onClosed: Effect.fn("fixture.onClosed")((listener) =>
    Effect.sync(() => {
      closed.push(listener);
    })
  ),
  close: Effect.sync(() => {
    A.forEach(closed, (listener) => listener());
    closed.length = 0;
  }),
};
const dependencies = Layer.mergeAll(
  Layer.succeed(CaptureFiles, {
    exists: Effect.fn("fixture.exists")(() => Effect.succeed(false)),
    mkdir: Effect.fn("fixture.mkdir")(() => Effect.void),
    write: Effect.fn("fixture.write")(() => Effect.void),
    rename: Effect.fn("fixture.rename")(() => Effect.void),
    list: Effect.fn("fixture.list")(() => Effect.succeed([])),
    readText: Effect.fn("fixture.readText")(() => unused),
    readBytes: Effect.fn("fixture.readBytes")(() => unused),
    stat: Effect.fn("fixture.stat")(() => unused),
    tempDirectory: Effect.fn("fixture.tempDirectory")(() => unused),
    copy: Effect.fn("fixture.copy")(() => unused),
    remove: Effect.fn("fixture.remove")(() => unused),
  }),
  Layer.succeed(CaptureHost, {
    available: Effect.succeed(true),
    browser: Effect.fn("fixture.browser")(() => Effect.succeed("/synthetic/chromium")),
    xvfb: unused,
    pactl: unused,
    displayNumber: unused,
    snapshot: unused,
    probeDisplay: Effect.fn("fixture.probeDisplay")(() => unused),
    makeAbortController: newController,
  }),
  Layer.succeed(CaptureTimers, {
    now: Effect.succeed(1800000000000),
    sleep: Effect.fn("fixture.sleep")(() => unused),
    defer: Effect.fn("fixture.defer")(() => unused),
    after: Effect.fn("fixture.after")(() => unused),
  }),
  Layer.succeed(ProfileHost, {
    defaultDirectory: Effect.succeed("/synthetic/downloads"),
    delay: Effect.fn("fixture.delay")(() => unused),
  }),
  Layer.succeed(Playwright, {
    launch: Effect.fn("fixture.launch")(() => unused),
    launchProfile: Effect.fn("fixture.launchProfile")(() =>
      Effect.suspend(() => {
        launches += 1;
        if (failures > 0) {
          failures -= 1;
          return Effect.fail(sentinel);
        }
        return Effect.succeed(session);
      })
    ),
  }),
  Layer.succeed(DownloadProcess, { start: Effect.fn("fixture.start")(() => unused) }),
  Layer.succeed(MediaTransport, { open: Effect.fn("fixture.open")(() => unused) }),
  ProfileCodecLive,
  LegacyTiming.layer,
  Path.layer
);
const layer = browserProfilesLayer({ storageDir: "/synthetic/profiles", adapter: onlyFansAdapter }).pipe(
  Layer.provide(dependencies)
);
it.layer(layer)((it) => {
  it.effect("clears a synchronously failed opening attempt so later commands retry", () =>
    Effect.gen(function* () {
      launches = 0;
      failures = 2;
      const profiles = yield* BrowserProfiles;
      const first = yield* Effect.result(profiles.command({ url: "https://onlyfans.com/syncfailure", action: "open" }));
      const second = yield* Effect.result(
        profiles.command({ url: "https://onlyfans.com/syncfailure", action: "open" })
      );
      expect(first._tag).toBe("Failure");
      expect(second._tag).toBe("Failure");
      expect(launches).toBe(2);
      yield* profiles.stop;
    })
  );
  it.effect("retains a synchronously opened context after later page failure and closes it on stop", () =>
    Effect.gen(function* () {
      launches = 0;
      failures = 1;
      const profiles = yield* BrowserProfiles;
      const first = yield* Effect.result(profiles.command({ url: "https://onlyfans.com/syncsuccess", action: "open" }));
      const second = yield* Effect.result(
        profiles.command({ url: "https://onlyfans.com/syncsuccess", action: "open" })
      );
      const third = yield* Effect.result(profiles.command({ url: "https://onlyfans.com/syncsuccess", action: "open" }));
      expect(first._tag).toBe("Failure");
      expect(second._tag).toBe("Failure");
      expect(third._tag).toBe("Failure");
      expect(launches).toBe(2);
      yield* profiles.stop;
      expect(closed).toEqual([]);
      const fourth = yield* Effect.result(
        profiles.command({ url: "https://onlyfans.com/syncsuccess", action: "open" })
      );
      expect(fourth._tag).toBe("Failure");
      expect(launches).toBe(3);
      yield* profiles.stop;
    })
  );
});
