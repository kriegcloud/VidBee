import * as NodePath from "@effect/platform-node/NodePath";
import { expect, layer } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as HashMap from "effect/HashMap";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { HostFailure } from "../src/Downloader.errors.js";
import { DownloadFiles } from "../src/DownloadFiles.service.js";
import { DownloadHost } from "../src/DownloadHost.service.js";
import { DownloadProcess } from "../src/DownloadProcess.service.js";
import { DownloadTimingLive } from "../src/DownloadTiming.service.js";
import {
  InstagramProfileInspector,
  instagramInspectionId,
  instagramProfileInspectorLayer,
} from "../src/instagram-profile.js";
import { mapRedGifsProfile } from "../src/redgifs-profile-service.js";
import type { ProcessSink } from "../src/DownloadProcess.service.js";

class Fixture extends Context.Service<
  Fixture,
  {
    files: HashMap.HashMap<string, string>;
    calls: string[];
    sinks: ProcessSink[];
    signals: string[];
    failRename: boolean;
    now: number;
  }
>()("@vidbee/downloader-core/test/services.effect.test/Fixture") {}
const fixtureLayer = Layer.sync(Fixture, () => ({
  files: HashMap.empty(),
  calls: [],
  sinks: [],
  signals: [],
  failRename: false,
  now: 1000,
}));
const filesLayer = Layer.effect(
  DownloadFiles,
  Effect.map(Fixture, (state) =>
    DownloadFiles.of({
      read: Effect.fn("fixture.read")((file) =>
        Effect.suspend(() => {
          const text = HashMap.get(state.files, file);
          return Effect.fromOption(text).pipe(
            Effect.mapError(() =>
              HostFailure.make({ operation: "read", legacyMessage: "missing", cause: { code: "ENOENT" } })
            )
          );
        })
      ),
      exists: Effect.fn("fixture.exists")((file) => Effect.sync(() => HashMap.has(state.files, file))),
      stat: Effect.fn("fixture.stat")(() => Effect.succeed({ size: 1, isFile: true })),
      write: Effect.fn("fixture.write")((file, text) =>
        Effect.sync(() => {
          state.calls.push(`write:${file}`);
          state.files = HashMap.set(state.files, file, text);
        })
      ),
      makeDirectory: Effect.fn("fixture.mkdir")(() => Effect.void),
      makeTempDirectory: Effect.fn("fixture.mkdtemp")((prefix) => Effect.succeed(`${prefix}fixture`)),
      rename: Effect.fn("fixture.rename")((source, target) =>
        Effect.suspend(() => {
          state.calls.push(`rename:${source}:${target}`);
          if (state.failRename)
            return Effect.fail(HostFailure.make({ operation: "rename", legacyMessage: "rename rejected" }));
          const value = HashMap.get(state.files, source);
          if (Option.isSome(value)) state.files = HashMap.set(HashMap.remove(state.files, source), target, value.value);
          return Effect.void;
        })
      ),
      readDirectory: Effect.fn("fixture.readdir")(() => Effect.succeed([])),
      remove: Effect.fn("fixture.remove")(() => Effect.void),
      chmod: Effect.fn("fixture.chmod")(() => Effect.void),
    })
  )
);
const hostLayer = Layer.effect(
  DownloadHost,
  Effect.map(Fixture, () =>
    DownloadHost.of({
      platform: () => "linux",
      homeDirectory: () => "/home/fixture",
      tempDirectory: () => "/tmp",
      environment: () => ({}),
      uuid: () => "fixed-uuid",
      makeAbortController: () => new AbortController(),
      setEnvironment: Effect.fn("fixture.environment")(() => Effect.void),
    })
  )
);
const processLayer = Layer.effect(
  DownloadProcess,
  Effect.map(Fixture, (state) =>
    DownloadProcess.of({
      start: Effect.fn("fixture.start")((_spec, sink) =>
        Effect.sync(() => {
          state.sinks.push(sink);
          return {
            _tag: "Acquired" as const,
            run: {
              pid: 1,
              writeStdin: (_bytes: Uint8Array) => Effect.void,
              observeClose: Effect.void,
              signalChild: Effect.fn("fixture.child")((signal) =>
                Effect.sync(() => {
                  state.signals.push(signal);
                })
              ),
              signalPid: Effect.fn("fixture.pid")(() => Effect.void),
              signalGroup: Effect.fn("fixture.group")(() => Effect.void),
              signalTree: Effect.fn("fixture.tree")(() => Effect.void),
            },
          };
        })
      ),
    })
  )
);
const dependencies = Layer.mergeAll(filesLayer, hostLayer, processLayer, NodePath.layer, DownloadTimingLive).pipe(
  Layer.provideMerge(fixtureLayer)
);
const inspector = instagramProfileInspectorLayer({
  storageDir: "/inventory",
  resolveBinaryPath: () => "fake",
  clock: () => 1000,
}).pipe(Layer.provideMerge(dependencies));

