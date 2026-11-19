import * as NodePath from "@effect/platform-node/NodePath";
import { HostFailure } from "@vidbee/downloader-core/Downloader.errors";
import { DownloadFiles } from "@vidbee/downloader-core/DownloadFiles.service";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as MutableHashMap from "effect/MutableHashMap";
import * as O from "effect/Option";
import { CliHost } from "../../src/CliHost.service.js";
export const files = MutableHashMap.empty<string, string>();
export const reads: string[] = [];
export const writes: string[] = [];
export const environment = MutableHashMap.empty<string, string>();
export const failRead = HostFailure.make({
  operation: "read",
  legacyMessage: "fixture read failure",
  cause: new Error("fixture read failure"),
});
export const fixtureFiles = DownloadFiles.of({
  read: Effect.fn("fixture.read")((path) =>
    Effect.suspend(() => {
      reads.push(path);
      if (path === "/read-failure") return failRead;
      const value = MutableHashMap.get(files, path);
      return O.isSome(value) ? Effect.succeed(value.value) : failRead;
    })
  ),
  exists: Effect.fn("fixture.exists")((path) =>
    Effect.sync(() => path === "/read-failure" || MutableHashMap.has(files, path))
  ),
  stat: Effect.fn("fixture.stat")(() => Effect.succeed({ size: 1, isFile: true })),
  write: Effect.fn("fixture.write")((path, text) =>
    Effect.sync(() => {
      writes.push(path);
      MutableHashMap.set(files, path, text);
    })
  ),
  makeDirectory: Effect.fn("fixture.mkdir")(() => Effect.void),
  makeTempDirectory: Effect.fn("fixture.temp")(() => Effect.succeed("/fixture/temp")),
  rename: Effect.fn("fixture.rename")(() => Effect.void),
  readDirectory: Effect.fn("fixture.directory")(() => Effect.succeed([])),
  remove: Effect.fn("fixture.remove")((path) =>
    Effect.sync(() => {
      MutableHashMap.remove(files, path);
    })
  ),
  chmod: Effect.fn("fixture.chmod")(() => Effect.void),
});
export const fixtureHost = CliHost.of({
  platform: "linux",
  homeDirectory: "/fixture/home",
  executingArtifactUrl: new URL("file:///fixture/pkg/dist/index.mjs"),
  environment: Effect.fn("fixture.environment")((key) =>
    Effect.sync(() => O.getOrUndefined(MutableHashMap.get(environment, key)))
  ),
});
export const base = Layer.mergeAll(
  NodePath.layer,
  Layer.succeed(DownloadFiles, fixtureFiles),
  Layer.succeed(CliHost, fixtureHost)
);
export const descriptor = '{"version":1,"host":"localhost","port":1,"pid":123,"pidStartedAt":1}';
