import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as P from "effect/Predicate";
import * as S from "effect/Schema";
import { AtomicFiles } from "./AtomicFiles.service.js";
import {
  ManifestEnvelope,
  PersistedChunk,
  PersistedSpeaker,
  PersistedStage,
  PersistedTurn,
} from "./Checkpoint.model.js";
import { Checkpoints } from "./Checkpoints.service.js";
import { chunkKey } from "./chunk-manifest.js";
import { BoundaryDecodeError, CheckpointFailure } from "./Transcription.errors.js";
import { TranscriptionFiles } from "./TranscriptionFiles.service.js";

const json = S.fromJsonString(S.Unknown);
const missing = (path: string) =>
  CheckpointFailure.make({ operation: "manifest", legacyMessage: `chunk manifest missing: ${path}` });
export const CheckpointsLive = Layer.effect(
  Checkpoints,
  Effect.gen(function* () {
    const files = yield* TranscriptionFiles;
    const atomic = yield* AtomicFiles;
    const path = yield* Path.Path;
    const manifestPath = (dir: string) => path.join(dir, "chunks.json");
    const stagesPath = (dir: string) => path.join(dir, "stages.json");
    const load = Effect.fn("Checkpoints.load")(function* (target: string) {
      if (!(yield* files.exists(target))) return null;
      const text = yield* files.readText(target).pipe(Effect.orElseSucceed(() => null));
      if (text === null) return null;
      const parsed = S.decodeResult(json)(text);
      if (parsed._tag === "Failure") return null;
      const decoded = S.decodeUnknownOption(ManifestEnvelope)(parsed.success);
      if (Option.isNone(decoded)) return null;
      const value = decoded.value;
      if (!P.isTruthy(value.key.taskId) || !P.isTruthy(value.key.fingerprint) || !P.isTruthy(value.key.modelVersion))
        return null;
      value.speakers ??= [];
      value.turns ??= [];
      value.chunks ??= [];
      value.stages ??= [];
      return value;
    });
    const save = Effect.fn("Checkpoints.save")((target: string, value: ManifestEnvelope) =>
      atomic.writeJson(target, value)
    );
    const chunks = Effect.fn("Checkpoints.chunks")((value: ManifestEnvelope) =>
      S.decodeUnknownEffect(PersistedChunk.pipe(S.Array, S.mutable))(value.chunks).pipe(
        Effect.mapError(() =>
          BoundaryDecodeError.make({ operation: "chunks", legacyMessage: "Invalid transcription data at chunks." })
        )
      )
    );
    const turns = Effect.fn("Checkpoints.turns")((value: ManifestEnvelope) =>
      S.decodeUnknownEffect(PersistedTurn.pipe(S.Array, S.mutable))(value.turns).pipe(
        Effect.mapError(() =>
          BoundaryDecodeError.make({ operation: "turns", legacyMessage: "Invalid transcription data at turns." })
        )
      )
    );
    const speakers = Effect.fn("Checkpoints.speakers")((value: ManifestEnvelope) =>
      S.decodeUnknownEffect(PersistedSpeaker.pipe(S.Array, S.mutable))(value.speakers).pipe(
        Effect.mapError(() =>
          BoundaryDecodeError.make({ operation: "speakers", legacyMessage: "Invalid transcription data at speakers." })
        )
      )
    );
    return Checkpoints.of({
      manifestPath,
      stagesPath,
      load,
      save,
      chunks,
      turns,
      speakers,
      sourceFingerprint: Effect.fn("Checkpoints.sourceFingerprint")(function* (target) {
        const stat = yield* files.stat(target);
        return `${stat.size}:${Math.round(stat.mtimeMs)}`;
      }),
      ensure: Effect.fn("Checkpoints.ensure")(function* (input) {
        const target = manifestPath(input.workDir);
        const existing = yield* load(target);
        const matches =
          existing !== null &&
          existing.key.taskId === input.taskId &&
          existing.key.fingerprint === input.fingerprint &&
          existing.key.modelVersion === input.modelVersion;
        const manifest = matches
          ? existing
          : ManifestEnvelope.make({
              key: { taskId: input.taskId, fingerprint: input.fingerprint, modelVersion: input.modelVersion },
              durationMs: null,
              speakers: [],
              turns: [],
              chunks: [],
              stages: [],
            });
        if (!matches) yield* save(target, manifest);
        return { path: target, manifest };
      }),
      patch: Effect.fn("Checkpoints.patch")(function* (target, patch) {
        const value = yield* load(target);
        if (value === null) return yield* missing(target);
        if (P.isTruthy(patch.speakers)) value.speakers = patch.speakers;
        if (P.isTruthy(patch.turns)) value.turns = patch.turns;
        if (typeof patch.durationMs === "number") value.durationMs = patch.durationMs;
        yield* save(target, value);
        return value;
      }),
      append: Effect.fn("Checkpoints.append")(function* (target, chunk, extras) {
        const value = yield* load(target);
        if (value === null) return yield* missing(target);
        if (P.isTruthy(extras?.speakers)) value.speakers = extras?.speakers;
        if (P.isTruthy(extras?.turns)) value.turns = extras?.turns;
        if (typeof extras?.durationMs === "number") value.durationMs = extras.durationMs;
        const current = yield* chunks(value);
        const key = chunkKey(chunk.startMs, chunk.endMs);
        if (!Arr.some(current, (item) => chunkKey(item.startMs, item.endMs) === key)) current.push(chunk);
        value.chunks = current;
        yield* save(target, value);
        return value;
      }),
      loadStages: Effect.fn("Checkpoints.loadStages")(function* (workDir) {
        const target = stagesPath(workDir);
        if (!(yield* files.exists(target))) return null;
        const text = yield* files.readText(target).pipe(Effect.orElseSucceed(() => null));
        if (text === null) return null;
        const parsed = S.decodeResult(json)(text);
        if (parsed._tag === "Failure" || !Arr.isArray(parsed.success)) return null;
        const result: Array<typeof PersistedStage.Type> = [];
        for (const item of parsed.success) {
          const stage = S.decodeUnknownOption(PersistedStage)(item);
          if (Option.isSome(stage)) result.push(stage.value);
        }
        return result;
      }),
      saveStages: Effect.fn("Checkpoints.saveStages")((workDir, stages) =>
        atomic.writeJson(stagesPath(workDir), stages)
      ),
    });
  })
);
