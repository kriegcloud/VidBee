import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import { CliOutput } from "./CliOutput.service.js";
import { errorEnvelope, renderEnvelope } from "./envelope/index.js";
import { run } from "./runtime.js";
import { originalMessage } from "./transport/descriptor.js";
/** Handler-free terminal program. Host composition owns the final process exit. */
export const terminal = Effect.fn("terminal")(function* (argv: ReadonlyArray<string>) {
  const output = yield* CliOutput;
  return yield* run(argv).pipe(
    Effect.map((result) => result.exitCode),
    Effect.catchCause((cause) => {
      const error = Cause.squash(cause);
      const message = originalMessage(error);
      const envelope = errorEnvelope("UNKNOWN_ERROR", message);
      return output.stderr(`${renderEnvelope(envelope)}\n`).pipe(
        Effect.as(2),
        Effect.orElseSucceed(() => 2)
      );
    })
  );
});
