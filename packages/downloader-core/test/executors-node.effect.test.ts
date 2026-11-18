import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import { requestLayer } from "@vidbee/task-queue/ProcessControl.driver";
import { TaskExecutor } from "@vidbee/task-queue/TaskExecutor.service";
import * as A from "effect/Array";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as PlatformError from "effect/PlatformError";
import * as Str from "effect/String";
import { HostFailure } from "../src/Downloader.errors.js";
import { DownloadFilesLive } from "../src/DownloadFiles.layer.js";
import { DownloadFiles } from "../src/DownloadFiles.service.js";
import { DownloadProcess } from "../src/DownloadProcess.service.js";
import { DownloadTimingLive } from "../src/DownloadTiming.service.js";
import { layer as galleryExecutor } from "../src/GalleryDlExecutor.layer.js";
import { GalleryDlExecutorHost } from "../src/GalleryDlExecutorHost.service.js";
import { layer as nativeProcess } from "../src/Process.driver.js";
import { layer as ytDlpExecutor } from "../src/YtDlpExecutor.layer.js";
import { YtDlpExecutorHost } from "../src/YtDlpExecutorHost.service.js";
import { layer as ytDlpProcess } from "../src/YtDlpProcess.layer.js";
import { pinnedNode } from "./fixtures/pinned-node.js";
import type { ExecutorEvent } from "@vidbee/task-queue/TaskExecutor.service";

