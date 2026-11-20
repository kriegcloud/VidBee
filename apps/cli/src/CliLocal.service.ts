import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { CliFailure } from "./Cli.errors.js";
import type { LocalClientOptions, LocalSession } from "./Connection.model.js";
export class CliLocal extends Context.Service<
  CliLocal,
  { readonly open: (options?: LocalClientOptions) => Effect.Effect<LocalSession, CliFailure> }
>()("@vidbee/cli/CliLocal.service/CliLocal") {}
