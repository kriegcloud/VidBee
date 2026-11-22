import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CliProgram } from "./CliProgram.service.js";
import { runNative } from "./runtime.js";
import type { CliConnection } from "./CliConnection.service.js";
import type { CliOutput } from "./CliOutput.service.js";
import type { CliProbe } from "./CliProbe.service.js";
import type { CliUpgrade } from "./CliUpgrade.service.js";
import type { CliVersion } from "./CliVersion.service.js";
export const CliProgramLive = Layer.effect(
  CliProgram,
  Effect.gen(function* () {
    const dependencies = yield* Effect.context<CliConnection | CliProbe | CliVersion | CliUpgrade | CliOutput>();
    return CliProgram.of({
      run: Effect.fn("CliProgram.run")((argv) => runNative(argv).pipe(Effect.provide(dependencies))),
    });
  })
);
