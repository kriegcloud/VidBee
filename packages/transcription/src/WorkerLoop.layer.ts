import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stdio from "effect/Stdio";
import * as Stream from "effect/Stream";
import * as Str from "effect/String";
import { HostFailure } from "./Transcription.errors.js";
import { WorkerHandler, WorkerOutput } from "./WorkerHandler.service.js";
import { WorkerLoop } from "./WorkerLoop.service.js";
import { WorkerProtocol } from "./WorkerProtocol.service.js";
export const WorkerLoopLive = Layer.effect(
  WorkerLoop,
  Effect.gen(function* () {
    const owner = yield* Effect.scope;
    const stdio = yield* Stdio.Stdio;
    const protocol = yield* WorkerProtocol;
    const handler = yield* WorkerHandler;
    const output = yield* WorkerOutput;
    return WorkerLoop.of({
      run: Effect.fn("WorkerLoop.run")(function* (signal, cancel) {
        const done = yield* Deferred.make<void, HostFailure>();
        let carry = "";
        const consume = Effect.fn("WorkerLoop.consume")(function* (chunk: string) {
          carry += chunk;
          let index = Str.indexOf("\n")(carry);
          while (index._tag === "Some") {
            const line = Str.slice(0, index.value)(carry);
            carry = Str.slice(index.value + 1)(carry);
            const message = yield* protocol.parseInbound(line);
            if (message?.type === "cancel") cancel();
            else if (message !== null) {
              const action = message.type === "probe" ? handler.probe(message) : handler.start(message, signal);
              yield* action.pipe(
                Effect.andThen(output.flush),
                Effect.exit,
                Effect.andThen((exit) => Deferred.done(done, exit)),
                Effect.forkIn(owner)
              );
            }
            index = Str.indexOf("\n")(carry);
          }
        });
        yield* stdio.stdin.pipe(
          Stream.decodeText(),
          Stream.runForEach(consume),
          Effect.catch((error) =>
            output
              .send({
                type: "error",
                message: error._tag === "BoundaryDecodeError" ? error.legacyMessage : String(error),
              })
              .pipe(
                Effect.andThen(
                  Deferred.fail(
                    done,
                    HostFailure.make({ operation: "stdin", cause: error, legacyMessage: "worker input failed" })
                  )
                )
              )
          ),
          Effect.forkIn(owner)
        );
        yield* Deferred.await(done);
      }),
    });
  })
);
