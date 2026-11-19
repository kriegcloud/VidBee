import { PRIORITY_BACKGROUND, PRIORITY_USER, TRANSCRIPTION_GROUP_KEY } from "@vidbee/task-queue/types";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as HashSet from "effect/HashSet";
import * as Layer from "effect/Layer";
import * as Num from "effect/Number";
import * as Option from "effect/Option";
import * as Order from "effect/Order";
import { parseAsrTier } from "./asr-tiers.js";
import { DEFAULT_CLOUD_TRANSCRIPTION_MODEL, parseTranscriptionProvider } from "./cloud.js";
import { Enqueue } from "./Enqueue.service.js";
import { buildTranscriptionInput } from "./options.js";
import { SourceUnavailable } from "./Transcription.errors.js";
import { TranscriptionFiles } from "./TranscriptionFiles.service.js";
import { TranscriptionQueue } from "./TranscriptionQueue.service.js";
import { TranscriptionRecords } from "./TranscriptionRecords.service.js";
import type { Task } from "@vidbee/task-queue/Task.model";
import type { TaskPage } from "@vidbee/task-queue/TaskStore.service";

const ACTIVE = HashSet.make("queued", "running", "processing", "paused", "retry-scheduled");
export const layer = Layer.effect(
  Enqueue,
  Effect.gen(function* () {
    const queue = yield* TranscriptionQueue;
    const records = yield* TranscriptionRecords;
    const files = yield* TranscriptionFiles;
    const children = Effect.fn("Enqueue.children")(function* (downloadId: string) {
      const out: Readonly<Task>[] = [];
      let cursor: string | null = null;
      do {
        const page: TaskPage = yield* queue.list({ parentId: downloadId, limit: 200, cursor });
        for (const task of page.tasks) if (task.kind === "transcription") out.push(task);
        cursor = page.nextCursor;
      } while (cursor !== null && cursor !== "");
      return Arr.sort(
        out,
        Order.mapInput(Num.Order, (task: Readonly<Task>) => -task.createdAt)
      );
    });
    return Enqueue.of({
      children,
      active: Effect.fn("Enqueue.active")(function* (downloadId) {
        const tasks = yield* children(downloadId);
        return Arr.findFirst(tasks, (task) => task.status === "running" || task.status === "processing").pipe(
          Option.orElse(() => Arr.findFirst(tasks, (task) => HashSet.has(ACTIVE, task.status))),
          Option.getOrUndefined
        );
      }),
      enqueue: Effect.fn("Enqueue.enqueue")(function* (input) {
        if (!(yield* files.exists(input.sourceFilePath)) || (yield* files.stat(input.sourceFilePath)).size <= 0)
          return yield* SourceUnavailable.make({
            operation: "enqueue",
            legacyMessage: `source file missing: ${input.sourceFilePath}`,
          });
        const force = input.trigger === "force";
        const tasks = yield* children(input.downloadTaskId);
        const active = Arr.findFirst(tasks, (task) => HashSet.has(ACTIVE, task.status)).pipe(Option.getOrUndefined);
        if (active !== undefined && !force) return { id: active.id, created: false, reused: true };
        if (active !== undefined && force) yield* queue.cancel(active.id, "user");
        const latest = (yield* children(input.downloadTaskId))[0];
        const record = yield* records.latest(input.downloadTaskId);
        const noSpeech = record?.resultKind === "no-speech" || latest?.output?.transcript?.resultKind === "no-speech";
        const sameProvider =
          parseTranscriptionProvider(input.provider) === parseTranscriptionProvider(latest?.input.options?.provider);
        const sameCloud =
          (input.cloudModelId ?? DEFAULT_CLOUD_TRANSCRIPTION_MODEL) ===
          (latest?.input.options?.cloudModelId ?? DEFAULT_CLOUD_TRANSCRIPTION_MODEL);
        const sameModel =
          sameProvider &&
          (input.provider === "cloud"
            ? sameCloud
            : input.asrTier === undefined ||
              parseAsrTier(input.asrTier) === parseAsrTier(latest?.input.options?.asrTier));
        if (
          latest !== undefined &&
          (latest.status === "failed" || latest.status === "cancelled") &&
          !force &&
          sameModel
        ) {
          yield* queue.retryManual(latest.id);
          return { id: latest.id, created: false, reused: true };
        }
        if (latest !== undefined && latest.status === "completed" && !force && !noSpeech)
          return { id: latest.id, created: false, reused: true };
        const added = yield* queue.add({
          input: buildTranscriptionInput({
            provider: input.provider,
            cloudModelId: input.cloudModelId,
            ...(input.creation === undefined ? {} : { creation: input.creation }),
            downloadTaskId: input.downloadTaskId,
            sourceFilePath: input.sourceFilePath,
            trigger: input.trigger,
            skipVad: force && Boolean(input.rediarize) === false,
            ...(input.title === undefined ? {} : { title: input.title }),
            asrTier: input.asrTier,
            language: input.language,
            speakerCount: input.speakerCount,
            rediarize: input.rediarize === true,
          }),
          parentId: input.downloadTaskId,
          priority: input.priority ?? (input.trigger === "auto" ? PRIORITY_BACKGROUND : PRIORITY_USER),
          groupKey: TRANSCRIPTION_GROUP_KEY,
          maxAttempts: 3,
        });
        return { id: added.id, created: true, reused: false };
      }),
    });
  })
);
