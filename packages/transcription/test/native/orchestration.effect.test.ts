import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import { EMPTY_PROGRESS } from "@vidbee/task-queue/types";
import * as Arr from "effect/Array";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { CaptionFilesLive } from "../../src/CaptionFiles.layer.js";
import { layer as captionLayer } from "../../src/CaptionImport.layer.js";
import { CaptionImport } from "../../src/CaptionImport.service.js";
import { layer as coordinatorLayer } from "../../src/Coordinator.layer.js";
import { Coordinator, CoordinatorHooks } from "../../src/Coordinator.service.js";
import { layer as enqueueLayer } from "../../src/Enqueue.layer.js";
import { makeMemory } from "../../src/memory-store.js";
import { TranscriptionFilesLive } from "../../src/TranscriptionFiles.layer.js";
import { TranscriptionIds } from "../../src/TranscriptionIds.service.js";
import { TranscriptionQueue } from "../../src/TranscriptionQueue.service.js";
import { layer as recordsLayer } from "../../src/TranscriptionRecords.layer.js";
import { TranscriptionTimeLive } from "../../src/TranscriptionTime.layer.js";
import { TranscriptStore } from "../../src/TranscriptStore.service.js";
import type { Task } from "@vidbee/task-queue/Task.model";
import type { EnqueueTranscriptionInput } from "../../src/Enqueue.model.js";
import type { HostFailure } from "../../src/Transcription.errors.js";
import type { TranscriptionQueueSink } from "../../src/TranscriptionQueue.service.js";

class OrchestrationFixture extends Context.Service<
  OrchestrationFixture,
  {
    readonly coordinator: typeof Coordinator.Service;
    readonly captions: typeof CaptionImport.Service;
    readonly store: typeof TranscriptStore.Service;
    readonly source: string;
    readonly added: string[];
    readonly emit: (id: string) => Effect.Effect<void, HostFailure>;
    readonly release: Effect.Effect<void>;
    readonly entered: Effect.Effect<void>;
    readonly pending: Effect.Effect<void>;
    readonly firstPending: Effect.Effect<void>;
    readonly ready: Effect.Effect<void>;
  }
