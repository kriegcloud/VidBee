import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as S from "effect/Schema";
import { ModelFileIO } from "./ModelFiles.service.js";
import { makeModelHash } from "./ModelHash.js";
import { HostFailure, ModelUnavailable } from "./Transcription.errors.js";
import { TranscriptionProcess } from "./TranscriptionProcess.service.js";
import type { ProcessOutcome } from "@vidbee/downloader-core/Process.model";

const failure =
  (operation: string) =>
  (cause: unknown): HostFailure =>
    HostFailure.make({ operation, cause, legacyMessage: cause instanceof Error ? cause.message : String(cause) });
export const ModelFileIOLive = Layer.effect(
  ModelFileIO,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const process = yield* TranscriptionProcess;
    const scope = yield* Effect.scope;
    const writeStream = Effect.fn("ModelFileIO.writeStream")(function* (
      response: import("./ModelHttp.service.js").ModelResponse,
      name: string,
      verify: boolean,
      chunk: (bytes: Uint8Array) => Effect.Effect<void, HostFailure>
    ) {
      const file = yield* fs.open(name, { flag: "w" }).pipe(Effect.mapError(failure("openModelWrite")));
      const hash = verify ? makeModelHash() : undefined;
      yield* response.consume(
        Effect.fn("ModelFileIO.chunk")(function* (bytes) {
          hash?.update(bytes);
          yield* chunk(bytes);
          yield* file.writeAll(bytes).pipe(Effect.mapError(failure("writeModelChunk")));
        })
      );
      return hash?.digest();
    });
    return ModelFileIO.of({
      readManifest: Effect.fn("ModelFileIO.readManifest")((name) =>
        fs.readFile(name).pipe(Effect.mapError(failure("readManifest")))
      ),
      parseJson: Effect.fn("ModelFileIO.parseJson")((text) =>
        S.decodeEffect(S.fromJsonString(S.Unknown))(text).pipe(Effect.mapError(failure("parseJson")))
      ),
      digest: Effect.fn("ModelFileIO.digest")((bytes) =>
        Effect.sync(() => {
          const hash = makeModelHash();
          hash.update(bytes);
          return hash.digest();
        })
      ),
      stream: Effect.fn("ModelFileIO.stream")((response, name, signal, verify, chunk) => {
        const abort =
          signal === undefined
            ? Effect.never
            : Effect.callback<never, HostFailure>((resume) => {
                const stop = () => resume(Effect.fail(failure("modelStream")(signal.reason)));
                signal.addEventListener("abort", stop, { once: true });
                if (signal.aborted) stop();
                return Effect.sync(() => signal.removeEventListener("abort", stop));
              });
        return Effect.scoped(Effect.raceFirst(writeStream(response, name, verify, chunk), abort));
      }),
      extract: Effect.fn("ModelFileIO.extract")(function* (archive, staging, signal) {
        const outcome = yield* Deferred.make<ProcessOutcome>();
        const aborted = yield* Deferred.make<void>();
        const started = yield* process.start(
          {
            command: "tar",
            argv: ["-xjf", archive, "-C", staging],
            env: undefined,
            extendEnv: true,
            cwd: undefined,
            detached: false,
            windowsHide: false,
            stdin: "ignore",
            stdout: "pipe",
            stderr: "pipe",
            stdoutConsumption: "events",
            stderrConsumption: "events",
            ...(signal === undefined ? {} : { abortSignal: signal }),
          },
          {
            abort: Deferred.succeed(aborted, undefined).pipe(Effect.asVoid),
            emit: Effect.fn("ModelFileIO.extractEvent")((event) =>
              event._tag === "complete" ? Deferred.succeed(outcome, event.outcome).pipe(Effect.asVoid) : Effect.void
            ),
          },
          scope
        );
        if (started._tag === "NativeSpawnFailure") return yield* failure("extractArchive")(started.error);
        const cancellation = Deferred.await(aborted).pipe(
          Effect.andThen(
            started.run.process
              .signalChild("SIGTERM")
              .pipe(Effect.mapError((error) => failure("extractArchive")(error.cause ?? error)))
          ),
          Effect.andThen(ModelUnavailable.make({ operation: "cancel", legacyMessage: "download cancelled" }))
        );
        const result = yield* Effect.raceFirst(Deferred.await(outcome), cancellation);
        yield* started.run.awaitReaped;
        if (result._tag === "Native") {
          if (result.result._tag === "Failure") return yield* failure("extractArchive")(result.result.error);
          if (result.result.code !== 0)
            return yield* ModelUnavailable.make({
              operation: "extractArchive",
              legacyMessage: `tar failed with exit code ${result.result.code}`,
            });
        } else if (result.code !== 0)
          return yield* ModelUnavailable.make({
            operation: "extractArchive",
            legacyMessage: `tar failed with exit code ${result.code}`,
          });
      }),
    });
  })
);