layer(inspector)((it) => {
  it.effect("keeps the cached inspection and generated temporary file when rename fails", () =>
    Effect.gen(function* () {
      const state = yield* Fixture;
      const service = yield* InstagramProfileInspector;
      state.failRename = true;
      const result = yield* service.inspect("https://instagram.com/fixture", undefined, []).pipe(Effect.result);
      expect(Result.isFailure(result)).toBe(true);
      const cached = yield* service.get(instagramInspectionId("fixture"));
      const temporary = state.calls[0];
      expect(temporary).toContain(".fixed-uuid.tmp");
      const listed = yield* service.list;
      expect(listed).toHaveLength(1);
      expect(listed[0]?.profile.username).toBe("fixture");
      expect(cached?.inspection.profile.username).toBe("fixture");
      state.failRename = false;
    })
  );
});

layer(dependencies)((it) => {
  it.effect("flushes a final unterminated Redgifs item at stdout end before close", () =>
    Effect.gen(function* () {
      const state = yield* Fixture;
      const delivered = yield* Deferred.make<void>();
      const seen: string[] = [];
      const host = yield* DownloadHost;
      const controller = host.makeAbortController();
      const fiber = yield* mapRedGifsProfile(
        "https://www.redgifs.com/users/fixture",
        () => "fake",
        undefined,
        controller.signal,
        Effect.fn("test.item")((item) =>
          Effect.sync(() => {
            seen.push(item.id);
          }).pipe(Effect.andThen(Deferred.succeed(delivered, undefined)), Effect.asVoid)
        )
      ).pipe(Effect.forkChild({ startImmediately: true }));
      const sink = state.sinks[state.sinks.length - 1];
      if (sink === undefined) return yield* Effect.die("missing process sink");
      yield* sink.emit({
        _tag: "stdout",
        chunk: new TextEncoder().encode('{"extractor_key":"RedGifs","id":"ExamplePost"}'),
      });
      expect(seen).toEqual([]);
      yield* sink.emit({ _tag: "stdoutEnd" });
      yield* Deferred.await(delivered);
      expect(seen).toEqual(["ExamplePost"]);
      expect(fiber.pollUnsafe()).toBeUndefined();
      yield* sink.emit({ _tag: "rawExit", code: 0, signal: null });
      yield* sink.emit({ _tag: "complete", outcome: { _tag: "Raw", code: 0, signal: null, killed: false } });
      const completed = yield* Fiber.join(fiber);
      expect(completed).toEqual({ complete: true });
      expect(state.signals).toEqual([]);
    })
  );
  it.effect("rejects JSON null at stdout end and sends TERM before child close", () =>
    Effect.gen(function* () {
      const state = yield* Fixture;
      const host = yield* DownloadHost;
      const controller = host.makeAbortController();
      const fiber = yield* mapRedGifsProfile(
        "https://www.redgifs.com/users/fixture",
        () => "fake",
        undefined,
        controller.signal,
        Effect.fn("test.noItem")(() => Effect.void)
      ).pipe(Effect.result, Effect.forkChild({ startImmediately: true }));
      const sink = state.sinks[state.sinks.length - 1];
      if (sink === undefined) return yield* Effect.die("missing process sink");
      yield* sink.emit({ _tag: "stdout", chunk: new TextEncoder().encode("null") });
      yield* sink.emit({ _tag: "stdoutEnd" });
      const failure = yield* Fiber.join(fiber);
      expect(Result.isFailure(failure)).toBe(true);
      if (Result.isFailure(failure)) {
        expect(failure.failure.cause).toBeInstanceOf(TypeError);
        expect(failure.failure.legacyMessage).toBe("Cannot read properties of null (reading 'id')");
      }
      expect(state.signals).toEqual(["SIGTERM"]);
    })
  );
});
