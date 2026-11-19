import * as NodePath from "@effect/platform-node/NodePath";
import { expect, layer as testLayer } from "@effect/vitest";
import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as A from "effect/Array";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as PlatformError from "effect/PlatformError";
import { DownloadArguments } from "../src/DownloadArguments.service.js";
import { Downloader } from "../src/Downloader.service.js";
import { DownloaderHost } from "../src/DownloaderHost.service.js";
import { DownloadTiming } from "../src/DownloadTiming.service.js";
import { layer } from "../src/downloader-core.js";
import { YtDlpProcess } from "../src/YtDlpProcess.service.js";
import type { DownloaderEvent } from "../src/Downloader.model.js";
import type { WrapperSink } from "../src/YtDlpProcess.service.js";

const FixtureMode = LiteralKit(["normal", "acquisition", "listener"]);
const fixture = (mode: typeof FixtureMode.Type) => {
  const events: DownloaderEvent[] = [];
  const sinks: WrapperSink[] = [];
  const listenerFailure = { callback: "core-listener" };
  let id = 0;
  const now = 100;
  const host = Layer.succeed(DownloaderHost, {
    jsonSyntaxMessage: () => "Invalid yt-dlp metadata.",
    downloadDir: "/downloads",
    maxConcurrent: 1,
    runtimeSettings: {},
    jsRuntimeArgs: [],
    platform: "linux",
    initialize: Effect.succeed({ binary: "fixture", ffmpeg: "/ffmpeg" }),
    now: () => now,
    random: () => 0.5,
    uuid: () => `task-${++id}`,
    cancellation: Effect.sync(() => {
      const controller = new AbortController();
      return { signal: controller.signal, abort: Effect.sync(() => controller.abort()) };
    }),
    lowerPriority: Effect.fn("fixture.priority")(() => Effect.void),
    emit: Effect.fn("fixture.event")((event) =>
      Effect.sync(() => {
        events.push(event);
        if (mode === "listener" && event.type === "task-updated" && event.value.status === "downloading")
          throw listenerFailure;
      })
    ),
  });
  const process = Layer.succeed(YtDlpProcess, {
    start: Effect.fn("fixture.start")((_spec, sink) =>
      Effect.sync(() => {
        sinks.push(sink);
        if (mode === "acquisition")
          return {
            _tag: "NativeSpawnFailure" as const,
            error: PlatformError.badArgument({
              module: "ChildProcess",
              method: "spawn",
              description: "missing fixture",
            }),
          };
        return {
          _tag: "Acquired" as const,
          run: {
            pid: 123,
            writeStdin: (_bytes: Uint8Array) => Effect.void,
            observeClose: Effect.void,
            signalChild: Effect.fn("fixture.child")(() => Effect.void),
            signalPid: Effect.fn("fixture.pid")(() => Effect.void),
            signalGroup: Effect.fn("fixture.group")(() => Effect.void),
            signalTree: Effect.fn("fixture.tree")(() => Effect.void),
          },
        };
      })
    ),
  });
  const argumentsLayer = Layer.succeed(DownloadArguments, {
    download: Effect.fn("fixture.arguments")((options) => Effect.succeed([options.url])),
    videoInfo: Effect.fn("fixture.video")(() => Effect.succeed([])),
    playlistInfo: Effect.fn("fixture.playlist")(() => Effect.succeed([])),
    captions: Effect.fn("fixture.captions")(() => Effect.succeed([])),
  });
  const timing = Layer.succeed(DownloadTiming, {
    turn: Effect.fn("fixture.turn")(() => Effect.void),
    sleep: Effect.fn("fixture.sleep")(() => Effect.void),
  });
  const output = (event: Parameters<WrapperSink["emit"]>[0]) => {
    const sink = sinks[0];
    return sink === undefined ? Effect.die("No acquired sink") : sink.emit(event);
  };
  return {
    events,
    listenerFailure,
    output,
    layer: layer.pipe(Layer.provide(Layer.mergeAll(host, process, argumentsLayer, timing, NodePath.layer))),
  };
};

