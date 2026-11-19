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

/**
 * Resolve the first `node` on PATH that reports the pinned version. `bunx --bun` puts Bun's own
 * `node` alias first on PATH, so the first entry is not necessarily Node: entries that report
 * another version, or none, are skipped, and the first of them is named when nothing matches.
 */
export const pinnedNode = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const searchPath = yield* Config.String("PATH").pipe(Config.withDefault(""));
  const separator = process.platform === "win32" ? ";" : ":";
  const executable = process.platform === "win32" ? "node.exe" : "node";
  let rejected: { readonly candidate: string; readonly detail: string } | undefined;
  for (const directory of Str.split(separator)(searchPath)) {
    if (directory === "") continue;
    const candidate = path.resolve(directory, executable);
    if (!(yield* fs.access(candidate).pipe(Effect.isSuccess))) continue;
    const observed = yield* Effect.result(spawner.string(ChildProcess.make(candidate, ["--version"])));
    const version = Result.isSuccess(observed) ? Str.trim(observed.success) : "";
    if (version === requiredVersion) return candidate;
    rejected ??= {
      candidate,
      detail: Result.isFailure(observed)
        ? observed.failure.message
        : `Expected ${requiredVersion}; observed ${version === "" ? "empty version output" : version}`,
    };
  }
  return yield* NodePrerequisite.make(
    rejected ?? { candidate: "PATH", detail: `Missing required Node ${requiredVersion}` }
  );
});
