import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as S from "effect/Schema";
import { AtomicFiles } from "./AtomicFiles.service.js";
import { PersistedPipelineSeed } from "./Seed.model.js";
import { SeedFiles } from "./SeedFiles.service.js";
import { BoundaryDecodeError } from "./Transcription.errors.js";
import { TranscriptionFiles } from "./TranscriptionFiles.service.js";

const envelope = S.Struct({
  language: S.optional(S.Unknown),
  modelVersion: S.optional(S.Unknown),
  asrTier: S.optional(S.Unknown),
  sourceKind: S.optional(S.Unknown),
  speakers: S.optional(S.Unknown),
  segments: S.optional(S.Unknown),
});
export const SeedFilesLive = Layer.effect(
  SeedFiles,
  Effect.gen(function* () {
    const files = yield* TranscriptionFiles;
    const atomic = yield* AtomicFiles;
    return SeedFiles.of({
      write: Effect.fn("SeedFiles.write")((target, seed) => atomic.writeJson(target, seed)),
      load: Effect.fn("SeedFiles.load")(function* (target) {
        if (!(yield* files.exists(target))) return null;
        const text = yield* files.readText(target).pipe(Effect.orElseSucceed(() => null));
        if (text === null) return null;
        const parsed = S.decodeResult(S.fromJsonString(envelope))(text);
        if (parsed._tag === "Failure") return null;
        const raw = parsed.success;
        if (!Arr.isArray(raw.segments) || raw.segments.length === 0) return null;
        const value = {
          language: raw.language ?? null,
          modelVersion: typeof raw.modelVersion === "string" ? raw.modelVersion : "",
          asrTier: raw.asrTier ?? null,
          ...(raw.sourceKind === "captions" || raw.sourceKind === "asr" ? { sourceKind: raw.sourceKind } : {}),
          speakers: Arr.isArray(raw.speakers) ? raw.speakers : [],
          segments: raw.segments,
        };
        return yield* S.decodeUnknownEffect(PersistedPipelineSeed)(value).pipe(
          Effect.mapError((cause) =>
            BoundaryDecodeError.make({ operation: "seed", cause, legacyMessage: "Invalid transcription data at seed." })
          )
        );
      }),
    });
  })
);
