import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { CliError } from "./Cli.model.js";
import type { ConnectResult } from "./Connection.model.js";
import type { Flags } from "./Parser.model.js";
export class CliConnection extends Context.Service<
  CliConnection,
  { readonly connect: (flags: Flags) => Effect.Effect<ConnectResult, CliError> }
>()("@vidbee/cli/CliConnection.service/CliConnection") {}
