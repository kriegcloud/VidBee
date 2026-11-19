import * as NodePath from "@effect/platform-node/NodePath";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Str from "effect/String";
import { HostFailure } from "../src/Downloader.errors.js";
import { DownloadFiles } from "../src/DownloadFiles.service.js";
import { DownloadHost } from "../src/DownloadHost.service.js";
import { DownloadProcess } from "../src/DownloadProcess.service.js";
import { DownloadTimingLive } from "../src/DownloadTiming.service.js";
import { mapFacebookProfile } from "../src/facebook-profile-map.js";
import { finalizeProfile } from "../src/ProfileFinalization.js";
import { mapPinterestProfile } from "../src/pinterest-profile-map.js";
import { SocialInventoryCodecLive } from "../src/SocialInventoryCodec.service.js";
import { SocialTraversal } from "../src/SocialTraversal.service.js";
import { mapSnapchatProfile } from "../src/snapchat-profile-map.js";
import { SocialProfileManager, socialProfileManagerLayer } from "../src/social-profile-manager.js";
import { mapThreadsProfile } from "../src/threads-profile-map.js";
import { mapVscoProfile } from "../src/vsco-profile-map.js";
import type { ProcessSink } from "../src/DownloadProcess.service.js";
import type { ProcessSpec } from "../src/Process.model.js";

const fixture = (mode: string, onWrite?: (text: string) => void) => {
  const trace: string[] = [];
  const failure = HostFailure.make({ operation: mode, legacyMessage: mode });
  const files = Layer.succeed(DownloadFiles, {
    read: Effect.fn("fixture.read")(() => Effect.succeed("")),
    exists: Effect.fn("fixture.exists")(() => Effect.succeed(false)),
    stat: Effect.fn("fixture.stat")(() => Effect.succeed({ size: 1, isFile: true })),
    write: Effect.fn("fixture.write")(
      (_file: string, text: string): Effect.Effect<void, HostFailure> =>
        mode === "write" ? Effect.fail(failure) : Effect.sync(() => onWrite?.(text))
    ),
    makeDirectory: Effect.fn("fixture.makeDirectory")(() => Effect.void),
    makeTempDirectory: Effect.fn("fixture.makeTempDirectory")(() =>
      Effect.sync(() => {
        trace.push("directory");
        return "/tmp/threads-fixture";
      })
    ),
    rename: Effect.fn("fixture.rename")(() => Effect.void),
    readDirectory: Effect.fn("fixture.readDirectory")(() => Effect.succeed([])),
    remove: Effect.fn("fixture.remove")(() =>
      Effect.sync(() => {
        trace.push("remove");
      })
    ),
    chmod: Effect.fn("fixture.chmod")(() => Effect.void),
  });
  const host = Layer.succeed(DownloadHost, {
    platform: () => "linux",
    homeDirectory: () => "/tmp",
    tempDirectory: () => "/tmp",
    environment: () => ({}),
    setEnvironment: Effect.fn("fixture.setEnvironment")(() => Effect.void),
    makeAbortController: () => new AbortController(),
    uuid: () => "fixture",
  });
  const process = Layer.succeed(DownloadProcess, {
    start: Effect.fn("fixture.start")(function* (_spec: ProcessSpec, sink: ProcessSink) {
      trace.push("spawn");
      if (mode === "spawn") return yield* failure;
      if (mode === "interrupt") return yield* Effect.never;
      if (mode === "defect") return yield* Effect.die("fixture defect");
      yield* sink.emit({ _tag: "rawError", error: new Error("mapping failed") });
      return {
        _tag: "Acquired" as const,
        run: {
          pid: 1,
          writeStdin: (_bytes: Uint8Array) => Effect.void,
          observeClose: Effect.void,
          signalChild: Effect.fn("fixture.signalChild")(() => Effect.void),
          signalPid: Effect.fn("fixture.signalPid")(() => Effect.void),
          signalGroup: Effect.fn("fixture.signalGroup")(() => Effect.void),
          signalTree: Effect.fn("fixture.signalTree")(() => Effect.void),
        },
      };
    }),
  });
  const runtime = {
    resolveGalleryDlPath: () => "fixture",
    resolveYtDlpPath: () => "fixture",
    resolveGalleryDlArgs: () => [],
    admission: {
      acquire: Effect.fn("fixture.acquire")(() =>
        Effect.succeed(
          Effect.sync(() => {
            trace.push("release");
          })
        )
      ),
    },
  };
  return { trace, runtime, dependencies: Layer.mergeAll(files, host, process, NodePath.layer) };
};
for (const mode of ["spawn", "mapping", "write", "interrupt", "defect"]) {
  const f = fixture(mode);
  layer(f.dependencies)(`profile cleanup: ${mode}`, (it) => {
    it.effect("releases before removing the Threads directory on every exit", () =>
      Effect.gen(function* () {
        const signal = yield* Effect.abortSignal;
        const work = mapThreadsProfile(
          "https://www.threads.com/@fixture/media",
          "fixture",
          f.runtime,
          undefined,
          signal,
          () => Effect.void,
          { knownIds: ["1"] }
        );
        const fiber = yield* Effect.forkChild(work, { startImmediately: true });
        if (mode === "interrupt") yield* Fiber.interrupt(fiber);
        const exit = yield* Fiber.await(fiber);
        expect(Exit.isFailure(exit)).toBe(true);
        expect(f.trace.slice(-2)).toEqual(["release", "remove"]);
      })
    );
  });
}
for (const name of ["facebook", "pinterest", "snapchat", "vsco"]) {
  const f = fixture("spawn");
  layer(f.dependencies)(`${name} cleanup`, (it) => {
    it.effect("releases the lease on failed spawn", () =>
      Effect.gen(function* () {
        const signal = yield* Effect.abortSignal;
        const work =
          name === "facebook"
            ? mapFacebookProfile(
                "https://facebook.com/fixture",
                "photos",
                "fixture",
                f.runtime,
                undefined,
                signal,
                () => Effect.void
              )
            : name === "pinterest"
              ? mapPinterestProfile(
                  "https://pinterest.com/fixture",
                  "fixture",
                  f.runtime,
                  undefined,
                  signal,
                  () => Effect.void
                )
              : name === "snapchat"
                ? mapSnapchatProfile("fixture", "stories", f.runtime, undefined, signal, () => Effect.void)
                : mapVscoProfile(
                    "https://vsco.co/fixture/gallery",
                    "fixture",
                    f.runtime,
                    undefined,
                    signal,
                    () => Effect.void
                  );
        const exit = yield* Effect.exit(work);
        expect(Exit.isFailure(exit)).toBe(true);
        expect(f.trace.slice(-1)).toEqual(["release"]);
      })
    );
  });
}
layer(Layer.empty)("cleanup precedence", (it) => {
  it.effect("a cleanup failure replaces a body failure in both call forms", () =>
    Effect.gen(function* () {
      const work = Effect.fail("body");
      const cleanup = Effect.fail("cleanup");
      const first = yield* Effect.result(finalizeProfile(work, cleanup));
      const last = yield* Effect.result(work.pipe(finalizeProfile(cleanup)));
      expect(first).toEqual(last);
      expect(first).toMatchObject({ failure: "cleanup" });
    })
  );
});

