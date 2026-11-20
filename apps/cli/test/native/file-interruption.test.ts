import * as NodePath from "@effect/platform-node/NodePath";
import { expect, layer } from "@effect/vitest";
import { DownloadFiles } from "@vidbee/downloader-core/DownloadFiles.service";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import { CliDescriptorLive } from "../../src/CliDescriptor.layer.js";
import { CliDescriptor } from "../../src/CliDescriptor.service.js";
import { CliHost } from "../../src/CliHost.service.js";
import { CliUpgradeLive, CliVersionLive } from "../../src/CliInfo.layer.js";
import { CliRegistry } from "../../src/CliRegistry.service.js";
import { CliUpgrade } from "../../src/CliUpgrade.service.js";
import { CliVersion } from "../../src/CliVersion.service.js";
import { descriptor, fixtureFiles, fixtureHost } from "./fixtures.js";

let stopAt = "";
let released = 0;
let reached: Deferred.Deferred<void> | undefined;
const hold = <A, E, R>(name: string, work: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.suspend(() => {
    if (name !== stopAt) return work;
    return Effect.acquireUseRelease(
      Effect.void,
      () =>
        Effect.suspend(() => {
          if (reached !== undefined) Deferred.doneUnsafe(reached, Effect.void);
          return Effect.never;
        }),
      () =>
        Effect.sync(() => {
          released++;
        })
    );
  });
const dependencies = Layer.mergeAll(
  NodePath.layer,
  Layer.succeed(CliHost, {
    ...fixtureHost,
    environment: Effect.fn("fixture.environment")(() => hold("environment", Effect.undefined)),
  }),
  Layer.succeed(DownloadFiles, {
    ...fixtureFiles,
    exists: Effect.fn("fixture.exists")(() => hold("exists", Effect.succeed(true))),
    read: Effect.fn("fixture.read")((path) =>
      hold(
        path,
        Effect.succeed(
          path === "/descriptor" ? descriptor : path === "/package" ? '{"name":"@vidbee/cli","version":"0.1.0"}' : "{}"
        )
      )
    ),
    makeDirectory: Effect.fn("fixture.mkdir")(() => hold("mkdir", Effect.void)),
    write: Effect.fn("fixture.write")(() => hold("write", Effect.void)),
  }),
  Layer.succeed(CliRegistry, { latest: hold("registry", Effect.succeed({ version: "2.0", fetchedAt: 1000 })) })
);
layer(Layer.mergeAll(CliDescriptorLive, CliVersionLive, CliUpgradeLive).pipe(Layer.provide(dependencies)))((it) => {
  for (const point of ["environment", "exists", "/descriptor", "/package", "/cache", "registry", "mkdir", "write"]) {
    it.effect(`interruption releases the suspended ${point} capability before continuing`, () =>
      Effect.gen(function* () {
        const descriptor = yield* CliDescriptor;
        const version = yield* CliVersion;
        const upgrade = yield* CliUpgrade;
        reached = yield* Deferred.make<void>();
        stopAt = point;
        const before = released;
        const operation =
          point === "environment"
            ? descriptor.path()
            : point === "exists" || point === "/descriptor"
              ? descriptor.read({ pathOverride: "/descriptor" })
              : point === "/package"
                ? version.read(["/package"])
                : upgrade.check({ current: "1.0", cachePath: "/cache", force: point !== "/cache" });
        const running = yield* operation.pipe(Effect.forkScoped);
        yield* Deferred.await(reached);
        yield* Fiber.interrupt(running);
        expect(released).toBe(before + 1);
        stopAt = "";
        reached = undefined;
      })
    );
  }
});
