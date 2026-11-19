import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as S from "effect/Schema";
import { AtomicFiles } from "./AtomicFiles.service.js";
import { CheckpointFailure, HostFailure } from "./Transcription.errors.js";
import { TranscriptionFiles } from "./TranscriptionFiles.service.js";
import { TranscriptionHost } from "./TranscriptionHost.service.js";
import { TranscriptionIds } from "./TranscriptionIds.service.js";

const errorShape = S.Struct({ code: S.optional(S.String), reason: S.optional(S.Struct({ _tag: S.String })) });
const isMissing = (error: HostFailure): boolean => {
  const decoded = S.decodeUnknownOption(errorShape)(error.cause);
  return Option.isSome(decoded) && (decoded.value.code === "ENOENT" || decoded.value.reason?._tag === "NotFound");
};
const cancelled = (dir: string) =>
  CheckpointFailure.make({ operation: "atomicWrite", legacyMessage: `cancelled: work dir missing (${dir})` });
export const AtomicFilesLive = Layer.effect(
  AtomicFiles,
  Effect.gen(function* () {
    const files = yield* TranscriptionFiles;
    const host = yield* TranscriptionHost;
    const ids = yield* TranscriptionIds;
    const path = yield* Path.Path;
    const stagingPath = Effect.fn("AtomicFiles.stagingPath")(function* (target: string) {
      const snapshot = yield* host.snapshot;
      const random = yield* ids.hex(6);
      return `${target}.tmp.${snapshot.pid}.${random}`;
    });
    const publish = Effect.fn("AtomicFiles.publish")((temporary: string, destination: string) =>
      files.rename(temporary, destination).pipe(
        Effect.catch(
          Effect.fnUntraced(function* (error) {
            yield* files.remove(temporary, false, true);
            if (isMissing(error) && (yield* files.exists(destination))) return;
            const dir = path.dirname(destination);
            if (isMissing(error) && !(yield* files.exists(dir))) return yield* cancelled(dir);
            return yield* error;
          })
        ),
        Effect.uninterruptible
      )
    );
    const write = Effect.fn("AtomicFiles.write")(function* (target: string, data: Uint8Array | string) {
      const dir = path.dirname(target);
      if (!(yield* files.exists(dir))) return yield* cancelled(dir);
      const temporary = yield* stagingPath(target);
      yield* files.write(temporary, data).pipe(
        Effect.catch(
          Effect.fnUntraced(function* (error) {
            yield* files.remove(temporary, false, true);
            if (isMissing(error) && !(yield* files.exists(dir))) return yield* cancelled(dir);
            return yield* error;
          })
        )
      );
      yield* publish(temporary, target);
    }, Effect.uninterruptible);
    return AtomicFiles.of({
      stagingPath,
      publish,
      write,
      writeJson: Effect.fn("AtomicFiles.writeJson")(function* (target, value) {
        const encoded = yield* S.encodeEffect(S.fromJsonString(S.Unknown))(value).pipe(
          Effect.mapError((cause) => HostFailure.make({ operation: "stringify", cause, legacyMessage: cause.message }))
        );
        yield* write(target, encoded);
      }),
    });
  })
);
