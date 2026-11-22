import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
export class CliHost extends Context.Service<
  CliHost,
  {
    readonly platform: string;
    readonly homeDirectory: string;
    readonly executingArtifactUrl: URL;
    readonly environment: (key: string) => Effect.Effect<string | undefined>;
  }
>()("@vidbee/cli/CliHost.service/CliHost") {}