>()("@vidbee/transcription/test/native/orchestration.effect.test/OrchestrationFixture") {}
const fixture = Layer.effect(
  OrchestrationFixture,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped();
    const source = path.join(root, "movie.mp4");
    yield* fs.writeFileString(source, "media");
    const gate = yield* Deferred.make<void>();
    const entered = yield* Deferred.make<void>();
    let checks = 0;
    let ready = false;
    let listener: TranscriptionQueueSink | null = null;
    const added: string[] = [];
    let nextId = 0;
    const task = (id: string): Task => ({
      id,
      kind: "video",
      parentId: null,
      input: { kind: "video", url: "fixture" },
      priority: 0,
      groupKey: "fixture",
      status: "completed",
      prevStatus: "running",
      statusReason: null,
      enteredStatusAt: 1,
      attempt: 1,
      maxAttempts: 3,
      nextRetryAt: null,
      progress: { ...EMPTY_PROGRESS },
      output: null,
      lastError: null,
      pid: null,
      pidStartedAt: null,
      createdAt: 1,
      updatedAt: 1,
    });
    const queue = Layer.succeed(TranscriptionQueue, {
      get: Effect.fn("fixture.get")((id) => Effect.succeed(task(id))),
      list: Effect.fn("fixture.list")(() => Effect.succeed({ tasks: [], nextCursor: null })),
      add: Effect.fn("fixture.add")((request) =>
        Effect.sync(() => {
          added.push(request.parentId ?? "missing");
          return { id: `added-${added.length}` };
        })
      ),
      cancel: Effect.fn("fixture.cancel")(() => Effect.void),
      retryManual: Effect.fn("fixture.retryManual")(() => Effect.void),
      subscribe: Effect.fn("fixture.subscribe")((sink) =>
        Effect.sync(() => {
          listener = sink;
          return {
            unsubscribe: Effect.sync(() => {
              listener = null;
            }),
          };
        })
      ),
    });
    const hooks = Layer.succeed(CoordinatorHooks, {
      source: Effect.fn("fixture.source")(() => Effect.succeed(source)),
      enabled: Effect.succeed(true),
      modelsReady: Effect.sync(() => {
        checks++;
        return ready;
      }),
      importCaptions: Effect.fn("fixture.import")(() =>
        Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(gate)), Effect.as(false))
      ),
      enqueueInput: Effect.fn("fixture.input")((download: Readonly<Task>, file: string) =>
        Effect.succeed<EnqueueTranscriptionInput>({
          downloadTaskId: download.id,
          sourceFilePath: file,
          trigger: "auto",
        })
      ),
      warn: Effect.fn("fixture.warn")(() => Effect.void),
    });
    const ids = Layer.succeed(TranscriptionIds, {
      uuid: Effect.sync(() => `id-${nextId++}`),
      hex: Effect.fn("fixture.hex")(() => Effect.succeed("hex")),
    });
    const memory = Layer.effect(TranscriptStore, makeMemory()).pipe(
      Layer.provide(ids),
      Layer.provide(TranscriptionTimeLive)
    );
    const records = recordsLayer.pipe(Layer.provideMerge(memory));
    const files = CaptionFilesLive.pipe(Layer.provideMerge(TranscriptionFilesLive));
    const borrowed = Layer.mergeAll(queue, records, files, hooks, LegacyTiming.layer);
    const enqueues = enqueueLayer.pipe(Layer.provideMerge(borrowed));
    const services = Layer.mergeAll(
      memory,
      captionLayer.pipe(Layer.provide(borrowed)),
      coordinatorLayer.pipe(Layer.provideMerge(enqueues))
    );
    const scope = yield* Effect.scope;
    const context = yield* Layer.buildWithScope(services, scope);
    return {
      coordinator: Context.get(context, Coordinator),
      captions: Context.get(context, CaptionImport),
      store: Context.get(context, TranscriptStore),
      source,
      added,
      emit: Effect.fn("fixture.emit")((id) =>
        Effect.suspend(() =>
          listener === null
            ? Effect.void
            : listener.emit({
                type: "transition",
                taskId: id,
                from: "running",
                to: "completed",
                reason: null,
                attempt: 1,
                at: 1,
              })
        )
      ),
      entered: Deferred.await(entered),
      pending: Effect.gen(function* () {
        while (checks < 2) yield* Effect.yieldNow;
      }),
      firstPending: Effect.gen(function* () {
        while (checks < 1) yield* Effect.yieldNow;
      }),
      release: Deferred.succeed(gate, undefined).pipe(Effect.asVoid),
      ready: Effect.sync(() => {
        ready = true;
      }),
    };
  })
).pipe(Layer.provide(NodeServices.layer));
layer(fixture)("native transcription orchestration", (it) => {
  it.effect("stopping during import prevents admission and pending model completions flush in insertion order", () =>
    Effect.gen(function* () {
      const f = yield* OrchestrationFixture;
      yield* f.coordinator.start;
      yield* f.emit("stopped");
      yield* f.entered;
      yield* f.coordinator.stop;
      yield* f.release;
      yield* Effect.yieldNow;
      expect(f.added).toEqual([]);
      yield* f.coordinator.start;
      yield* f.emit("b");
      yield* f.firstPending;
      yield* f.emit("a");
      yield* f.pending;
      expect(f.added).toEqual([]);
      yield* f.ready;
      yield* f.coordinator.flushPending;
      expect(f.added).toEqual(["b", "a"]);
      yield* f.coordinator.stop;
    })
  );
  it.effect("embedded captions commit alternate languages first, retain history, and activate a stored language", () =>
    Effect.gen(function* () {
      const f = yield* OrchestrationFixture;
      const input = { downloadTaskId: "captions", sourceFilePath: f.source, preferredLanguages: ["en"] };
      const record = yield* f.captions.download(input, () =>
        Effect.succeed([
          { language: "fr", text: "00:00.0 --> 00:01.0\nbonjour" },
          { language: "en", text: "00:00.0 --> 00:01.0\nhello" },
        ])
      );
      expect(record?.language).toBe("en");
      const history = yield* f.store.listForDownload("captions");
      expect(history).toHaveLength(2);
      expect(Arr.some(history, (row) => row.language === "fr" && row.supersededAt !== null)).toBe(true);
      const switched = yield* f.captions.switchLanguage({ ...input, language: "fra" });
      expect(switched?.language).toBe("fr");
    })
  );
});