const success = fixture("normal");
testLayer(success.layer)("Core synchronous state and completion", (it) => {
  it.effect("publishes history before task and queue, preserving saved path and clones", () =>
    Effect.gen(function* () {
      const core = yield* Downloader;
      const task = yield* core.createDownload({
        url: "https://fixture.invalid/video",
        type: "video",
        tags: ["original"],
      });
      task.tags?.push("external");
      const current = yield* core.listDownloads;
      expect(current[0]?.tags).toEqual(["original"]);
      yield* success.output({ _tag: "stdout", chunk: new TextEncoder().encode("Destination: /fixture/saved.mp4\n") });
      yield* success.output({ _tag: "close", code: 0 });
      const history = yield* core.listHistory;
      expect(history[0]?.status).toBe("completed");
      expect(history[0]?.savedFileName).toBe("saved.mp4");
      expect(history[0]?.downloadPath).toBe("/fixture");
      expect(A.map(A.takeRight(success.events, 3), (event) => event.type)).toEqual([
        "history-updated",
        "task-updated",
        "queue-updated",
      ]);
      const observed1 = yield* core.getStatus;
      expect(observed1).toEqual({ active: 0, pending: 0 });
    })
  );
});

const cancelling = fixture("normal");
testLayer(cancelling.layer)("Core cancellation", (it) => {
  it.effect("acknowledges active cancellation before completion and removes pending work immediately", () =>
    Effect.gen(function* () {
      const core = yield* Downloader;
      const first = yield* core.createDownload({ url: "first", type: "video" });
      const second = yield* core.createDownload({ url: "second", type: "audio" });
      const observed2 = yield* core.getStatus;
      expect(observed2).toEqual({ active: 1, pending: 1 });
      const observed3 = yield* core.cancelDownload(second.id);
      expect(observed3).toBe(true);
      const observed4 = yield* core.cancelDownload(first.id);
      expect(observed4).toBe(true);
      const observed5 = yield* core.getStatus;
      expect(observed5).toEqual({ active: 1, pending: 0 });
      yield* cancelling.output({ _tag: "close", code: null });
      const observed6 = yield* core.getStatus;
      expect(observed6).toEqual({ active: 0, pending: 0 });
      const observed7 = yield* core.removeHistoryItems([first.id, second.id]);
      expect(observed7).toBe(2);
      const observed8 = yield* core.listHistory;
      expect(observed8).toEqual([]);
    })
  );
});

const acquisition = fixture("acquisition");
testLayer(acquisition.layer)("Core native acquisition failure", (it) => {
  it.effect("releases active state and records the native error without a spawn", () =>
    Effect.gen(function* () {
      const core = yield* Downloader;
      yield* core.createDownload({ url: "missing", type: "video" });
      const history = yield* core.listHistory;
      expect(history[0]?.status).toBe("error");
      expect(history[0]?.error).toContain("missing fixture");
      const observed9 = yield* core.getStatus;
      expect(observed9).toEqual({ active: 0, pending: 0 });
    })
  );
});

const listener = fixture("listener");
testLayer(listener.layer)("Core preserved callback failure", (it) => {
  it.effect("retains original defect identity and the characterized unbound-completion active entry", () =>
    Effect.gen(function* () {
      const core = yield* Downloader;
      const result = yield* Effect.exit(core.createDownload({ url: "callback", type: "video" }));
      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result)) expect(Cause.squash(result.cause)).toBe(listener.listenerFailure);
      const observed10 = yield* core.getStatus;
      expect(observed10).toEqual({ active: 1, pending: 0 });
      yield* listener.output({ _tag: "close", code: 0 });
      const observed11 = yield* core.getStatus;
      expect(observed11).toEqual({ active: 1, pending: 0 });
    })
  );
});