const controller = new AbortController();
const preAbortedController = new AbortController();
const descendantController = new AbortController();
const cancelController = new AbortController();
const nonzeroCancelController = new AbortController();
preAbortedController.abort();
const host = Layer.effect(
  YtDlpExecutorHost,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const node = yield* pinnedNode;

    const directory = yield* fs.makeTempDirectoryScoped({ prefix: "vidbee-native-executor-" });
    const binary = `${directory}/yt-dlp`;
    yield* fs.writeFileString(
      binary,
      `#!${node}\nconst fs = require('node:fs'); const out = process.argv.at(-1); fs.writeFileSync(out, 'media'); process.stdout.write('[download]  100% of 5B\\n__VIDBEE_OUTPUT_PATH__:' + out + '\\n'); process.stderr.write('fixture stderr\\n'); const mode = process.argv[2]; if (mode === 'signal') process.kill(process.pid, 'SIGTERM'); else if (mode === 'cancel') { process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); } else if(mode === 'descendant') { require('node:child_process').spawn(process.execPath,['-e',"process.stdout.write('descendant-ready'+String.fromCharCode(10));setInterval(()=>{},1000)"],{stdio:['ignore','inherit','inherit']}).unref();process.exit(0); } else process.exitCode = mode === 'poststat-cancel' ? 0 : mode === 'cancel-nonzero' ? 7 : Number(mode);\n`
    );
    yield* fs.chmod(binary, 0o755);
    let selectedBinary = binary;
    let selectedController = controller;
    return YtDlpExecutorHost.of({
      now: () => 1000,
      killGraceMs: 0,
      platform: "linux",
      prepareSettings: undefined,
      command: Effect.fn("fixture.executorCommand")((input) =>
        Effect.sync(() => {
          selectedBinary = input.options?.fixtureMissing === true ? `${directory}/missing` : binary;
          selectedController =
            input.options?.fixturePreAbort === true
              ? preAbortedController
              : input.options?.fixtureExitCode === "descendant"
                ? descendantController
                : input.options?.fixtureExitCode === "cancel-nonzero"
                  ? nonzeroCancelController
                  : input.options?.fixtureExitCode === "cancel"
                    ? cancelController
                    : controller;
          return {
            args: [String(input.options?.fixtureExitCode ?? 0), `${directory}/${input.url}.mp4`],
            settings: {},
            initialSubtitleStatus: undefined,
            canRetryWithoutSubtitles: true,
          };
        })
      ),
      binary: Effect.sync(() => selectedBinary),
      ffmpeg: Effect.succeed("/fixture/ffmpeg"),
      cancellation: Effect.sync(() => ({
        signal: selectedController.signal,
        abort: Effect.sync(() => selectedController.abort()),
      })),
      lowerPriority: Effect.fn("fixture.priority")(() => Effect.void),
    });
  })
);
const ytInspectStarted = Deferred.makeUnsafe<void>();
const releaseYtInspect = Deferred.makeUnsafe<void>();
const filesWithGate = Layer.effect(
  DownloadFiles,
  Effect.gen(function* () {
    const files = yield* DownloadFiles;
    return DownloadFiles.of({
      ...files,
      stat: Effect.fn("fixture.gatedYtStat")((path) =>
        files
          .stat(path)
          .pipe(
            Effect.tap(() =>
              Str.includes("poststat-cancel")(path)
                ? Deferred.succeed(ytInspectStarted, undefined).pipe(Effect.andThen(Deferred.await(releaseYtInspect)))
                : Effect.void
            )
          )
      ),
    });
  })
).pipe(Layer.provide(DownloadFilesLive));
const processLayer = ytDlpProcess.pipe(Layer.provide(nativeProcess), Layer.provide(requestLayer));
const executorLayer = ytDlpExecutor.pipe(
  Layer.provide(Layer.mergeAll(host, filesWithGate, DownloadTimingLive, processLayer)),
  Layer.provide(NodeServices.layer)
);
layer(executorLayer)("native executor fake pinned Node executable", (it) => {
  for (const code of [
    0,
    7,
    "signal",
    "missing",
    "preabort-missing",
    "preabort",
    "poststat-cancel",
    "descendant",
    "cancel-nonzero",
    "cancel",
  ] as const) {
    it.effect(`yt-dlp numeric ${code} applies wrapper policy and finishes once`, () =>
      Effect.gen(function* () {
        const executor = yield* TaskExecutor;
        const finish = yield* Deferred.make<ExecutorEvent>();
        const events: ExecutorEvent[] = [];
        let handle: import("@vidbee/task-queue/TaskExecutor.service").ExecutorHandle | undefined;
        let cancelAcknowledged = false;
        handle = yield* executor.run(
          {
            taskId: `task${code}`,
            attemptId: "attempt",
            attemptNumber: 1,
            input: {
              kind: "video",
              url: `media${code}`,
              options: {
                fixtureExitCode: code,
                fixtureMissing: code === "missing" || code === "preabort-missing",
                fixturePreAbort: code === "preabort-missing" || code === "preabort",
              },
            },
          },
          {
            emit: Effect.fn("fixture.executorEvent")(function* (event) {
              events.push(event);
              if (
                (((code === "cancel" || code === "cancel-nonzero") && event.type === "progress") ||
                  (code === "descendant" && event.type === "std" && Str.includes("descendant-ready")(event.line))) &&
                handle !== undefined
              ) {
                yield* handle.cancel(0).pipe(Effect.orDie);
                cancelAcknowledged = true;
              }
              if (event.type === "finish") yield* Deferred.succeed(finish, event);
            }),
          }
        );
        if (code === "poststat-cancel") {
          yield* Deferred.await(ytInspectStarted);
          yield* handle.cancel(0).pipe(Effect.orDie);
          cancelAcknowledged = true;
          yield* Deferred.succeed(releaseYtInspect, undefined);
        }
        const result = yield* Deferred.await(finish);
        if (code === "missing" || code === "preabort-missing")
          expect(A.filter(events, (event) => event.type === "spawn")).toHaveLength(0);
        else {
          expect(events[0]?.type).toBe("spawn");
          if (code !== "preabort")
            expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ type: "progress" })]));
        }
        if (result.type !== "finish") return yield* Effect.die("expected finish event");
        if (code === 0)
          expect(result.result).toEqual({ type: "success", output: expect.objectContaining({ size: 5 }) });
        else if (
          code === "cancel" ||
          code === "preabort-missing" ||
          code === "descendant" ||
          code === "poststat-cancel" ||
          code === "preabort" ||
          code === "cancel-nonzero"
        ) {
          expect(result.result).toEqual({ type: "cancelled" });
          if (code === "cancel" || code === "descendant" || code === "poststat-cancel" || code === "cancel-nonzero")
            expect(cancelAcknowledged).toBe(true);
        } else
          expect(result.result).toEqual({
            type: "error",
            exitCode: null,
            error: expect.objectContaining({
              rawMessage: code === 7 ? expect.stringContaining("Error code: 7") : expect.any(String),
            }),
          });
        expect(A.filter(events, (event) => event.type === "finish")).toHaveLength(1);
      })
    );
  }
});

