import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as S from "effect/Schema";
import * as Stdio from "effect/Stdio";
import * as Stream from "effect/Stream";
import { HostFailure } from "./Transcription.errors.js";
import { WorkerOutput } from "./WorkerHandler.service.js";

const failure = (cause: unknown) =>
  HostFailure.make({
    operation: "stdout",
    cause,
    legacyMessage: cause instanceof Error ? cause.message : String(cause),
  });
export const WorkerOutputLive = Layer.effect(
  WorkerOutput,
  Effect.gen(function* () {
    const stdio = yield* Stdio.Stdio;
    const write = (text: string) =>
      Stream.make(text).pipe(Stream.run(stdio.stdout({ endOnDone: false })), Effect.mapError(failure));
    return WorkerOutput.of({
      send: Effect.fn("WorkerOutput.send")(function* (message) {
        const encoded = yield* S.encodeUnknownEffect(S.fromJsonString(S.Unknown))(message).pipe(
          Effect.mapError(failure)
        );
        yield* write(`${encoded}\n`);
      }),
      flush: write(""),
    });
  })
);
