import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CliRegistry } from "./CliRegistry.service.js";
import { CliUpgrade } from "./CliUpgrade.service.js";
import { CliVersion } from "./CliVersion.service.js";
import { checkUpgradeFiles, defaultCachePath, fetchRegistry } from "./local-info/upgrade.js";
import { readVersionFiles } from "./local-info/version.js";
import type { DownloadFiles } from "@vidbee/downloader-core/DownloadFiles.service";
import type * as HttpClient from "effect/http/HttpClient";
import type * as Path from "effect/Path";
import type { CliHost } from "./CliHost.service.js";
export const CliVersionLive = Layer.effect(
  CliVersion,
  Effect.gen(function* () {
    const dependencies = yield* Effect.context<DownloadFiles | CliHost | Path.Path>();
    return CliVersion.of({
      read: Effect.fn("CliVersion.read")((candidates) =>
        readVersionFiles(candidates).pipe(Effect.provide(dependencies))
      ),
    });
  })
);
export const CliUpgradeLive = Layer.effect(
  CliUpgrade,
  Effect.gen(function* () {
    const dependencies = yield* Effect.context<DownloadFiles | CliHost | Path.Path | CliRegistry>();
    return CliUpgrade.of({
      check: Effect.fn("CliUpgrade.check")((input) => checkUpgradeFiles(input).pipe(Effect.provide(dependencies))),
      cachePath: defaultCachePath().pipe(Effect.provide(dependencies)),
    });
  })
);

export const CliRegistryLive = Layer.effect(
  CliRegistry,
  Effect.gen(function* () {
    const dependencies = yield* Effect.context<HttpClient.HttpClient>();
    return CliRegistry.of({ latest: fetchRegistry.pipe(Effect.provide(dependencies)) });
  })
);