const galleryInspectStarted = Deferred.makeUnsafe<void>();
const releaseGalleryInspect = Deferred.makeUnsafe<void>();
const galleryHost = Layer.effect(
  GalleryDlExecutorHost,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const node = yield* pinnedNode;

    const directory = yield* fs.makeTempDirectoryScoped({ prefix: "vidbee-native-gallery-" });
    const binary = `${directory}/gallery-dl`;
    yield* fs.writeFileString(
      binary,
      `#!${node}\nconst fs = require('node:fs'); const out = process.argv.at(-1); fs.writeFileSync(out, 'media'); process.stdout.write('__VIDBEE_GDL__\\tprepare\\t' + out + '\\n__VIDBEE_GDL__\\tafter\\t' + out + '\\n'); process.stderr.write('fixture stderr\\n'); const mode = process.argv[2]; if (mode === 'signal') process.kill(process.pid, 'SIGTERM'); else if (mode === 'cancel') { process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); } else if(mode === 'descendant') { require('node:child_process').spawn(process.execPath,['-e',"process.stdout.write('descendant-ready'+String.fromCharCode(10));setInterval(()=>{},1000)"],{stdio:['ignore','inherit','inherit']}).unref();process.exit(0); } else process.exitCode = mode === 'poststat-cancel' ? 0 : mode === 'cancel-nonzero' ? 7 : Number(mode);\n`
    );
    yield* fs.chmod(binary, 0o755);
    let selectedBinary = binary;
    let preAbort = false;
    let holdInspection = false;
    return GalleryDlExecutorHost.of({
      now: () => 1000,
      killGraceMs: 0,
      platform: () => "linux",
      command: Effect.fn("fixture.galleryCommand")((ctx) =>
        Effect.sync(() => {
          selectedBinary = ctx.input.options?.fixtureMissing === true ? `${directory}/missing` : binary;
          preAbort = ctx.input.options?.fixturePreAbort === true;
          holdInspection = ctx.input.options?.fixtureExitCode === "poststat-cancel";
          return {
            args: [String(ctx.input.options?.fixtureExitCode ?? 0), `${directory}/${ctx.input.url}.jpg`],
            configuredOutputDirectory: directory,
            outputDirectory: directory,
            expectedAssetCount: 1,
            social: false,
            profileCategory: true,
            unsupported: false,
          };
        })
      ),
      binary: Effect.sync(() => selectedBinary),
      spec: Effect.fn("fixture.gallerySpec")((command, argv) =>
        Effect.succeed({
          command,
          argv,
          env: undefined,
          extendEnv: false,
          cwd: undefined,
          detached: true,
          windowsHide: true,
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
          abortSignal: preAbort ? preAbortedController.signal : undefined,
        })
      ),
      inspect: Effect.fn("fixture.galleryInspect")((paths) =>
        fs.stat(paths[0] ?? "").pipe(
          Effect.tap(() =>
            holdInspection
              ? Deferred.succeed(galleryInspectStarted, undefined).pipe(
                  Effect.andThen(Deferred.await(releaseGalleryInspect))
                )
              : Effect.void
          ),
          Effect.mapBoth({
            onSuccess: (info) => ({
              totalSize: Number(info.size),
              firstFileSize: Number(info.size),
              invalidCount: info.type === "File" ? 0 : 1,
            }),
            onFailure: (error) => HostFailure.make({ operation: "stat", cause: error, legacyMessage: error.message }),
          })
        )
      ),
      socialManifest: Effect.fn("fixture.unusedSocialManifest")(() =>
        Effect.succeed({ directory, manifest: "", isFile: false })
      ),
    });
  })
);
const galleryLayer = galleryExecutor.pipe(
  Layer.provide(Layer.mergeAll(galleryHost, DownloadTimingLive, nativeProcess.pipe(Layer.provide(requestLayer)))),
  Layer.provide(NodeServices.layer)
);
layer(galleryLayer)("native gallery fake pinned Node executable", (it) => {
  for (const code of [
    0,
    7,
    "signal",
    "missing",
    "preabort-missing",
    "preabort",
    "poststat-cancel",
    "descendant",
    "cancel-nonzero",
    "cancel",
  ] as const) {
    it.effect(`gallery numeric ${code} retains direct-spawn result policy`, () =>
      Effect.gen(function* () {
        const executor = yield* TaskExecutor;
        const finish = yield* Deferred.make<ExecutorEvent>();
        const events: ExecutorEvent[] = [];
        let handle: import("@vidbee/task-queue/TaskExecutor.service").ExecutorHandle | undefined;
        let cancelAcknowledged = false;
        handle = yield* executor.run(
          {
            taskId: `gallery${code}`,
            attemptId: "attempt",
            attemptNumber: 1,
            input: {
              kind: "instagram-profile-category",
              url: `media${code}`,
              options: {
                fixtureExitCode: code,
                fixtureMissing: code === "missing" || code === "preabort-missing",
                fixturePreAbort: code === "preabort-missing" || code === "preabort",
              },
            },
          },
          {
            emit: Effect.fn("fixture.galleryEvent")(function* (event) {
              events.push(event);
              if (
                (((code === "cancel" || code === "cancel-nonzero") && event.type === "progress") ||
                  (code === "descendant" && event.type === "std" && Str.includes("descendant-ready")(event.line))) &&
                handle !== undefined
              ) {
                yield* handle.cancel(0).pipe(Effect.orDie);
                cancelAcknowledged = true;
              }
              if (event.type === "finish") yield* Deferred.succeed(finish, event);
            }),
          }
        );
        if (code === "poststat-cancel") {
          yield* Deferred.await(galleryInspectStarted);
          yield* handle.cancel(0).pipe(Effect.orDie);
          cancelAcknowledged = true;
          yield* Deferred.succeed(releaseGalleryInspect, undefined);
        }
        const result = yield* Deferred.await(finish);
        if (code === "missing" || code === "preabort-missing")
          expect(A.filter(events, (event) => event.type === "spawn")).toHaveLength(0);
        else expect(events[0]?.type).toBe("spawn");
        if (result.type !== "finish") return yield* Effect.die("expected finish event");
        if (code === 0)
          expect(result.result).toEqual({
            type: "success",
            output: expect.objectContaining({ size: 5, fileCount: 1, downloadedCount: 1 }),
          });
        else if (
          code === "cancel" ||
          code === "descendant" ||
          code === "preabort-missing" ||
          code === "poststat-cancel" ||
          code === "preabort" ||
          code === "cancel-nonzero"
        ) {
          expect(result.result).toEqual({ type: "cancelled" });
          if (code !== "preabort-missing" && code !== "preabort") expect(cancelAcknowledged).toBe(true);
        } else
          expect(result.result).toEqual({
            type: "error",
            exitCode: code === 7 ? 7 : null,
            error: expect.objectContaining({ rawMessage: code === 7 ? "fixture stderr\n" : expect.any(String) }),
          });
        expect(A.filter(events, (event) => event.type === "finish")).toHaveLength(1);
      })
    );
  }
});

