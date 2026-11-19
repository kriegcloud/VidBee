import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as S from "effect/Schema";
import * as Scope from "effect/Scope";
import { Checkpoints } from "./Checkpoints.service.js";
import { CloudProgressEnvelope } from "./CloudRun.model.js";
import { CloudFileIO } from "./CloudTranscription.service.js";
import { BoundaryDecodeError, HostFailure } from "./Transcription.errors.js";
import { TranscriptionFiles } from "./TranscriptionFiles.service.js";
import type { CloudCheckpointDocument } from "./CloudTranscription.service.js";

const failure = (operation: string) => (cause: unknown) =>
  HostFailure.make({ operation, legacyMessage: cause instanceof Error ? cause.message : String(cause), cause });
const boundary = (operation: string) => (cause: unknown) =>
  BoundaryDecodeError.make({ operation, legacyMessage: `Invalid transcription data at ${operation}.`, cause });
const json = S.fromJsonString(S.Unknown);
export const makeLayer = (fingerprint: (path: string) => Effect.Effect<string, HostFailure>) =>
  Layer.effect(
    CloudFileIO,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const files = yield* TranscriptionFiles;
      const owner = yield* Effect.scope;
      return CloudFileIO.of({
        fingerprint,
        load: Effect.fn("CloudFileIO.load")(function* (name, accountId) {
          const text = yield* fs
            .readFileString(name)
            .pipe(
              Effect.catch((error) =>
                error.reason._tag === "NotFound"
                  ? Effect.succeed(null)
                  : Effect.fail(
                      HostFailure.make({ operation: "cloud-read", legacyMessage: error.message, cause: error })
                    )
              )
            );
          const value =
            text === null
              ? { accountId, clips: [] }
              : yield* S.decodeEffect(json)(text).pipe(Effect.mapError(boundary("cloud.json")));
          const saved = yield* S.decodeUnknownEffect(CloudProgressEnvelope)(value).pipe(
            Effect.mapError(boundary("cloud.json"))
          );
          const save = S.encodeUnknownEffect(json)(saved).pipe(
            Effect.mapError(boundary("cloud.json")),
            Effect.flatMap((encoded) => files.write(`${name}.tmp`, encoded)),
            Effect.andThen(files.rename(`${name}.tmp`, name))
          );
          if (text === null) yield* save;
          const clips = Effect.suspend(() =>
            S.is(S.Array(S.Unknown).pipe(S.mutable))(saved.clips)
              ? Effect.succeed(saved.clips)
              : Effect.fail(boundary("cloud.clips")(saved.clips))
          );
          const document: CloudCheckpointDocument = {
            accountId: Effect.succeed(saved.accountId),
            clipAt: Effect.fn("CloudCheckpoint.clipAt")((index) => clips.pipe(Effect.map((rows) => rows[index]))),
            append: Effect.fn("CloudCheckpoint.append")((clip) =>
              clips.pipe(
                Effect.map((rows) => {
                  rows.push(clip);
                })
              )
            ),
            save,
          };
          return document;
        }),
        open: Effect.fn("CloudFileIO.open")(function* (name) {
          const scope = yield* Scope.fork(owner);
          const file = yield* fs.open(name, { flag: "r" }).pipe(
            Scope.provide(scope),
            Effect.mapError(failure("cloud-open")),
            Effect.onError(() => Scope.close(scope, Exit.void))
          );
          return {
            read: Effect.fn("CloudPcmFile.read")((bytes, position) =>
              file.read(bytes, { position: BigInt(position) }).pipe(Effect.mapError(failure("cloud-read-pcm")))
            ),
            size: file.stat.pipe(
              Effect.mapBoth({ onSuccess: (info) => Number(info.size), onFailure: failure("cloud-stat-pcm") })
            ),
            close: Scope.close(scope, Exit.void),
          };
        }),
      });
    })
  );

export const layer = Layer.unwrap(Effect.map(Checkpoints, (checkpoints) => makeLayer(checkpoints.sourceFingerprint)));
