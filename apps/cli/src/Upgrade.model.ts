import * as S from "effect/Schema";
export const CliVersionInfo = S.Struct({
  cli: S.String.pipe(S.mutableKey),
  contract: S.String.pipe(S.mutableKey),
  changelog: S.String.pipe(S.mutableKey),
});
export type CliVersionInfo = typeof CliVersionInfo.Type;
export const UpgradeCache = S.Struct({ version: S.String.pipe(S.mutableKey), fetchedAt: S.Finite.pipe(S.mutableKey) });
export type UpgradeCache = typeof UpgradeCache.Type;
export const UpgradeCheckInput = S.Struct({
  current: S.String.pipe(S.mutableKey),
  cachePath: S.optional(S.String).pipe(S.mutableKey),
  force: S.optional(S.Boolean).pipe(S.mutableKey),
});
export type UpgradeCheckInput = typeof UpgradeCheckInput.Type;
export const UpgradeCheckResult = S.Struct({
  current: S.String.pipe(S.mutableKey),
  latest: S.String.pipe(S.mutableKey),
  upToDate: S.Boolean.pipe(S.mutableKey),
  cached: S.Boolean.pipe(S.mutableKey),
  cachedAt: S.NullOr(S.String).pipe(S.mutableKey),
  registryUrl: S.String.pipe(S.mutableKey),
  installCommands: S.Struct({
    npm: S.String.pipe(S.mutableKey),
    pnpm: S.String.pipe(S.mutableKey),
    bun: S.String.pipe(S.mutableKey),
    brew: S.String.pipe(S.mutableKey),
  }).pipe(S.mutableKey),
});
export type UpgradeCheckResult = typeof UpgradeCheckResult.Type;
