import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import { requestLayer } from "@vidbee/task-queue/ProcessControl.driver";
import { ProcessRequests } from "@vidbee/task-queue/ProcessControl.service";
import * as A from "effect/Array";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import { DownloadArguments } from "../src/DownloadArguments.service.js";
import { Downloader } from "../src/Downloader.service.js";
import { DownloaderHost } from "../src/DownloaderHost.service.js";
import { DownloadTimingLive } from "../src/DownloadTiming.service.js";
import { layer as downloaderLayer } from "../src/downloader-core.js";
import { layer as processLayer } from "../src/Process.driver.js";
import { layer as wrapperLayer } from "../src/YtDlpProcess.layer.js";
import { pinnedNode } from "./fixtures/pinned-node.js";

class Fixture extends Context.Service<
  Fixture,
  {
    readonly ready: string;
    readonly term: string;
    readonly signals: string[];
  }
>()("@vidbee/downloader-core/test/review-core-cancel.effect.test/Fixture") {}
const waitFor = <E, R>(effect: Effect.Effect<boolean, E, R>) =>
  effect.pipe(
    Effect.tap(() => Effect.yieldNow),
    Effect.repeat({ until: (ready) => ready })
  );
for (const beforeAcquisition of [false, true]) {
  const controller = new AbortController();
  if (beforeAcquisition) controller.abort();
  const fixture = Layer.effect(
    Fixture,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      return { ready: `${dir}/ready`, term: `${dir}/term`, signals: [] };
    })
  ).pipe(Layer.provide(NodeServices.layer));
  const host = Layer.effect(
    DownloaderHost,
    Effect.gen(function* () {
      const state = yield* Fixture;
      const fs = yield* FileSystem.FileSystem;
      const node = yield* pinnedNode;
      const binary = `${state.ready}.cjs`;
      yield* fs.writeFileString(
        binary,
        `#!${node}\nconst fs=require('node:fs');const ready=__filename.slice(0,-4);process.on('SIGTERM',()=>{fs.writeFileSync(ready.replace(/ready$/,'term'),'TERM');process.exit(0)});fs.writeFileSync(ready,'ready');setInterval(()=>{},1000)\n`
      );
      yield* fs.chmod(binary, 0o755);
      return DownloaderHost.of({
        jsonSyntaxMessage: () => "Invalid yt-dlp metadata.",
        downloadDir: "/fixture",
        maxConcurrent: 1,
        runtimeSettings: {},
        jsRuntimeArgs: [],
        platform: "linux",
        initialize: Effect.succeed({ binary, ffmpeg: "/fixture/ffmpeg" }),
        now: () => 100,
        random: () => 0.5,
        uuid: () => "task",
        cancellation: Effect.sync(() => ({ signal: controller.signal, abort: Effect.sync(() => controller.abort()) })),
        lowerPriority: Effect.fn("fixture.priority")(() => Effect.void),
        emit: Effect.fn("fixture.emit")(() => Effect.void),
      });
    })
  );
  const signals = Layer.effect(
    ProcessRequests,
    Effect.gen(function* () {
      const requests = yield* ProcessRequests;
      const state = yield* Fixture;
      return ProcessRequests.of({
        pid: Effect.fn("fixture.pid")(function* (pid, signal) {
          state.signals.push(signal);
          yield* requests.pid(pid, signal);
        }),
        group: requests.group,
        tree: requests.tree,
      });
    })
  ).pipe(Layer.provide(requestLayer));
  const argumentsLayer = Layer.succeed(DownloadArguments, {
    download: Effect.fn("fixture.args")(() => Effect.succeed(["https://fixture.invalid/watch"])),
    videoInfo: Effect.fn("fixture.video")(() => Effect.succeed([])),
    playlistInfo: Effect.fn("fixture.playlist")(() => Effect.succeed([])),
    captions: Effect.fn("fixture.captions")(() => Effect.succeed([])),
  });
  const native = wrapperLayer.pipe(Layer.provide(processLayer), Layer.provide(signals));
  const deps = Layer.mergeAll(host, native, argumentsLayer, DownloadTimingLive).pipe(
    Layer.provideMerge(fixture),
    Layer.provideMerge(NodeServices.layer)
  );
  layer(downloaderLayer.pipe(Layer.provideMerge(deps)))(
    `core native cancellation: pre-acquisition=${beforeAcquisition}`,
    (it) => {
      it.effect("sends child TERM and settles cancelled without natural exit", () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const state = yield* Fixture;
          const core = yield* Downloader;
          const task = yield* core.createDownload({ url: "https://fixture.invalid/watch", type: "video" });
          if (!beforeAcquisition) {
            yield* waitFor(fs.exists(state.ready));
            yield* core.cancelDownload(task.id);
          }
          yield* waitFor(
            core.listHistory.pipe(
              Effect.map((items) => A.some(items, (item) => item.id === task.id && item.status === "cancelled"))
            )
          );
          expect(state.signals).toContain("SIGTERM");
          if (!beforeAcquisition) {
            const term = yield* fs.readFileString(state.term);
            expect(term).toBe("TERM");
          }
        }).pipe(Effect.timeout("5 seconds"))
      );
    }
  );
}
