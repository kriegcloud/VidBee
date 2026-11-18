import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as Result from "effect/Result";
import * as S from "effect/Schema";
import * as Str from "effect/String";

class NodePrerequisite extends S.TaggedError<NodePrerequisite, { readonly brand: unique symbol }>(
  "@vidbee/downloader-core/test/fixtures/pinned-node/NodePrerequisite"
)("NodePrerequisite", { candidate: S.String, detail: S.String }) {}

const requiredVersion = "v22.23.4";

/** Resolve the PATH-selected Node first; only the local Vite shim needs the optional mise fallback. */
export const pinnedNode = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const searchPath = yield* Config.String("PATH").pipe(Config.withDefault(""));
  const separator = process.platform === "win32" ? ";" : ":";
  const executable = process.platform === "win32" ? "node.exe" : "node";
  let candidate: string | undefined;
  for (const directory of Str.split(separator)(searchPath)) {
    if (directory === "") continue;
    const location = path.resolve(directory, executable);
    if (yield* fs.access(location).pipe(Effect.isSuccess)) {
      candidate = location;
      break;
    }
  }
  if (candidate === undefined)
    return yield* NodePrerequisite.make({ candidate: "PATH", detail: `Missing required Node ${requiredVersion}` });
  const observed = yield* Effect.result(spawner.string(ChildProcess.make(candidate, ["--version"])));
  if (Result.isFailure(observed)) return yield* NodePrerequisite.make({ candidate, detail: observed.failure.message });
  const version = Str.trim(observed.success);
  if (version === requiredVersion) return candidate;
  const resolved = yield* fs.realPath(candidate).pipe(Effect.orElseSucceed(() => candidate));
  if (version !== "" || !Str.includes("vite-plus")(resolved))
    return yield* NodePrerequisite.make({
      candidate,
      detail: `Expected ${requiredVersion}; observed ${version === "" ? "empty version output" : version}`,
    });
  const fallback = yield* Effect.result(
    spawner.string(ChildProcess.make("mise", ["--cd", "/tmp", "where", "node@22.23.4"]))
  );
  if (Result.isFailure(fallback))
    return yield* NodePrerequisite.make({
      candidate,
      detail: `Vite Node shim produced empty version output; optional local mise fallback failed: ${fallback.failure.message}`,
    });
  const fallbackDirectory = Str.trim(fallback.success);
  if (fallbackDirectory === "")
    return yield* NodePrerequisite.make({
      candidate,
      detail: "Vite Node shim produced empty version output; optional local mise fallback returned no installation",
    });
  const fallbackNode = path.resolve(fallbackDirectory, "bin", executable);
  const verified = yield* Effect.result(spawner.string(ChildProcess.make(fallbackNode, ["--version"])));
  if (Result.isFailure(verified))
    return yield* NodePrerequisite.make({ candidate: fallbackNode, detail: verified.failure.message });
  if (Str.trim(verified.success) !== requiredVersion)
    return yield* NodePrerequisite.make({
      candidate: fallbackNode,
      detail: `Expected ${requiredVersion}; observed ${Str.trim(verified.success)}`,
    });
  return fallbackNode;
});
