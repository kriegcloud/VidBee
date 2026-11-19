import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { CliFailure } from "./Cli.errors.js";
import type { UpgradeCheckInput, UpgradeCheckResult } from "./Upgrade.model.js";
export class CliUpgrade extends Context.Service<
  CliUpgrade,
  {
    readonly check: (input: UpgradeCheckInput) => Effect.Effect<UpgradeCheckResult, CliFailure>;
    readonly cachePath: Effect.Effect<string>;
  }
>()("@vidbee/cli/CliUpgrade.service/CliUpgrade") {}
