import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { CliFailure } from "./Cli.errors.js";
import type { UpgradeCache } from "./Upgrade.model.js";
export class CliRegistry extends Context.Service<
  CliRegistry,
  { readonly latest: Effect.Effect<UpgradeCache, CliFailure> }
>()("@vidbee/cli/CliRegistry.service/CliRegistry") {}
