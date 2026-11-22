import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { CliFailure } from "./Cli.errors.js";
export class CliOutput extends Context.Service<
  CliOutput,
  {
    readonly stdout: (text: string) => Effect.Effect<void, CliFailure>;
    readonly stderr: (text: string) => Effect.Effect<void, CliFailure>;
  }
>()("@vidbee/cli/CliOutput.service/CliOutput") {}
