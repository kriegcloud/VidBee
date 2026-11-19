import * as Config from "effect/Config";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as O from "effect/Option";
import { CliHost } from "./CliHost.service.js";
export const CliHostLive = (inputs: {
  readonly platform: string;
  readonly homeDirectory: string;
  readonly executingArtifactUrl: URL;
}) =>
  Layer.succeed(CliHost, {
    ...inputs,
    environment: Effect.fn("CliHost.environment")((key) =>
      Config.option(Config.String(key)).pipe(
        Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv({ preserveEmptyStrings: true })),
        Effect.map(O.getOrUndefined),
        Effect.orDie
      )
    ),
  });
