import * as NodePath from "@effect/platform-node/NodePath";
import { expect, layer } from "@effect/vitest";
import { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import { TaskExecutor } from "@vidbee/task-queue/TaskExecutor.service";
import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { BrowserProfiles } from "../src/BrowserProfiles.service.js";
import { CaptureFiles } from "../src/CaptureFiles.service.js";
import { CaptureHost } from "../src/CaptureHost.service.js";
import { CaptureTimers } from "../src/CaptureTimers.service.js";
import { onlyFansAdapter } from "../src/onlyfans-profile.js";
import { ProfileExecutorLive } from "../src/ProfileExecutor.layer.js";
import { ProfileExecutorOptions } from "../src/ProfileExecutor.service.js";
import { ProfileExecutorNativeDependencies } from "../src/ProfileExecutorNative.layer.js";
import type { ExecutorContext } from "@vidbee/task-queue/Executor.model";
import type { ExecutorEvent } from "@vidbee/task-queue/TaskExecutor.service";
import type { TransferSink } from "../src/BrowserProfiles.service.js";

const unused = Effect.die("unexpected fixture operation");
const context: ExecutorContext = {
  taskId: "task",
  attemptId: "attempt",
  attemptNumber: 1,
  input: {
    kind: "video",
    url: "https://onlyfans.com/fixture",
    options: { onlyFansProfile: "https://onlyfans.com/fixture", onlyFansMediaId: "1" },
  },
};
const makeFixture = (mode: "ordinary" | "finish-throw" | "cancel") => {
  const events: Array<ExecutorEvent> = [];
  let observedAbort = false;
  let successThrown = false;
  const files = Layer.succeed(CaptureFiles, {
    readText: Effect.fn("fixture.readText")(() => unused),
    readBytes: Effect.fn("fixture.readBytes")(() => unused),
    exists: Effect.fn("fixture.exists")(() => unused),
    stat: Effect.fn("fixture.stat")(() => unused),
    list: Effect.fn("fixture.list")(() => unused),
    mkdir: Effect.fn("fixture.mkdir")(() => unused),
    tempDirectory: Effect.fn("fixture.tempDirectory")(() => unused),
    copy: Effect.fn("fixture.copy")(() => unused),
    write: Effect.fn("fixture.write")(() => unused),
    rename: Effect.fn("fixture.rename")(() => unused),
    remove: Effect.fn("fixture.remove")(() => unused),
  });
  const profiles = Layer.succeed(BrowserProfiles, {
    get: Effect.fn("fixture.get")(() => unused),
    list: unused,
    command: Effect.fn("fixture.command")(() => unused),
    enqueue: Effect.fn("fixture.enqueue")(() => unused),
    stop: Effect.void,
    download: Effect.fn("fixture.download")(function* (
      _profile: string,
      _media: string,
      _destination: string,
      signal: AbortSignal,
      sink: TransferSink
    ) {
      observedAbort = signal.aborted;
      yield* sink.emit(1, Number.POSITIVE_INFINITY);
      yield* sink.emit(-0, -1);
      return { filePath: "/fixture/result.mp4", size: 3 };
    }),
  });
  const options = Layer.succeed(ProfileExecutorOptions, {
    adapter: onlyFansAdapter,
    defaultDirectory: Effect.succeed("/fixture/downloads"),
    fallback: { run: Effect.fn("fixture.run")(() => unused) },
  });
  const host = Layer.succeed(CaptureHost, {
    available: unused,
    browser: Effect.fn("fixture.browser")(() => unused),
    xvfb: unused,
    pactl: unused,
    displayNumber: unused,
    probeDisplay: Effect.fn("fixture.probeDisplay")(() => unused),
    snapshot: Effect.succeed({
      platform: "fixture",
      home: "/fixture",
      temp: "/fixture",
      execPath: "/fixture/node",
      pid: 42,
      environment: {},
    }),
    makeAbortController: () => new AbortController(),
  });
  const timers = Layer.succeed(CaptureTimers, {
    now: Effect.succeed(1000),
    sleep: Effect.fn("fixture.sleep")(() => unused),
    defer: Effect.fn("fixture.defer")(() => unused),
    after: Effect.fn("fixture.after")(() => unused),
  });
  const dependencies = ProfileExecutorNativeDependencies.pipe(Layer.provide(Layer.merge(profiles, options)));
  return {
    layer: ProfileExecutorLive.pipe(
      Layer.provide(Layer.mergeAll(dependencies, host, timers, files, NodePath.layer, LegacyTiming.layer))
    ),
    events,
    aborted: () => observedAbort,
    emit: Effect.fn("fixture.emit")((event: ExecutorEvent) =>
      Effect.sync(() => {
        events.push(event);
        if (mode === "finish-throw" && event.type === "finish" && event.result.type === "success" && !successThrown) {
          successThrown = true;
          throw new Error("finish sentinel");
        }
      })
    ),
  };
};
{
  const h = makeFixture("ordinary");
  layer(h.layer)((it) => {
    it.effect("native profile executor retains undecoded transfer arithmetic and completion", () =>
      Effect.gen(function* () {
        const executor = yield* TaskExecutor;
        const handle = yield* executor.run(context, { emit: h.emit });
        yield* Effect.yieldNow;
        yield* handle.pause;
        expect(A.map(h.events, (event) => event.type)).toEqual(["spawn", "progress", "progress", "finish"]);
        const first = h.events[1];
        const second = h.events[2];
        expect(first?.type === "progress" && first.progress.bytesTotal).toBe(Number.POSITIVE_INFINITY);
        expect(first?.type === "progress" && first.progress.percent).toBe(0);
        expect(second?.type === "progress" && Object.is(second.progress.bytesDownloaded, -0)).toBe(true);
        expect(second?.type === "progress" && Object.is(second.progress.percent, 0)).toBe(true);
      })
    );
  });
}
{
  const h = makeFixture("finish-throw");
  layer(h.layer)((it) => {
    it.effect("native profile executor catches a successful finish callback defect and attempts finish again", () =>
      Effect.gen(function* () {
        const executor = yield* TaskExecutor;
        const handle = yield* executor.run(context, { emit: h.emit });
        yield* Effect.yieldNow;
        yield* handle.pause;
        const finishes = A.filter(h.events, (event) => event.type === "finish");
        expect(finishes).toHaveLength(2);
        const last = finishes[1];
        expect(last?.result.type === "error" && last.result.error.rawMessage).toBe("finish sentinel");
      })
    );
  });
}
{
  const h = makeFixture("cancel");
  layer(h.layer)((it) => {
    it.effect("native controls can abort the attempt before its asynchronous start", () =>
      Effect.gen(function* () {
        const executor = yield* TaskExecutor;
        const handle = yield* executor.run(context, { emit: h.emit });
        yield* handle.cancel();
        expect(h.aborted()).toBe(true);
        // The original manager may succeed despite an already-aborted signal.
        expect(h.events.at(-1)?.type).toBe("finish");
      })
    );
  });
}
