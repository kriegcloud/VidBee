import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { AutostartOptions, AutostartResult } from "./Connection.model.js";
export class CliAutostart extends Context.Service<
  CliAutostart,
  { readonly ensure: (enabled: boolean, options?: AutostartOptions) => Effect.Effect<AutostartResult> }
>()("@vidbee/cli/CliAutostart.service/CliAutostart") {}
