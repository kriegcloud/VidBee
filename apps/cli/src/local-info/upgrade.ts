import { DownloadFiles } from "@vidbee/downloader-core/DownloadFiles.service";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as Path from "effect/Path";
import * as S from "effect/Schema";
import { CliFailure } from "../Cli.errors.js";
import { CliHost } from "../CliHost.service.js";
import { jsonIssue, parseJson, requestText } from "../CliHttp.js";
import { CliRegistry } from "../CliRegistry.service.js";
import { CliUpgrade } from "../CliUpgrade.service.js";
import { originalMessage } from "../transport/descriptor.js";
import { UpgradeCache } from "../Upgrade.model.js";
import { compareSemver } from "./semver.js";
import type { UpgradeCheckInput, UpgradeCheckResult } from "../Upgrade.model.js";

export { compareSemver } from "./semver.js";
export type { UpgradeCheckInput, UpgradeCheckResult } from "../Upgrade.model.js";
export const REGISTRY_URL = "https://registry.npmjs.org/@vidbee/cli/latest";
export const defaultCachePath = Effect.fn("defaultCachePath")(function* () {
  const host = yield* CliHost;
  const path = yield* Path.Path;
  if (host.platform === "win32")
    return path.join(
      (yield* host.environment("LOCALAPPDATA")) ?? path.join(host.homeDirectory, "AppData", "Local"),
      "VidBee",
      "cli-upgrade-check.json"
    );
  if (host.platform === "darwin")
    return path.join(host.homeDirectory, "Library", "Caches", "VidBee", "cli-upgrade-check.json");
  const base = (yield* host.environment("XDG_CACHE_HOME")) ?? path.join(host.homeDirectory, ".cache");
  return path.join(base, "vidbee", "cli-upgrade-check.json");
});
const cache = S.decodeEffect(S.fromJsonString(UpgradeCache));
const write = S.encodeEffect(S.fromJsonString(S.Unknown));
export const checkUpgradeFiles = Effect.fn("checkUpgradeFiles")(function* (input: UpgradeCheckInput) {
  const files = yield* DownloadFiles;
  const path = yield* Path.Path;
  const cachePath = input.cachePath ?? (yield* defaultCachePath());
  let latest: string | null = null;
  let fetchedAt: number | null = null;
  if (input.force !== true) {
    const cached = yield* files.read(cachePath).pipe(Effect.flatMap(cache), Effect.option);
    if (
      cached._tag === "Some" &&
      (yield* Clock.currentTimeMillis) - cached.value.fetchedAt < 30 * 24 * 60 * 60 * 1000
    ) {
      latest = cached.value.version;
      fetchedAt = cached.value.fetchedAt;
    }
  }
  const cached = latest !== null;
  if (latest === null) {
    const fetched = yield* (yield* CliRegistry).latest;
    latest = fetched.version;
    fetchedAt = fetched.fetchedAt;
    const text = yield* write({ version: latest, fetchedAt }).pipe(Effect.orDie);
    yield* files
      .makeDirectory(path.dirname(cachePath), true)
      .pipe(Effect.andThen(files.write(cachePath, text)), Effect.ignore);
  }
  if (fetchedAt !== null && Math.abs(fetchedAt) > 8640000000000000)
    return yield* CliFailure.make({ category: "range", message: "Invalid time value" });
  const cachedAt =
    fetchedAt === null
      ? null
      : yield* Effect.try({
          try: () => DateTime.formatIso(DateTime.makeUnsafe(fetchedAt)),
          catch: (cause) => CliFailure.make({ message: originalMessage(cause), cause }),
        });
  return {
    current: input.current,
    latest,
    upToDate: compareSemver(input.current, latest) >= 0,
    cached,
    cachedAt,
    registryUrl: REGISTRY_URL,
    installCommands: {
      npm: "npm install -g @vidbee/cli",
      pnpm: "pnpm add -g @vidbee/cli",
      bun: "bun install -g @vidbee/cli",
      brew: "brew upgrade vidbee/tap/vidbee",
    },
  } satisfies UpgradeCheckResult;
});
export const checkUpgrade = Effect.fn("checkUpgrade")(function* (input: UpgradeCheckInput) {
  return yield* (yield* CliUpgrade).check(input);
});

export const fetchRegistry = Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient;
  const res = yield* requestText(client, "GET", REGISTRY_URL, { accept: "application/json" }, undefined, 5000);
  if (res.status < 200 || res.status >= 300)
    return yield* CliFailure.make({ message: `registry responded ${res.status}` });
  const body = yield* parseJson(res.bodyText).pipe(
    Effect.mapError((error) => CliFailure.make({ message: jsonIssue(error.issue) }))
  );
  if (body === null)
    return yield* CliFailure.make({ category: "type", message: "Cannot read properties of null (reading 'version')" });
  if (!S.is(S.Struct({ version: S.String }))(body))
    return yield* CliFailure.make({ message: "registry response missing `version`" });
  return { version: body.version, fetchedAt: yield* Clock.currentTimeMillis };
});
