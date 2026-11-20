import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { CliError, RunResult } from "./Cli.model.js";
export class CliProgram extends Context.Service<
  CliProgram,
  { readonly run: (argv: ReadonlyArray<string>) => Effect.Effect<RunResult, CliError> }
>()("@vidbee/cli/CliProgram.service/CliProgram") {}
