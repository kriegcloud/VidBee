import { expect, layer } from "@effect/vitest";
import * as ByteSize from "effect/ByteSize";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as Result from "effect/Result";
import { layer as outputLayer } from "../src/OutputProbe.layer.js";
import { OutputProbe } from "../src/OutputProbe.service.js";
import { layer as processLayer } from "../src/ProcessControl.driver.js";
import { ProcessControl } from "../src/ProcessControl.service.js";
import { layer as randomLayer } from "../src/QueueRandom.layer.js";
import { QueueRandom } from "../src/QueueRandom.service.js";
import { layer as executorLayer } from "../src/TaskExecutor.layer.js";
import { TaskExecutor } from "../src/TaskExecutor.service.js";

const fs = FileSystem.makeNoop({
  exists: Effect.fn("fixture.exists")((path: string) => Effect.succeed(path !== "missing")),
  stat: Effect.fn("fixture.stat")((path: string) =>
    Effect.succeed({
      type: "File" as const,
      mtime: Option.none(),
      atime: Option.none(),
      birthtime: Option.none(),
      dev: 1n,
      ino: Option.none(),
      mode: 0o644,
      nlink: Option.none(),
      uid: Option.none(),
      gid: Option.none(),
      rdev: Option.none(),
      size: ByteSize.bytes(path === "empty" ? 0 : 1),
      blksize: Option.none(),
      blocks: Option.none(),
    })
  ),
  readFileString: Effect.fn("fixture.readFileString")((path: string) =>
    Effect.succeed(
      path === "/proc/stat" ? "btime 1000\n" : "42 (worker name) S 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 250"
    )
  ),
});
const fakeSpawner = ChildProcessSpawner.make(Effect.fn("fixture.spawn")(() => Effect.die("unexpected spawn")));
const spawner = Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, {
  ...fakeSpawner,
  string: Effect.fn("fixture.commandString")(() => Effect.succeed("100")),
});
const hostLayers = Layer.mergeAll(Layer.succeed(FileSystem.FileSystem, fs), spawner);
const handle = { cancel: Effect.fn("fixture.cancel")(() => Effect.void), pause: Effect.void };
let selected = "";
const defaultExecutor = TaskExecutor.of({
  run: Effect.fn("fixture.defaultRun")(() =>
    Effect.sync(() => {
      selected = "default";
      return handle;
    })
  ),
});
const subtitleExecutor = TaskExecutor.of({
  run: Effect.fn("fixture.subtitleRun")(() =>
    Effect.sync(() => {
      selected = "subtitle";
      return handle;
    })
  ),
});
const router = executorLayer({ defaultExecutor, byKind: { subtitles: subtitleExecutor } });
layer(
  Layer.mergeAll(
    outputLayer.pipe(Layer.provide(hostLayers)),
    processLayer.pipe(Layer.provide(hostLayers)),
    randomLayer,
    router
  )
)((it) => {
  it.effect("native output probe requires an existing nonempty path", () =>
    Effect.gen(function* () {
      const probe = yield* OutputProbe;
      const present = yield* probe.filePresent("present");
      const empty = yield* probe.filePresent("empty");
      const missing = yield* probe.filePresent("missing");
      expect([present, empty, missing]).toEqual([true, false, false]);
    })
  );
  it.effect("native random exposes bounded numbers and lowercase v4 UUIDs", () =>
    Effect.gen(function* () {
      const random = yield* QueueRandom;
      const n = yield* random.next;
      const uuid = yield* random.uuid;
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    })
  );
  it.effect("router honors explicit kinds, default downloads and unsupported work", () =>
    Effect.gen(function* () {
      const executor = yield* TaskExecutor;
      const sink = { emit: Effect.fn("fixture.emit")(() => Effect.void) };
      yield* executor.run(
        { taskId: "video", attemptId: "a", attemptNumber: 1, input: { kind: "video", url: "https://example.com" } },
        sink
      );
      expect(selected).toBe("default");
      yield* executor.run(
        {
          taskId: "subtitle",
          attemptId: "a",
          attemptNumber: 1,
          input: { kind: "subtitles", url: "https://example.com" },
        },
        sink
      );
      expect(selected).toBe("subtitle");
      const unsupported = yield* executor
        .run(
          { taskId: "asr", attemptId: "a", attemptNumber: 1, input: { kind: "transcription", url: "file:///source" } },
          sink
        )
        .pipe(Effect.result);
      expect(Result.isFailure(unsupported)).toBe(true);
      if (Result.isFailure(unsupported))
        expect(unsupported.failure.legacyMessage).toBe("This host has no executor for transcription tasks");
    })
  );
  it.effect("Linux process identity parses parenthesized names and CLK_TCK without signaling", () =>
    Effect.gen(function* () {
      if (process.platform !== "linux") return;
      const control = yield* ProcessControl;
      const started = yield* control.startTime(42);
      expect(started).toBe(1002500);
      const alive = yield* control.isAlive(42);
      expect(alive).toBe(true);
      yield* control.kill(0, "SIGTERM");
    })
  );
});
