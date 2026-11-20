import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import { DownloadFilesLive } from "@vidbee/downloader-core/DownloadFiles.layer";
import { DownloadHost } from "@vidbee/downloader-core/DownloadHost.service";
import { YtDlpExecutorHost } from "@vidbee/downloader-core/YtDlpExecutorHost.service";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as MutableHashMap from "effect/MutableHashMap";
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
