import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as S from "effect/Schema";
import { PersistedStage } from "./Checkpoint.model.js";
import { Checkpoints } from "./Checkpoints.service.js";
import { PartialsManifest } from "./Partials.service.js";
import { BoundaryDecodeError } from "./Transcription.errors.js";
export const PartialsManifestLive = Layer.effect(
  PartialsManifest,
  Effect.gen(function* () {
    const checkpoints = yield* Checkpoints;
    return PartialsManifest.of({
      load: Effect.fn("PartialsManifest.load")(function* (workDir) {
        const manifest = yield* checkpoints.load(checkpoints.manifestPath(workDir));
        const chunks = manifest === null ? [] : yield* checkpoints.chunks(manifest);
        const separate = yield* checkpoints.loadStages(workDir);
        const stages =
          separate ??
          (manifest === null
            ? []
            : yield* S.decodeUnknownEffect(PersistedStage.pipe(S.Array, S.mutable))(manifest.stages).pipe(
                Effect.mapError((cause) =>
                  BoundaryDecodeError.make({
                    operation: "stages",
                    cause,
                    legacyMessage: "Invalid transcription data at stages.",
                  })
                )
              ));
        return { chunks, stages };
      }),
    });
  })
);
