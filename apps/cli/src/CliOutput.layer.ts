import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stdio from "effect/Stdio";
import * as Stream from "effect/Stream";
import { CliFailure } from "./Cli.errors.js";
import { CliOutput } from "./CliOutput.service.js";
import { originalMessage } from "./transport/descriptor.js";
export const CliOutputLive = Layer.effect(
  CliOutput,
  Effect.gen(function* () {
    const stdio = yield* Stdio.Stdio;
    return CliOutput.of({
      stdout: Effect.fn("CliOutput.stdout")((text) =>
        Stream.run(Stream.make(text), stdio.stdout({ endOnDone: true })).pipe(
          Effect.mapError((cause) => CliFailure.make({ message: originalMessage(cause), cause }))
        )
      ),
      stderr: Effect.fn("CliOutput.stderr")((text) =>
        Stream.run(Stream.make(text), stdio.stderr({ endOnDone: true })).pipe(
          Effect.mapError((cause) => CliFailure.make({ message: originalMessage(cause), cause }))
        )
      ),
    });
  })
);
