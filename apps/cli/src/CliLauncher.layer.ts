import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as Scope from "effect/Scope";
import { CliFailure } from "./Cli.errors.js";
import { CliLauncher } from "./CliLauncher.service.js";
import { originalMessage } from "./transport/descriptor.js";
export const CliLauncherLive = Layer.effect(
  CliLauncher,
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const scope = yield* Effect.scope;
    return CliLauncher.of({
      launch: Effect.fn("CliLauncher.launch")((spec) =>
        spawner
          .spawn(
            ChildProcess.make(spec.command, spec.argv, {
              stdin: "ignore",
              stdout: "ignore",
              stderr: "ignore",
              detached: true,
              windowsHide: true,
              extendEnv: true,
            })
          )
          .pipe(
            Effect.flatMap((handle) => handle.unref),
            Effect.asVoid,
            Effect.provideService(Scope.Scope, scope),
            Effect.mapError((cause) => CliFailure.make({ message: originalMessage(cause), cause }))
          )
      ),
    });
  })
);
