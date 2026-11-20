import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as P from "effect/Predicate";
import * as Str from "effect/String";
import { SeedStore, Seeds } from "./Seeds.service.js";
import { pipelineSeedFromRecord } from "./speaker-assign.js";
import { TranscriptStore } from "./TranscriptStore.service.js";
export const SeedStoreLive = Layer.effect(
  SeedStore,
  Effect.gen(function* () {
    const store = yield* TranscriptStore;
    return SeedStore.of({ latest: store.getLatestForDownload, list: store.listForDownload });
  })
);
export const SeedsLive = Layer.effect(
  Seeds,
  Effect.gen(function* () {
    const store = yield* SeedStore;
    const latestAsr = Effect.fn("Seeds.latestAsr")(function* (id: string) {
      const rows = yield* store.list(id);
      return Arr.findFirst(
        rows,
        (row) => row.sourceKind === "asr" && row.resultKind === "transcript" && row.segments.length > 0
      ).pipe(Option.getOrNull, pipelineSeedFromRecord);
    });
    return Seeds.of({
      latestAsr,
      latestTranscript: Effect.fn("Seeds.latestTranscript")(function* (id) {
        const latest = yield* store.latest(id);
        if (latest?.sourceKind === "captions") {
          const history = yield* store.list(id);
          const rows = Arr.filter(
            history,
            (row) =>
              Str.startsWith("captions:")(row.transcriptionTaskId) &&
              row.resultKind === "transcript" &&
              row.segments.length > 0
          );
          const matched = P.isTruthy(latest.language)
            ? Option.getOrUndefined(Arr.findFirst(rows, (row) => row.language === latest.language))
            : undefined;
          const original = pipelineSeedFromRecord(matched ?? rows[0] ?? null);
          if (original !== null) return original;
        }
        return pipelineSeedFromRecord(latest) ?? (yield* latestAsr(id));
      }),
    });
  })
);
