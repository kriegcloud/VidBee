import { DownloadFiles } from "@vidbee/downloader-core/DownloadFiles.service";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as S from "effect/Schema";
import { CliHost } from "../CliHost.service.js";
import { CliVersion } from "../CliVersion.service.js";
import type { CliVersionInfo } from "../Upgrade.model.js";

export type { CliVersionInfo } from "../Upgrade.model.js";

const Package = S.Struct({ name: S.Literal("@vidbee/cli"), version: S.String });
const json = S.decodeEffect(S.fromJsonString(Package));
export const readVersionFiles = Effect.fn("readVersionFiles")(function* (candidates?: ReadonlyArray<string>) {
  const files = yield* DownloadFiles;
  let paths = candidates;
  if (paths === undefined) {
    const path = yield* Path.Path;
    const host = yield* CliHost;
    const here = yield* path.fromFileUrl(host.executingArtifactUrl).pipe(Effect.result);
    if (here._tag === "Failure") paths = [];
    else {
      const dir = path.dirname(here.success);
      paths = [
        path.resolve(dir, "..", "package.json"),
        path.resolve(dir, "..", "..", "package.json"),
        path.resolve(dir, "..", "..", "..", "package.json"),
      ];
    }
  }
  let version = "0.0.0-dev";
  for (const candidate of paths) {
    const parsed = yield* files.read(candidate).pipe(Effect.flatMap(json), Effect.option);
    if (parsed._tag === "Some") {
      version = parsed.value.version;
      break;
    }
  }
  return {
    cli: version,
    contract: version,
    changelog: "https://github.com/nexmoe/vidbee/blob/main/apps/cli/CHANGELOG.md",
  } satisfies CliVersionInfo;
});
export const readCliVersion = Effect.fn("readCliVersion")(function* (candidates?: ReadonlyArray<string>) {
  return yield* (yield* CliVersion).read(candidates);
});
