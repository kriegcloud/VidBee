import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { CliFailure } from "./Cli.errors.js";
import type { LauncherSpec } from "./Connection.model.js";
export class CliLauncher extends Context.Service<
  CliLauncher,
  { readonly launch: (spec: LauncherSpec) => Effect.Effect<void, CliFailure> }
>()("@vidbee/cli/CliLauncher.service/CliLauncher") {}