const managerWrites: string[] = [];
const managerFixture = fixture("manager", (text) => {
  managerWrites.push(text);
});
let traversals = 0;
const synchronousTraversal = Layer.succeed(SocialTraversal, {
  map: Effect.fn("fixture.synchronousTraversal")(
    (request: {
      url: string;
    }): Effect.Effect<{ complete: boolean; authRequired?: boolean; error?: string | undefined }, HostFailure> => {
      if (Str.includes("failed")(request.url))
        return Effect.fail(HostFailure.make({ operation: "traversal", legacyMessage: "fixture failed" }));
      return Effect.sync(() => {
        traversals++;
        if (Str.includes("partial")(request.url)) {
          const result = { complete: false, error: undefined };
          Reflect.set(result, "error", null);
          return result;
        }
        if (Str.includes("authrequired")(request.url)) {
          const result = { complete: false, authRequired: false };
          Reflect.set(result, "authRequired", 7);
          return result;
        }
        return { complete: true };
      });
    }
  ),
});
const manager = socialProfileManagerLayer({ storageDir: "/inventory" }).pipe(
  Layer.provide(
    Layer.mergeAll(managerFixture.dependencies, synchronousTraversal, SocialInventoryCodecLive, DownloadTimingLive)
  )
);
layer(manager)("synchronous profile traversal", (it) => {
  it.effect("a completed traversal never leaves a busy active entry", () =>
    Effect.gen(function* () {
      const service = yield* SocialProfileManager;
      const url = "https://www.threads.com/@fixture/media";
      yield* service.mapAndWait(url, "media");
      yield* service.mapAndWait(url, "media");
      expect(traversals).toBe(2);
    })
  );
  it.effect("returns the mapping snapshot after starting the synchronous traversal", () =>
    Effect.gen(function* () {
      const service = yield* SocialProfileManager;
      const before = traversals;
      const snapshot = yield* service.map("https://www.threads.com/@snapshot/media", "media");
      expect(traversals).toBe(before + 1);
      expect(snapshot.categories.media?.state).toBe("mapping");
      expect(snapshot.categories.media?.error).toBeUndefined();
    })
  );

  it.effect("returns the mapping snapshot for synchronous failure without a stale active entry", () =>
    Effect.gen(function* () {
      const service = yield* SocialProfileManager;
      for (const attempt of [1, 2]) {
        const snapshot = yield* service.map(`https://www.threads.com/@failed${attempt}/media`, "media");
        expect(snapshot.categories.media?.state).toBe("mapping");
        expect(snapshot.categories.media?.error).toBeUndefined();
      }
    })
  );
  it.effect("retains optional-null errors and truthy authentication outcomes", () =>
    Effect.gen(function* () {
      const service = yield* SocialProfileManager;
      yield* service.map("https://www.threads.com/@partial/media", "media");
      expect(managerWrites.at(-1)).toContain('"state":"partial"');
      yield* service.map("https://www.threads.com/@authrequired/media", "media");
      expect(managerWrites.at(-1)).toContain('"state":"auth-required"');
    })
  );
});
