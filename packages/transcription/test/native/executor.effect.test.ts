import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import { layer as capabilitiesLayer } from "@vidbee/downloader-core/ProcessCapabilities.layer";
import { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import { requestLayer } from "@vidbee/task-queue/ProcessControl.driver";
import { TaskExecutor } from "@vidbee/task-queue/TaskExecutor.service";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as S from "effect/Schema";
import * as Scope from "effect/Scope";
import { AtomicFilesLive } from "../../src/AtomicFiles.layer.js";
import { abortLayer } from "../../src/Audio.layer.js";
import { CheckpointsLive } from "../../src/Checkpoints.layer.js";
import { layer as providerLayer } from "../../src/ComputeProvider.layer.js";
import { memoryLayer } from "../../src/memory-store.js";
import { layer as partialsLayer } from "../../src/Partials.layer.js";
import { PartialsManifestLive } from "../../src/PartialsManifest.layer.js";
import { layer as probeLayer } from "../../src/RuntimeProbe.layer.js";
import { SeedFilesLive } from "../../src/SeedFiles.layer.js";
import { SeedStoreLive, SeedsLive } from "../../src/Seeds.layer.js";
import { commitLayer, layer as executorLayer } from "../../src/TranscriptionExecutor.layer.js";
import { ExecutorHooks } from "../../src/TranscriptionExecutor.service.js";
import { TranscriptionFilesLive } from "../../src/TranscriptionFiles.layer.js";
import { TranscriptionHost } from "../../src/TranscriptionHost.service.js";
import { TranscriptionIds } from "../../src/TranscriptionIds.service.js";
import { layer as processLayer } from "../../src/TranscriptionProcess.layer.js";
import { TranscriptionTimeLive } from "../../src/TranscriptionTime.layer.js";
import { TranscriptStore } from "../../src/TranscriptStore.service.js";
import { layer as attemptLayer } from "../../src/WorkerAttempt.layer.js";
import { WorkerAttempt } from "../../src/WorkerAttempt.service.js";
import { WorkerProtocolLive, WorkerResultJsonLive } from "../../src/WorkerProtocol.layer.js";
import { commandsLayer, layer as runtimeLayer } from "../../src/WorkerRuntime.layer.js";
import { ComputeProvider, WorkerRuntime } from "../../src/WorkerRuntime.service.js";
import { pinnedNode } from "../fixtures/pinned-node.js";
import type { ExecutorEvent } from "@vidbee/task-queue/TaskExecutor.service";
import type { InlineExecutionInput } from "../../src/TranscriptionExecutor.model.js";
import type { InlineExecutionSink } from "../../src/TranscriptionExecutor.service.js";
import type { WorkerProcessRun } from "../../src/TranscriptionProcess.service.js";

const host = Layer.succeed(TranscriptionHost, {
  snapshot: Effect.succeed({
    platform: "linux",
    arch: "x64",
    pid: 1,
    execPath: "/fixture/node",
    cwd: "/",
    temporaryDirectory: "/tmp",
    resourceDirectories: [],
    environment: {},
    cpuModel: "fixture",
    cpuCount: 1,
    ramBytes: 1,
    locale: "en",
    timeZone: "UTC",
  }),
  lowerPriority: Effect.fn("fixture.lowerPriority")(() => Effect.void),
  workerEnvironment: Effect.fn("fixture.workerEnvironment")(() => Effect.succeed({})),
  libraryDirectory: Effect.succeed(null),
  machine: Effect.fn("fixture.machine")(() => Effect.die("unused machine")),
  isProcessAlive: Effect.fn("fixture.isProcessAlive")(() => Effect.succeed(false)),
});
const ids = Layer.sync(TranscriptionIds, () => {
  let n = 0;
  return { uuid: Effect.sync(() => `fixture-${n++}`), hex: Effect.fn("fixture.hex")(() => Effect.succeed("abcdef")) };
});
const foundation = Layer.mergeAll(
  TranscriptionFilesLive,
  host,
  TranscriptionTimeLive,
  ids,
  LegacyTiming.layer,
  abortLayer
).pipe(Layer.provideMerge(NodeServices.layer));
const atomic = AtomicFilesLive.pipe(Layer.provideMerge(foundation));
const base = Layer.mergeAll(
  CheckpointsLive,
  WorkerProtocolLive.pipe(Layer.provide(WorkerResultJsonLive)),
  SeedFilesLive,
  memoryLayer
).pipe(Layer.provideMerge(atomic));
const partials = partialsLayer.pipe(Layer.provide(PartialsManifestLive), Layer.provideMerge(base));
const seeds = SeedsLive.pipe(Layer.provide(SeedStoreLive), Layer.provideMerge(partials));
const process = processLayer.pipe(
  Layer.provide(capabilitiesLayer),
  Layer.provide(requestLayer),
  Layer.provideMerge(seeds)
);
const probe = probeLayer.pipe(Layer.provideMerge(process));
const discovery = Layer.mergeAll(runtimeLayer, providerLayer).pipe(
  Layer.provide(commandsLayer),
  Layer.provideMerge(probe)
);
const attempt = attemptLayer.pipe(Layer.provideMerge(discovery));
const pipelineResult = {
  resultKind: "no-speech" as const,
  language: null,
  modelVersion: "fixture",
  asrTier: null,
  speakers: [],
  segments: [],
};
const hooks = Layer.succeed(ExecutorHooks, {
  ffmpegPath: Effect.succeed("/ffmpeg"),
  gpuKinds: Effect.succeed([]),
  cloud: undefined,
  inProcess: Effect.fn("fixture.inProcess")((_input: InlineExecutionInput, sink: InlineExecutionSink) =>
    sink.progress("recognizing", 0.5).pipe(Effect.as({ result: pipelineResult, durationMs: 12 }))
  ),
  onStage: Effect.fn("fixture.onStage")(() => Effect.void),
  onPartial: Effect.fn("fixture.onPartial")(() => Effect.void),
  removeScratch: Effect.fn("fixture.removeScratch")(() => Effect.void),
});
const services = executorLayer({ workerScript: "/unused", modelsDir: "/models" }).pipe(
  Layer.provide(commitLayer),
  Layer.provide(hooks),
  Layer.provideMerge(attempt)
);
layer(services)("native worker and executor", (it) => {
  it.effect("resolves a native executable and benchmarks the explicit accelerator ladder", () =>
    Effect.gen(function* () {
      const runtime = yield* WorkerRuntime;
      const providers = yield* ComputeProvider;
      const node = yield* pinnedNode;
      let probed = 0;
      const resolved = yield* runtime.resolve({
        envPath: node,
        electronPath: node,
        forceLayer: "env",
        lookUpSystem: false,
        probe: Effect.fn("fixture.runtimeProbe")(() =>
          Effect.sync(() => {
            probed += 1;
            return true;
          })
        ),
      });
      expect(resolved.execPath).toBe(node);
      expect(resolved.layer).toBe("env");
      expect(probed).toBe(1);
      const calls: string[] = [];
      const selection = yield* providers.select({
        platform: "linux",
        arch: "x64",
        gpuKinds: ["nvidia"],
        probe: Effect.fn("fixture.providerProbe")((provider) =>
          Effect.sync(() => {
            calls.push(provider);
            return { provider, ok: true, error: null, durationMs: provider === "cuda" ? 1 : 10 };
          })
        ),
      });
      expect(calls).toEqual(["cuda", "cpu"]);
      expect(selection.provider).toBe("cuda");
      expect(selection.reason).toBe("accelerator-faster");
    })
  );
  it.effect("runs the task queue contract against the same memory store", () =>
    Effect.gen(function* () {
      const executor = yield* TaskExecutor;
      const store = yield* TranscriptStore;
      const done = yield* Deferred.make<ExecutorEvent>();
      const events: ExecutorEvent[] = [];
      yield* executor.run(
        {
          taskId: "task",
          attemptId: "attempt",
          attemptNumber: 1,
          input: { kind: "transcription", url: "/source", options: { downloadTaskId: "download" } },
        },
        {
          emit: Effect.fn("fixture.emit")(function* (event) {
            events.push(event);
            if (event.type === "finish") yield* Deferred.succeed(done, event);
          }),
        }
      );
      const finish = yield* Deferred.await(done);
      expect(finish.type).toBe("finish");
      if (finish.type === "finish") expect(finish.result.type).toBe("success");
      const record = yield* store.getByTranscriptionTaskId("task");
      expect(record?.resultKind).toBe("no-speech");
      expect(events[0]?.type).toBe("spawn");
      expect(events[1]?.type).toBe("progress");
    })
  );
  it.effect("reads streaming worker messages and reaps before returning a result", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const worker = yield* WorkerAttempt;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "worker-native-" });
      const node = yield* pinnedNode;
      const script = path.join(root, "worker.cjs");
      const encodedResult = yield* S.encodeEffect(S.fromJsonString(S.Unknown))(pipelineResult);
      yield* fs.writeFileString(
        script,
        `process.stdin.once('data',()=>{const text=JSON.stringify({type:'log',stream:'stdout',line:'é'});const b=Buffer.from(text+'\\n');const at=b.indexOf(Buffer.from('é'));process.stdout.write(b.subarray(0,at+1));setImmediate(()=>{process.stdout.write(b.subarray(at+1));console.log(JSON.stringify({type:'result',result:${encodedResult},durationMs:7}));});});setInterval(()=>{},1000)`
      );
      const signal = yield* Effect.abortSignal;
      const attached: { run: WorkerProcessRun | null } = { run: null };
      const logs: string[] = [];
      let errors = "";
      const output = yield* worker.run(
        {
          execPath: node,
          workerScript: script,
          signal,
          start: {
            type: "start",
            taskId: "worker",
            attemptId: "attempt",
            sourceFilePath: "/source",
            ffmpegPath: "/ffmpeg",
            workDir: root,
            modelsDir: root,
            skipVad: false,
            autoSkipAllowed: false,
            backend: "fake",
            fingerprint: "fixture",
            modelVersion: "fixture",
            asrTier: "minimal",
            provider: "cpu",
          },
        },
        {
          progress: () => Effect.void,
          partial: () => Effect.void,
          log: (_stream, line) =>
            Effect.sync(() => {
              logs.push(line);
            }),
          heartbeat: Effect.void,
          stderr: (text) =>
            Effect.sync(() => {
              errors += text;
            }),
          stderrTail: () => errors,
          attach: (next) =>
            Effect.sync(() => {
              if (next !== null) attached.run = next;
            }),
        }
      );
      expect(output.durationMs).toBe(7);
      expect(logs).toEqual(["é"]);
      if (attached.run !== null) {
        const outcome = yield* attached.run.awaitReaped;
        expect(outcome._tag).toBe("Native");
      }
    })
  );
  it.effect("cancels an acquired native worker and waits for its observed exit", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const worker = yield* WorkerAttempt;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "worker-cancel-native-" });
      const node = yield* pinnedNode;
      const script = path.join(root, "worker.cjs");
      yield* fs.writeFileString(
        script,
        "process.stdin.once('data',()=>console.log(JSON.stringify({type:'progress',stage:'recognizing',percent:0})));setInterval(()=>{},1000)"
      );
      const cancellation = yield* Scope.make();
      const signal = yield* Effect.abortSignal.pipe(Effect.provideService(Scope.Scope, cancellation));
      const ready = yield* Deferred.make<void>();
      const attached: { run: WorkerProcessRun | null } = { run: null };
      const fiber = yield* worker
        .run(
          {
            execPath: node,
            workerScript: script,
            signal,
            start: {
              type: "start",
              taskId: "cancel",
              attemptId: "attempt",
              sourceFilePath: "/source",
              ffmpegPath: "/ffmpeg",
              workDir: root,
              modelsDir: root,
              skipVad: false,
              autoSkipAllowed: false,
              backend: "fake",
              fingerprint: "fixture",
              modelVersion: "fixture",
              asrTier: "minimal",
              provider: "cpu",
            },
          },
          {
            progress: () => Deferred.succeed(ready, undefined).pipe(Effect.asVoid),
            partial: () => Effect.void,
            log: () => Effect.void,
            heartbeat: Effect.void,
            stderr: () => Effect.void,
            stderrTail: () => "",
            attach: (run) =>
              Effect.sync(() => {
                if (run !== null) attached.run = run;
              }),
          }
        )
        .pipe(Effect.result, Effect.forkScoped);
      yield* Deferred.await(ready);
      yield* Scope.close(cancellation, Exit.void);
      const result = yield* Fiber.join(fiber);
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) expect(result.failure.legacyMessage).toBe("cancelled");
      if (attached.run !== null) {
        const observed = yield* attached.run.awaitReaped;
        expect(observed._tag).toBe("Native");
      }
    })
  );
});
