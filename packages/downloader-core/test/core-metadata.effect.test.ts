import * as NodePath from "@effect/platform-node/NodePath";
import { expect, it, layer as testLayer } from "@effect/vitest";
import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { decodeVideoInfo } from "../src/CoreMetadata.model.js";
import { DownloadArguments } from "../src/DownloadArguments.service.js";
import { Downloader } from "../src/Downloader.service.js";
import { DownloaderHost } from "../src/DownloaderHost.service.js";
import { DownloadTiming } from "../src/DownloadTiming.service.js";
import { layer } from "../src/downloader-core.js";
import { YtDlpProcess } from "../src/YtDlpProcess.service.js";
import type { ProcessSpec } from "../src/Process.model.js";
import type { WrapperSink } from "../src/YtDlpProcess.service.js";

const fixture = (failures: number, playlistJson = '{"id":"playlist","entries":[]}') => {
  let attempts = 0;
  const sleeps: number[] = [];
  let builds = 0;
  const argv: (readonly string[])[] = [];
  const failure = new Error("connection reset fixture");
  const dependencies = Layer.mergeAll(
    NodePath.layer,
    Layer.succeed(DownloaderHost, {
      jsonSyntaxMessage: () => "Invalid yt-dlp metadata.",
      downloadDir: "/downloads",
      maxConcurrent: 1,
      runtimeSettings: {},
      jsRuntimeArgs: [],
      platform: "linux",
      initialize: Effect.succeed({ binary: "fixture", ffmpeg: "/ffmpeg" }),
      now: () => 100,
      random: () => 0.5,
      uuid: () => "id",
      cancellation: Effect.sync(() => {
        const controller = new AbortController();
        return { signal: controller.signal, abort: Effect.sync(() => controller.abort()) };
      }),
      lowerPriority: Effect.fn("fixture.lowerPriority")(() => Effect.void),
      emit: Effect.fn("fixture.emit")(() => Effect.void),
    }),
    Layer.succeed(DownloadTiming, {
      turn: Effect.fn("fixture.turn")(() => Effect.void),
      sleep: Effect.fn("fixture.sleep")((ms) =>
        Effect.sync(() => {
          sleeps.push(ms);
        })
      ),
    }),
    Layer.succeed(DownloadArguments, {
      download: Effect.fn("fixture.download")(() => Effect.succeed([])),
      videoInfo: Effect.fn("fixture.video")((url) =>
        Effect.sync(() => {
          builds++;
          return ["-j", url];
        })
      ),
      playlistInfo: Effect.fn("fixture.playlist")((url) => Effect.succeed(["-J", url])),
      captions: Effect.fn("fixture.captions")(() => Effect.succeed([])),
    }),
    Layer.succeed(YtDlpProcess, {
      start: Effect.fn("fixture.metadata.start")(function* (spec: ProcessSpec, sink: WrapperSink) {
        argv.push(spec.argv);
        attempts++;
        if (attempts <= failures) yield* sink.emit({ _tag: "error", error: failure });
        else {
          yield* sink.emit({
            _tag: "stdout",
            chunk: new TextEncoder().encode(
              spec.argv[0] === "-J" ? playlistJson : '{"id":"video","title":"Fixture","formats":[{}]}'
            ),
          });
          yield* sink.emit({ _tag: "close", code: 0 });
        }
        return {
          _tag: "Acquired" as const,
          run: {
            pid: 12,
            signalChild: Effect.fn("fixture.signalChild")(() => Effect.void),
            signalPid: Effect.fn("fixture.signalPid")(() => Effect.void),
            signalGroup: Effect.fn("fixture.signalGroup")(() => Effect.void),
            signalTree: Effect.fn("fixture.signalTree")(() => Effect.void),
          },
        };
      }),
    })
  );
  return {
    layer: layer.pipe(Layer.provide(dependencies)),
    sleeps,
    argv,
    failure,
    attempts: () => attempts,
    builds: () => builds,
  };
};
const success = fixture(2);
testLayer(success.layer)("native Core metadata", (it) => {
  it.effect("retries twice through timers, decodes JSON and admits an empty playlist", () => {
    const f = success;
    return Effect.gen(function* () {
      const core = yield* Downloader;
      const video = yield* core.getVideoInfo(" https://fixture.invalid/video ");
      expect(video).toMatchObject({ id: "video", formats: [{ formatId: "unknown", ext: "unknown" }] });
      expect(f.sleeps).toEqual([1000, 1000]);
      expect(f.attempts()).toBe(3);
      expect(f.builds()).toBe(3);
      expect(f.argv[0]).toEqual(["-j", "https://fixture.invalid/video"]);
      const playlist = yield* core.startPlaylistDownload({ url: "https://fixture.invalid/playlist", type: "video" });
      expect(playlist).toMatchObject({
        playlistId: "playlist",
        totalCount: 0,
        startIndex: 0,
        endIndex: 0,
        entries: [],
      });
    });
  });
});
const exhausted = fixture(3);
testLayer(exhausted.layer)("native Core metadata exhaustion", (it) => {
  it.effect("exhausts exactly three attempts retaining original process error", () => {
    const f = exhausted;
    return Effect.gen(function* () {
      const core = yield* Downloader;
      const error = yield* core.getVideoInfo("fixture").pipe(Effect.flip);
      expect(error).toMatchObject({ cause: f.failure });
      expect(f.attempts()).toBe(3);
      expect(f.builds()).toBe(3);
      expect(f.sleeps).toEqual([1000, 1000]);
    });
  });
});
for (const value of [
  { id: 7 },
  { title: false },
  { duration: Number.POSITIVE_INFINITY },
  { view_count: Number.POSITIVE_INFINITY },
  { formats: [{ format_id: 7 }] },
  { formats: [{ ext: false }] },
  { formats: [{ height: Number.POSITIVE_INFINITY }] },
]) {
  it.effect("rejects scalars that cannot inhabit VideoInfo", () =>
    Effect.gen(function* () {
      const error = yield* decodeVideoInfo(value, "fixture").pipe(Effect.flip);
      expect(error).toMatchObject({ _tag: "BoundaryDecodeError", legacyMessage: "Invalid yt-dlp metadata." });
    })
  );
}

