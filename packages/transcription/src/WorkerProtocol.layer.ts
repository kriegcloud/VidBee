import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as P from "effect/Predicate";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { PersistedPipelineResult, PipelineResult } from "./Pipeline.model.js";
import { BoundaryDecodeError, CheckpointFailure, HostFailure } from "./Transcription.errors.js";
import { TranscriptionFiles } from "./TranscriptionFiles.service.js";
import { WorkerWireInbound, WorkerWireOutbound } from "./Worker.model.js";
import { WorkerProtocol, WorkerResultJson } from "./WorkerProtocol.service.js";
export const WORKER_RESULT_FILE = "pipeline-result.json";
const json = S.fromJsonString(S.Unknown);
const object = S.Struct({ type: S.optional(S.Unknown) });
const boundary = (operation: string) => (cause: unknown) =>
  BoundaryDecodeError.make({ operation, cause, legacyMessage: `Invalid transcription data at ${operation}.` });
export const WorkerProtocolLive = Layer.effect(
  WorkerProtocol,
  Effect.gen(function* () {
    const resultJson = yield* WorkerResultJson;
    const files = yield* TranscriptionFiles;
    const path = yield* Path.Path;
    const parseLine = Effect.fn("WorkerProtocol.parseLine")(function* (line: string) {
      const trimmed = Str.trim(line);
      if (trimmed.length === 0) return null;
      const parsed = S.decodeResult(json)(trimmed);
      return parsed._tag === "Success" ? parsed.success : null;
    });
    return WorkerProtocol.of({
      encode: Effect.fn("WorkerProtocol.encode")((message) =>
        S.encodeUnknownEffect(json)(message).pipe(
          Effect.mapBoth({
            onSuccess: (value) => `${value}\n`,
            onFailure: (cause) => HostFailure.make({ operation: "encodeMessage", cause, legacyMessage: String(cause) }),
          })
        )
      ),
      parseLine,
      parseInbound: Effect.fn("WorkerProtocol.parseInbound")(function* (line) {
        const value = yield* parseLine(line);
        const envelope = S.decodeUnknownOption(object)(value);
        if (envelope._tag === "None") return null;
        const kind = envelope.value.type;
        if (kind !== "start" && kind !== "probe" && kind !== "cancel") return null;
        return yield* S.decodeUnknownEffect(WorkerWireInbound)(value).pipe(Effect.mapError(boundary("worker-input")));
      }),
      parse: Effect.fn("WorkerProtocol.parse")(function* (line) {
        const value = yield* parseLine(line);
        const envelope = S.decodeUnknownOption(object)(value);
        if (envelope._tag === "None") return null;
        const kind = envelope.value.type;
        if (
          kind !== "progress" &&
          kind !== "partial" &&
          kind !== "result" &&
          kind !== "error" &&
          kind !== "log" &&
          kind !== "probe-ok"
        )
          return null;
        return yield* S.decodeUnknownEffect(WorkerWireOutbound)(value).pipe(
          Effect.mapError(boundary("worker-message"))
        );
      }),
      readResult: Effect.fn("WorkerProtocol.readResult")(function* (message, workDir) {
        if (P.isTruthy(message.result)) {
          if (S.is(PipelineResult)(message.result)) return message.result;
          return yield* S.decodeUnknownEffect(PipelineResult)(message.result).pipe(
            Effect.mapError(boundary("worker-result"))
          );
        }
        const resultPath = message.resultPath;
        let target = path.join(workDir, WORKER_RESULT_FILE);
        if (P.isTruthy(resultPath)) {
          const named = yield* S.decodeUnknownEffect(S.String)(resultPath).pipe(
            Effect.mapError(boundary("worker-result-path"))
          );
          target = path.isAbsolute(named) ? named : path.join(workDir, named);
        }
        if (!(yield* files.exists(target)))
          return yield* CheckpointFailure.make({
            operation: "worker-result",
            legacyMessage: `worker result missing: ${target}`,
          });
        const text = yield* files.readText(target);
        const value = yield* resultJson.parse(text);
        return yield* S.decodeUnknownEffect(PersistedPipelineResult)(value).pipe(
          Effect.mapError(boundary("worker-result"))
        );
      }),
    });
  })
);

export const WorkerResultJsonLive = Layer.succeed(WorkerResultJson, {
  parse: Effect.fn("WorkerResultJson.parse")((text) =>
    S.decodeEffect(json)(text).pipe(
      Effect.mapError((cause) =>
        HostFailure.make({ operation: "workerResultJson", cause, legacyMessage: cause.message })
      )
    )
  ),
});
