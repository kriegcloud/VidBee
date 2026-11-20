import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as HashMap from "effect/HashMap";
import * as Layer from "effect/Layer";
import * as O from "effect/Option";
import { Partials, PartialsManifest } from "./Partials.service.js";
import { TranscriptionTime } from "./TranscriptionTime.service.js";
import type { TranscriptionStage } from "./Literal.model.js";
import type { PipelineSegment } from "./Pipeline.model.js";
import type { PartialTranscript, RestorePartialsInput } from "./Store.model.js";
import type { TranscriptStageTiming } from "./Transcript.model.js";

const stageRank = (stage: string, history: readonly TranscriptStageTiming[]): number => {
  const transcribed = A.some(history, (item) => item.stage === "recognizing");
  if (stage === "queued") return 0;
  if (stage === "preparing-audio") return 1;
  if (stage === "detecting-speech") return 2;
  if (stage === "preparing-models") return transcribed ? 4 : 1;
  if (stage === "recognizing") return 3;
  if (stage === "diarizing") return 5;
  if (stage === "committing") return 6;
  return 3;
};
export const make = Effect.fnUntraced(function* () {
  const time = yield* TranscriptionTime;
  const manifest = yield* PartialsManifest;
  let buffers = HashMap.empty<string, PartialTranscript>();
  let byDownload = HashMap.empty<string, string>();
  const set = (taskId: string, downloadTaskId: string, segments: PipelineSegment[]): PartialTranscript => {
    const current = O.getOrUndefined(HashMap.get(buffers, taskId));
    const next = {
      taskId,
      downloadTaskId,
      segments: [...segments].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs),
      stage: current?.stage ?? null,
      stageHistory: current?.stageHistory ?? [],
    };
    buffers = HashMap.set(buffers, taskId, next);
    byDownload = HashMap.set(byDownload, downloadTaskId, taskId);
    return next;
  };
  const clear = (taskId: string) => {
    const current = O.getOrUndefined(HashMap.get(buffers, taskId));
    buffers = HashMap.remove(buffers, taskId);
    if (current !== undefined && O.getOrUndefined(HashMap.get(byDownload, current.downloadTaskId)) === taskId)
      byDownload = HashMap.remove(byDownload, current.downloadTaskId);
  };
  return Partials.of({
    set: Effect.fn("Partials.set")((taskId, downloadTaskId, segments) =>
      Effect.sync(() => set(taskId, downloadTaskId, segments))
    ),
    setStage: Effect.fnUntraced(function* (taskId: string, downloadTaskId: string, stage: TranscriptionStage) {
      const current = O.getOrUndefined(HashMap.get(buffers, taskId));
      const history = current?.stageHistory ?? [];
      const last = O.getOrUndefined(A.last(history));
      let stageHistory = history;
      if (last?.stage !== stage) {
        const goingBack = last != null && stageRank(stage, history) < stageRank(last.stage, A.dropRight(history, 1));
        if (!goingBack) {
          const now = yield* time.now;
          stageHistory = [...history, { stage, startedAt: now }];
        }
      }
      const next = { taskId, downloadTaskId, segments: current?.segments ?? [], stage, stageHistory };
      buffers = HashMap.set(buffers, taskId, next);
      byDownload = HashMap.set(byDownload, downloadTaskId, taskId);
      return next;
    }),
    append: Effect.fn("Partials.append")((taskId, downloadTaskId, segment) =>
      Effect.sync(() => {
        const current = O.getOrUndefined(HashMap.get(buffers, taskId))?.segments ?? [];
        const without = A.filter(
          current,
          (item) => !(item.startMs === segment.startMs && item.endMs === segment.endMs)
        );
        return set(taskId, downloadTaskId, [...without, segment]);
      })
    ),
    getByTask: Effect.fn("Partials.getByTask")((taskId) =>
      Effect.sync(() => O.getOrNull(HashMap.get(buffers, taskId)))
    ),
    getByDownload: Effect.fn("Partials.getByDownload")((downloadTaskId) =>
      Effect.sync(() => {
        const taskId = O.getOrUndefined(HashMap.get(byDownload, downloadTaskId));
        const hasTask = Boolean(taskId);
        return taskId === undefined || !hasTask ? null : O.getOrNull(HashMap.get(buffers, taskId));
      })
    ),
    clear: Effect.fn("Partials.clear")((taskId) => Effect.sync(() => clear(taskId))),
    clearByDownload: Effect.fn("Partials.clearByDownload")((downloadTaskId) =>
      Effect.sync(() => {
        const taskId = O.getOrUndefined(HashMap.get(byDownload, downloadTaskId));
        const hasTask = Boolean(taskId);
        if (taskId !== undefined && hasTask) clear(taskId);
      })
    ),
    restoreFromManifest: Effect.fnUntraced(function* (input: RestorePartialsInput) {
      const loaded = yield* manifest.load(input.workDir);
      if (loaded.chunks.length === 0 && loaded.stages.length === 0) return null;
      const restored = set(
        input.taskId,
        input.downloadTaskId,
        A.map(loaded.chunks, (chunk) => ({
          speakerKey: chunk.speakerKey,
          startMs: chunk.startMs,
          endMs: chunk.endMs,
          text: chunk.text,
          words: chunk.words,
          confidence: chunk.confidence,
        }))
      );
      restored.stageHistory = loaded.stages;
      restored.stage = O.getOrUndefined(A.last(loaded.stages))?.stage ?? restored.stage;
      return restored;
    }),
  });
});
export const layer = Layer.effect(Partials, make());