for (const value of [7, false, "text", [], { formats: [7, false, "text", []] }]) {
  it.effect("preserves primitive property boxing and valid field defaults", () =>
    Effect.gen(function* () {
      const info = yield* decodeVideoInfo(value, "fixture");
      expect(info.id).toBe("fixture");
      expect(info.title).toBe("fixture");
    })
  );
}
for (const [value, message] of [
  [null, "Cannot read properties of null (reading 'formats')"],
  [{ formats: {} }, "(raw.formats ?? []).map is not a function"],
] as const) {
  it.effect("retains the original null/formats TypeError", () =>
    Effect.gen(function* () {
      const error = yield* decodeVideoInfo(value, "fixture").pipe(Effect.flip);
      expect(error.cause).toBeInstanceOf(TypeError);
      expect(error.cause).toMatchObject({ message });
    })
  );
}
const playlistJson =
  '{"id":"playlist","title":"Fixture","entries":[{"id":"1","url":"https://fixture.invalid/1","media_type":"photo"},{"id":"2","url":"https://fixture.invalid/2","media_type":"video"},{"id":"3","url":"https://fixture.invalid/3","media_type":"recording"}]}';
for (const [selection, expected] of [
  [{ startIndex: 2, endIndex: 3 }, ["3", "2"]],
  [{ entryIds: ["3", "1"], startIndex: 2, endIndex: 2 }, ["3", "1"]],
] as const) {
  const f = fixture(0, playlistJson);
  testLayer(f.layer)("native playlist selection", (it) => {
    it.effect("preserves range/ID precedence and media-kind admission order", () =>
      Effect.gen(function* () {
        const core = yield* Downloader;
        const result = yield* core.startPlaylistDownload({
          url: "fixture",
          type: "video",
          ...selection,
          entryIds: "entryIds" in selection ? [...selection.entryIds] : undefined,
        });
        expect(A.map(result.entries, (entry) => entry.entryId)).toEqual(expected);
        expect(result.totalCount).toBe(2);
      })
    );
  });
}
