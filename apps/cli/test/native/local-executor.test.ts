import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import { DownloadFilesLive } from "@vidbee/downloader-core/DownloadFiles.layer";
import { DownloadHost } from "@vidbee/downloader-core/DownloadHost.service";
import { YtDlpExecutorHost } from "@vidbee/downloader-core/YtDlpExecutorHost.service";
import { DataFirst as YtDlpArgs } from "@vidbee/downloader-core/yt-dlp-args";
import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as MutableHashMap from "effect/MutableHashMap";
import { oldRawObservation } from "../../../../scripts/cli/characterization/raw-settings-oracle.mjs";
import { CliHost } from "../../src/CliHost.service.js";
import { CliLocalLive } from "../../src/CliLocal.layer.js";
import { CliLocal } from "../../src/CliLocal.service.js";
import { executorHostLayer } from "../../src/CliLocalExecutor.layer.js";
import { environment, fixtureHost } from "./fixtures.js";

const base = Layer.mergeAll(
  NodeServices.layer,
  Layer.succeed(CliHost, fixtureHost),
  Layer.succeed(DownloadHost, {
    platform: () => "linux",
    homeDirectory: () => fixtureHost.homeDirectory,
    tempDirectory: () => fixtureHost.homeDirectory,
    environment: () => ({}),
    setEnvironment: Effect.fn("fixture.set")(() => Effect.void),
    makeAbortController: () => new AbortController(),
    uuid: () => "fixture",
  })
);
const files = DownloadFilesLive.pipe(Layer.provide(base));
layer(
  Layer.mergeAll(
    executorHostLayer({ defaultDownloadDir: "/fixture/default" }).pipe(Layer.provide(Layer.mergeAll(base, files))),
    CliLocalLive.pipe(Layer.provide(base))
  )
)((it) => {
  it.effect("default local composition builds and owns a native executor without injection", () =>
    Effect.gen(function* () {
      const local = yield* CliLocal;
      const session = yield* local.open({ maxConcurrency: 0 });
      const created = yield* session.add!({
        input: { kind: "yt-dlp-forward", url: "https://example.invalid/v", rawArgs: ["--fixture"] },
      });
      expect(created.task).toMatchObject({ status: "queued" });
      yield* session.shutdown;
    })
  );
  it.effect("native binary resolution is lazy and does not trim downloader paths", () =>
    Effect.gen(function* () {
      const host = yield* YtDlpExecutorHost;
      MutableHashMap.remove(environment, "YTDLP_PATH");
      const observed1 = yield* host.binary;
      expect(observed1).toBe("yt-dlp");
      MutableHashMap.set(environment, "YTDLP_PATH", " /fixture/yt-dlp ");
      const observed2 = yield* host.binary;
      expect(observed2).toBe(" /fixture/yt-dlp ");
      MutableHashMap.set(environment, "FFMPEG_PATH", " /fixture/ffmpeg ");
      const observed3 = yield* host.ffmpeg;
      expect(observed3).toBe(" /fixture/ffmpeg ");
      MutableHashMap.remove(environment, "YTDLP_PATH");
      MutableHashMap.remove(environment, "FFMPEG_PATH");
    })
  );
  const rawSettingsCases: ReadonlyArray<readonly [string, unknown]> = [
    ["absent", undefined],
    ["null", null],
    ["number", 42],
    ["zero", 0],
    ["true", true],
    ["false", false],
    ["string", "unused"],
    ["empty string", ""],
    ["NaN", Number.NaN],
    ["array", ["unused"]],
    ["wrong unused fields", { downloadPath: 42, downloadSubtitles: "unused", browserForCookies: false }],
    ["unknown fields", { extra: { nested: 42 } }],
    ...A.map(
      [null, false, 0, "", 42, true, Number.NaN, "/fixture/cookies", "/fixture/other"],
      (cookiesPath): readonly [string, unknown] => [
        `cookiesPath ${String(cookiesPath)}`,
        { cookiesPath, cookieSource: { type: "browser", browser: "firefox" } },
      ]
    ),
    ...A.map(
      [
        undefined,
        null,
        false,
        0,
        "",
        42,
        true,
        Number.NaN,
        "raw",
        { type: "file" },
        { type: "browser", browser: "firefox", extra: "retained" },
      ],
      (cookieSource): readonly [string, unknown] => [
        `cookieSource ${String(cookieSource)}`,
        { cookiesPath: "/fixture/cookies", cookieSource },
      ]
    ),
  ];
  for (const [name, settings] of rawSettingsCases) {
    it.effect(`raw settings match frozen executor: ${name}`, () =>
      Effect.gen(function* () {
        const host = yield* YtDlpExecutorHost;
        for (const rawArgs of [
          ["--version"],
          ["--ignore-config", "--cookies", "/fixture/cookies"],
          ["--cookies=/fixture/other"],
          ["--cookies", "/fixture/cookies", "--no-cookies"],
          ["--ignore-config", "--cookies-from-browser", "firefox:profile"],
        ]) {
          const input = {
            kind: "yt-dlp-forward" as const,
            url: "https://example.invalid/v",
            rawArgs,
            options: settings === undefined ? {} : { settings },
          };
          const expected = oldRawObservation(input);
          const command = yield* host.command(input);
          expect({
            args: command.args,
            cookieSources: YtDlpArgs.cookieSourcesFromArgs(command.args, command.settings),
            initialSubtitleStatus: command.initialSubtitleStatus,
            canRetryWithoutSubtitles: command.canRetryWithoutSubtitles,
          }).toEqual(expected);
        }
      })
    );
  }
  it.effect("raw argv bypasses unused invalid generated options; empty and absent argv generate", () =>
    Effect.gen(function* () {
      const host = yield* YtDlpExecutorHost;
      const raw = yield* host.command({
        kind: "yt-dlp-forward",
        url: "https://example.invalid/v",
        rawArgs: ["--version"],
        options: { type: "ignored-by-raw-argv", format: false },
      });
      expect(raw.args).toEqual(["--version"]);
      expect(raw.settings).toEqual({});
      for (const rawArgs of [undefined, []]) {
        const generated = yield* host.command({
          kind: "yt-dlp-forward",
          url: "https://example.invalid/v",
          rawArgs,
          options: { settings: { downloadSubtitles: false } },
        });
        expect(generated.args).toContain("https://example.invalid/v");
        expect(generated.canRetryWithoutSubtitles).toBe(true);
      }
    })
  );
  it.effect("raw argv wins; generated options use the configured directory and typed failures", () =>
    Effect.gen(function* () {
      const host = yield* YtDlpExecutorHost;
      const raw = yield* host.command({
        kind: "yt-dlp-forward",
        url: "https://example.invalid/v",
        rawArgs: ["--literal", "value"],
      });
      expect(raw.args).toEqual(["--literal", "value"]);
      expect(raw.canRetryWithoutSubtitles).toBe(false);
      const generated = yield* host.command({
        kind: "video",
        url: "https://example.invalid/v",
        options: {
          customDownloadPath: " /fixture/override ",
          customFilenameTemplate: "fixture.%(ext)s",
          settings: { downloadSubtitles: false },
        },
      });
      expect(generated.args).toContain("/fixture/override/fixture.%(ext)s");
      const invalid = yield* host
        .command({ kind: "video", url: "https://example.invalid/v", options: { type: "invalid" } })
        .pipe(Effect.result);
      expect(invalid._tag).toBe("Failure");
      const cancellation = yield* host.cancellation;
      expect(cancellation.signal.aborted).toBe(false);
      yield* cancellation.abort;
      expect(cancellation.signal.aborted).toBe(true);
    })
  );
});
layer(executorHostLayer({ ytDlpPath: "", ffmpegLocation: "" }).pipe(Layer.provide(Layer.mergeAll(base, files))))(
  (it) => {
    it.effect("explicit empty binary options retain nullish precedence", () =>
      Effect.gen(function* () {
        const host = yield* YtDlpExecutorHost;
        const observed4 = yield* host.binary;
        expect(observed4).toBe("");
        const observed5 = yield* host.ffmpeg;
        expect(observed5).toBe("");
      })
    );
  }
);
