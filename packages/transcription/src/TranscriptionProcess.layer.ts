import { ProcessCapabilities } from "@vidbee/downloader-core/ProcessCapabilities.service";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HostFailure } from "./Transcription.errors.js";
import { TranscriptionProcess } from "./TranscriptionProcess.service.js";
import type { HostFailure as ProcessHostFailure } from "@vidbee/downloader-core/Downloader.errors";
import type { WorkerProcessStart } from "./TranscriptionProcess.service.js";

const translate = (error: ProcessHostFailure): HostFailure =>
  HostFailure.make({
    operation: error.operation,
    legacyMessage: error.legacyMessage,
    cause: error.cause ?? error,
  });
export const layer = Layer.effect(
  TranscriptionProcess,
  Effect.gen(function* () {
    const capabilities = yield* ProcessCapabilities;
    return TranscriptionProcess.of({
      start: Effect.fn("TranscriptionProcess.start")(function* (spec, sink, owner) {
        const started = yield* capabilities.start(spec, sink, owner).pipe(Effect.mapError(translate));
        if (started._tag === "NativeSpawnFailure") return started;
        const run = started.run;
        const result: WorkerProcessStart = {
          _tag: "Acquired",
          run: {
            process: run.process,
            signallingState: run.signallingState.pipe(Effect.mapError(translate)),
            writeInput: Effect.fn("TranscriptionProcess.writeInput")((bytes) =>
              run.writeInput(bytes).pipe(Effect.mapError(translate))
            ),
            endInput: run.endInput.pipe(Effect.mapError(translate)),
            awaitReaped: run.awaitReaped.pipe(Effect.mapError(translate)),
            terminate: Effect.fn("TranscriptionProcess.terminate")((graceMs) =>
              run.terminate(graceMs).pipe(Effect.mapError(translate))
            ),
          },
        };
        return result;
      }),
    });
  })
);
