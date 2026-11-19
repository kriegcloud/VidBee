import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { CliVersionInfo } from "./Upgrade.model.js";
export class CliVersion extends Context.Service<
  CliVersion,
  { readonly read: (candidates?: ReadonlyArray<string>) => Effect.Effect<CliVersionInfo> }
>()("@vidbee/cli/CliVersion.service/CliVersion") {}