const failedHandle = PlatformError.badArgument({
  module: "ChildProcess",
  method: "read",
  description: "owned fixture stream failure",
});
for (const cancelled of [false, true]) {
  for (const kind of ["yt-dlp", "gallery"] as const) {
    const signals: string[] = [];
    const failedProcess = Layer.effect(
      DownloadProcess,
      Effect.gen(function* () {
        const scope = yield* Effect.scope;
        return DownloadProcess.of({
          start: Effect.fn("fixture.failedHandleStart")(function* (_spec, sink) {
            yield* Effect.forkIn(
              Effect.gen(function* () {
                yield* Effect.yieldNow;
                if (cancelled) yield* sink.abort;
                yield* sink.emit({
                  _tag: "complete",
                  outcome: { _tag: "Native", result: { _tag: "Failure", error: failedHandle } },
                });
              }),
              scope,
              { startImmediately: true }
            );
            return {
              _tag: "Acquired",
              run: {
                pid: 42,
                signalChild: Effect.fn("fixture.failureChildSignal")((signal) =>
                  Effect.sync(() => {
                    signals.push(`child:${signal}`);
                  })
                ),
                signalPid: Effect.fn("fixture.failurePidSignal")((signal) =>
                  Effect.sync(() => {
                    signals.push(`pid:${signal}`);
                  })
                ),
                signalGroup: Effect.fn("fixture.failureGroupSignal")((signal) =>
                  Effect.sync(() => {
                    signals.push(`group:${signal}`);
                  })
                ),
                signalTree: Effect.fn("fixture.failureTreeSignal")((signal) =>
                  Effect.sync(() => {
                    signals.push(`tree:${signal}`);
                  })
                ),
              },
            };
          }),
        });
      })
    );
    const configured =
      kind === "yt-dlp"
        ? ytDlpExecutor.pipe(
            Layer.provide(
              Layer.mergeAll(host, filesWithGate, DownloadTimingLive, ytDlpProcess.pipe(Layer.provide(failedProcess)))
            ),
            Layer.provide(NodeServices.layer)
          )
        : galleryExecutor.pipe(
            Layer.provide(Layer.mergeAll(galleryHost, DownloadTimingLive, failedProcess)),
            Layer.provide(NodeServices.layer)
          );
    layer(configured)(`${kind} native failed stream after cancellation=${cancelled}`, (it) => {
      it.effect("retains PlatformError message or cancellation and finishes once", () =>
        Effect.gen(function* () {
          const executor = yield* TaskExecutor;
          const finish = yield* Deferred.make<ExecutorEvent>();
          const events: ExecutorEvent[] = [];
          yield* executor.run(
            { taskId: "failure", attemptId: "attempt", attemptNumber: 1, input: { kind: "video", url: "failure" } },
            {
              emit: Effect.fn("fixture.failedStreamEvent")(function* (event) {
                events.push(event);
                if (event.type === "finish") yield* Deferred.succeed(finish, event);
              }),
            }
          );
          const result = yield* Deferred.await(finish);
          if (result.type !== "finish") return yield* Effect.die("expected finish event");
          if (cancelled) {
            expect(result.result).toEqual({ type: "cancelled" });
            if (kind === "yt-dlp") expect(signals).toEqual(expect.arrayContaining(["child:SIGTERM", "tree:SIGTERM"]));
            else expect(signals).toContain("group:SIGTERM");
          } else
            expect(result.result).toEqual({
              type: "error",
              exitCode: null,
              error: expect.objectContaining({ rawMessage: expect.stringContaining(failedHandle.message) }),
            });
          expect(A.filter(events, (event) => event.type === "finish")).toHaveLength(1);
        })
      );
    });
  }
}
