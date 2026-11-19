import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import { layer as capabilitiesLayer } from "@vidbee/downloader-core/ProcessCapabilities.layer";
import { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import { requestLayer } from "@vidbee/task-queue/ProcessControl.driver";
import { TaskExecutor } from "@vidbee/task-queue/TaskExecutor.service";
import * as Arr from "effect/Array";
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
import * as TestClock from "effect/testing/TestClock";
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
import { commitLayer, layer as executorLayer, make as makeExecutor } from "../../src/TranscriptionExecutor.layer.js";
import { ExecutorCommit, ExecutorHooks } from "../../src/TranscriptionExecutor.service.js";
import { TranscriptionFilesLive } from "../../src/TranscriptionFiles.layer.js";
import { TranscriptionHost } from "../../src/TranscriptionHost.service.js";
import { TranscriptionIds } from "../../src/TranscriptionIds.service.js";
import { layer as processLayer } from "../../src/TranscriptionProcess.layer.js";
import { TranscriptionTimeLive } from "../../src/TranscriptionTime.layer.js";
import { TranscriptionTime } from "../../src/TranscriptionTime.service.js";
import { TranscriptStore } from "../../src/TranscriptStore.service.js";
import { layer as attemptLayer } from "../../src/WorkerAttempt.layer.js";
import { WorkerAttempt } from "../../src/WorkerAttempt.service.js";
import { WorkerProtocolLive, WorkerResultJsonLive } from "../../src/WorkerProtocol.layer.js";
import { commandsLayer, layer as runtimeLayer } from "../../src/WorkerRuntime.layer.js";
import { ComputeProvider, RuntimeProbe, WorkerRuntime } from "../../src/WorkerRuntime.service.js";
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
  it.effect("review: native flush publishes and reaps before a delayed worker close", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const probe = yield* RuntimeProbe;
      const node = yield* pinnedNode;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "probe-flush-" });
      const script = path.join(root, "worker.cjs");
      yield* fs.writeFileString(
        script,
        "process.stdin.once('data',()=>{console.log(JSON.stringify({type:'probe-ok',durationMs:7}));setTimeout(()=>process.exit(0),500)});setInterval(()=>{},1000)"
      );
      const result = yield* probe.run({
        execPath: node,
        workerScript: script,
        modelsDir: root,
        provider: "cpu",
        benchmark: true,
      });
      expect(result.ok).toBe(true);
      expect(result.durationMs).toBe(7);
    }).pipe(Effect.timeout("3 seconds"), TestClock.withLive)
  );
  it.effect("review: native heartbeat reports a thrown listener and keeps later ticks", () =>
    Effect.gen(function* () {
      const time = yield* TranscriptionTime;
      const done = yield* Deferred.make<void>();
      let calls = 0;
      const cancel = yield* time.every(
        5,
        Effect.gen(function* () {
          calls++;
          if (calls === 1) return yield* Effect.die(new Error("heartbeat listener"));
          yield* Deferred.succeed(done, undefined);
        }),
        { keepAlive: false }
      );
      yield* Deferred.await(done).pipe(Effect.ensuring(cancel));
      expect(calls).toBeGreaterThanOrEqual(2);
    }).pipe(Effect.timeout("3 seconds"), TestClock.withLive)
  );
  it.effect("review: settled runs release every cancellation child without aborting finished signals", () =>
    Effect.gen(function* () {
      const owner = yield* Scope.make();
      const signals: AbortSignal[] = [];
      const store = yield* TranscriptStore;
      const executor = yield* makeExecutor({ workerScript: "/unused", modelsDir: "/models" }).pipe(
        Effect.provideService(Scope.Scope, owner),
        Effect.provideService(ExecutorCommit, { commit: store.commit }),
        Effect.provideService(ExecutorHooks, {
          ffmpegPath: Effect.succeed("/ffmpeg"),
          gpuKinds: Effect.succeed([]),
          cloud: undefined,
          inProcess: Effect.fn("review.inline")((input: InlineExecutionInput) =>
            Effect.sync(() => {
              signals.push(input.signal);
              if (input.taskId === "scope-8") throw new Error("inline failure");
              return { result: pipelineResult, durationMs: 1 };
            })
          ),
          onStage: () => Effect.void,
          onPartial: () => Effect.void,
          removeScratch: () => Effect.void,
        })
      );
      for (let i = 0; i < 9; i++) {
        const done = yield* Deferred.make<void>();
        yield* executor.run(
          {
            taskId: `scope-${i}`,
            attemptId: "a",
            attemptNumber: 1,
            input: { kind: "transcription", url: "/source", options: { downloadTaskId: `download-${i}` } },
          },
          {
            emit: (event) =>
              event.type === "finish" ? Deferred.succeed(done, undefined).pipe(Effect.asVoid) : Effect.void,
          }
        );
        yield* Deferred.await(done);
        yield* Effect.yieldNow;
        expect(owner.state._tag).toBe("Empty");
      }
      yield* Scope.close(owner, Exit.void);
      expect(signals).toHaveLength(9);
      expect(Arr.every(signals, (signal) => !signal.aborted)).toBe(true);
    })
  );
  it.effect("review: cancel, pause and owner interruption release active run resources once", () =>
    Effect.gen(function* () {
      const store = yield* TranscriptStore;
      for (const mode of ["cancel", "pause", "interrupt"] as const) {
        const owner = yield* Scope.make();
        const prepared = yield* Deferred.make<void>();
        const done = yield* Deferred.make<ExecutorEvent>();
        let aborts = 0;
        const executor = yield* makeExecutor({ workerScript: "/unused", modelsDir: "/models" }).pipe(
          Effect.provideService(Scope.Scope, owner),
          Effect.provideService(ExecutorCommit, { commit: store.commit }),
          Effect.provideService(ExecutorHooks, {
            ffmpegPath: Effect.succeed("/ffmpeg"),
            gpuKinds: Effect.succeed([]),
            cloud: undefined,
            inProcess: Effect.fn("review.waitForAbort")((input: InlineExecutionInput) =>
              Deferred.succeed(prepared, undefined).pipe(
                Effect.andThen(
                  Effect.callback<{ result: typeof pipelineResult; durationMs: number }>((resume) => {
                    const onAbort = () => {
                      aborts++;
                      resume(Effect.succeed({ result: pipelineResult, durationMs: 1 }));
                    };
                    input.signal.addEventListener("abort", onAbort, { once: true });
                    if (input.signal.aborted) onAbort();
                    return Effect.sync(() => input.signal.removeEventListener("abort", onAbort));
                  })
                )
              )
            ),
            onStage: () => Effect.void,
            onPartial: () => Effect.void,
            removeScratch: () => Effect.void,
          })
        );
        const handle = yield* executor.run(
          {
            taskId: mode,
            attemptId: "a",
            attemptNumber: 1,
            input: { kind: "transcription", url: "/source", options: { downloadTaskId: mode } },
          },
          {
            emit: (event) =>
              event.type === "finish" ? Deferred.succeed(done, event).pipe(Effect.asVoid) : Effect.void,
          }
        );
        yield* Deferred.await(prepared);
        if (mode === "cancel") yield* handle.cancel();
        else if (mode === "pause") yield* handle.pause;
        else yield* Scope.close(owner, Exit.void);
        const finish = yield* Deferred.await(done);
        yield* Effect.yieldNow;
        expect(finish.type).toBe("finish");
        if (finish.type === "finish") expect(finish.result.type).toBe("cancelled");
        expect(aborts).toBe(1);
        expect(owner.state._tag).toBe(mode === "interrupt" ? "Closed" : "Empty");
        yield* Scope.close(owner, Exit.void);
        expect(aborts).toBe(1);
      }
    })
  );
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
