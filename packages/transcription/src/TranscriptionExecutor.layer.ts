import { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import { TaskExecutor } from "@vidbee/task-queue/TaskExecutor.service";
import { HostFailure as QueueHostFailure } from "@vidbee/task-queue/TaskQueue.errors";
import * as A from "effect/Array";
import * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import * as Layer from "effect/Layer";
import * as O from "effect/Option";
import * as Path from "effect/Path";
import * as S from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Str from "effect/String";
import { DEFAULT_ASR_TIER, parseAsrTier } from "./asr-tiers.js";
import { Checkpoints } from "./Checkpoints.service.js";
import { manifestWorkKey } from "./chunk-manifest.js";
import { classifyTranscriptionFailure } from "./errors.js";
import { TranscriptionStage as StageSchema, TranscriptResultKind } from "./Literal.model.js";
import { modelVersion } from "./model-catalog.js";
import { readTranscriptionOptions } from "./options.js";
import { Partials } from "./Partials.service.js";
import { DEFAULT_MAX_WORKER_RESTARTS, formatRuntimeLog } from "./runtime.js";
import { SeedFiles } from "./SeedFiles.service.js";
import { Seeds } from "./Seeds.service.js";
import { SEED_TRANSCRIPT_FILE } from "./speaker-assign.js";
import { DEFAULT_SPEAKER_COUNT, parseSpeakerCount } from "./speaker-count.js";
import { HostFailure, WorkerFailure } from "./Transcription.errors.js";
import { ExecutorCommit, ExecutorHooks } from "./TranscriptionExecutor.service.js";
import { TranscriptionFiles } from "./TranscriptionFiles.service.js";
import { TranscriptionHost } from "./TranscriptionHost.service.js";
import { TranscriptionTime } from "./TranscriptionTime.service.js";
import { TranscriptStore } from "./TranscriptStore.service.js";
import { WorkerExitFailure } from "./WorkerAttempt.model.js";
import { WorkerAttempt } from "./WorkerAttempt.service.js";
import { ComputeProvider, WorkerRuntime } from "./WorkerRuntime.service.js";
import type { ExecutorContext, ExecutorFinishEvent } from "@vidbee/task-queue/Executor.model";
import type { ExecutorSink } from "@vidbee/task-queue/TaskExecutor.service";
import type { SherpaProviderSelection } from "./Host.model.js";
import type { GpuKind, SherpaExecutionProvider, TranscriptionStage } from "./Literal.model.js";
import type { PipelineSegment } from "./Pipeline.model.js";
import type { WorkerRuntime as RuntimeValue } from "./Runtime.model.js";
import type { TranscriptionError } from "./Transcription.errors.js";
import type { TranscriptionExecutorConfig } from "./TranscriptionExecutor.model.js";
import type { ExecutionResult } from "./TranscriptionExecutor.service.js";
import type { WorkerProcessRun } from "./TranscriptionProcess.service.js";
import type { StoreError } from "./TranscriptStore.service.js";

type Failure = TranscriptionError | WorkerExitFailure | StoreError;
const active = HashSet.make("preparing-models", "preparing-audio", "detecting-speech", "diarizing", "recognizing");
const original = (error: unknown): unknown => {
  if (S.is(HostFailure)(error) && error.cause !== undefined) return error.cause;
  if (
    error !== null &&
    typeof error === "object" &&
    "legacyMessage" in error &&
    typeof error.legacyMessage === "string"
  )
    return new Error(error.legacyMessage);
  return error;
};
const message = (error: unknown): string => {
  const value = original(error);
  return value instanceof Error ? value.message : String(value);
};
const hostFailure = (operation: string) => (error: unknown) =>
  HostFailure.make({ operation, legacyMessage: message(error), cause: original(error) });
const recoverable = (error: unknown): boolean =>
  S.is(WorkerExitFailure)(error)
    ? error.signal === "SIGTRAP" || error.signal === "SIGABRT" || error.signal === "SIGSEGV" || error.code !== 0
    : /exited without result|SIGTRAP|SIGABRT/i.test(message(error));
export const make = Effect.fnUntraced(function* (config: TranscriptionExecutorConfig) {
  const runtime = yield* WorkerRuntime;
  const providers = yield* ComputeProvider;
  const attempts = yield* WorkerAttempt;
  const hooks = yield* ExecutorHooks;
  const time = yield* TranscriptionTime;
  const host = yield* TranscriptionHost;
  const files = yield* TranscriptionFiles;
  const path = yield* Path.Path;
  const store = yield* ExecutorCommit;
  const checkpoints = yield* Checkpoints;
  const partials = yield* Partials;
  const seeds = yield* Seeds;
  const seedFiles = yield* SeedFiles;
  const timing = yield* LegacyTiming;
  const owner = yield* Effect.scope;
  let resolution: Deferred.Deferred<RuntimeValue, Failure> | null = null;
  let selections = HashMap.empty<string, SherpaProviderSelection>();
  let probes = HashMap.empty<string, Deferred.Deferred<SherpaProviderSelection, Failure>>();
  const awaitAt = <V, E>(effect: Effect.Effect<V, E>, point: string) =>
    effect.pipe(Effect.onExit(() => timing.turn(point)));
  const remove = (workDir: string) =>
    Str.includes(`${path.sep}vidbee-transcript${path.sep}`)(workDir) ? hooks.removeScratch(workDir) : Effect.void;
  const emitStd = (ctx: ExecutorContext, sink: ExecutorSink, stream: "stdout" | "stderr", line: string) =>
    sink.emit({ type: "std", taskId: ctx.taskId, attemptId: ctx.attemptId, stream, line });
  const resolve = Effect.fnUntraced(function* (ctx: ExecutorContext, sink: ExecutorSink) {
    if (resolution !== null) return yield* Deferred.await(resolution);
    const pending = yield* Deferred.make<RuntimeValue, Failure>();
    resolution = pending;
    const work = Effect.gen(function* () {
      const snapshot = yield* host.snapshot;
      const cache = yield* runtime.createFileProbeCache(
        path.join(config.workDir ?? snapshot.temporaryDirectory, "vidbee-runtime-probe.json")
      );
      return yield* runtime.resolve({
        envPath: snapshot.environment.VIDBEE_TRANSCRIPTION_NODE ?? null,
        bundledPath: config.bundledNodePath ?? null,
        electronPath: config.execPath ?? snapshot.execPath,
        forceLayer: config.forceLayer,
        cache,
        probe:
          config.skipProbe === true
            ? undefined
            : Effect.fnUntraced(function* (candidate) {
                yield* emitStd(ctx, sink, "stdout", `runtime.probe=${candidate.layer}`);
                const env = yield* host.workerEnvironment(config.env, candidate.layer === "electron");
                return yield* runtime
                  .probe({
                    execPath: candidate.execPath,
                    execArgv: config.execArgv,
                    workerScript: config.workerScript,
                    modelsDir: config.modelsDir,
                    env,
                  })
                  .pipe(
                    Effect.mapError(hostFailure("runtimeProbe")),
                    Effect.onExit(() => timing.turn("executor.runtime.probe"))
                  );
              }),
      });
    });
    yield* Effect.forkIn(
      work.pipe(
        Effect.onExit((exit) =>
          Effect.gen(function* () {
            if (Exit.isFailure(exit) && resolution === pending) resolution = null;
            yield* Deferred.done(pending, exit);
          })
        )
      ),
      owner,
      { startImmediately: true }
    );
    return yield* Deferred.await(pending);
  });
  const compute = Effect.fnUntraced(function* (
    candidate: RuntimeValue,
    asrTier: Parameters<typeof runtime.probeProvider>[0]["asrTier"],
    ctx: ExecutorContext,
    sink: ExecutorSink
  ) {
    let gpuKinds: readonly GpuKind[] = [];
    gpuKinds = yield* hooks.gpuKinds.pipe(
      Effect.catch((error) =>
        emitStd(ctx, sink, "stderr", `compute.gpu-probe=failed error=${message(error)}`).pipe(Effect.as([]))
      )
    );
    const key = A.join(
      [
        candidate.execPath,
        candidate.version,
        modelVersion,
        asrTier ?? "",
        A.join(
          A.sort(gpuKinds, (left: GpuKind, right: GpuKind) => (left < right ? -1 : left > right ? 1 : 0)),
          ","
        ),
      ],
      "|"
    );
    const cached = O.getOrUndefined(HashMap.get(selections, key));
    if (cached !== undefined) {
      yield* emitStd(ctx, sink, "stdout", `compute.provider=${cached.provider} reason=process-cache`);
      return { cacheKey: key, selection: cached };
    }
    if (config.backend === "fake" || config.skipProbe === true) {
      const selection: SherpaProviderSelection = {
        cacheable: true,
        candidates: ["cpu"],
        provider: "cpu",
        reason: config.backend === "fake" ? "fake-backend" : "provider-probe-disabled",
      };
      selections = HashMap.set(selections, key, selection);
      return { cacheKey: key, selection };
    }
    const pending = O.getOrUndefined(HashMap.get(probes, key));
    if (pending !== undefined) {
      const selection = yield* awaitAt(Deferred.await(pending), "executor.compute.pending");
      yield* emitStd(ctx, sink, "stdout", `compute.provider=${selection.provider} reason=in-flight-probe`);
      return { cacheKey: key, selection };
    }
    const current = yield* Deferred.make<SherpaProviderSelection, Failure>();
    probes = HashMap.set(probes, key, current);
    const work = providers.select({
      gpuKinds,
      probe: Effect.fnUntraced(function* (provider) {
        const env = yield* host.workerEnvironment(config.env, candidate.layer === "electron");
        const result = yield* awaitAt(
          runtime
            .probeProvider({
              execPath: candidate.execPath,
              execArgv: config.execArgv,
              workerScript: config.workerScript,
              modelsDir: config.modelsDir,
              provider,
              asrTier,
              benchmark: true,
              timeoutMs: 20000,
              env,
            })
            .pipe(Effect.mapError(hostFailure("providerProbe"))),
          "executor.compute.probe"
        );
        const detail = result.error === null ? "none" : Str.trim(Str.replace(/\s+/g, " ")(result.error));
        yield* emitStd(
          ctx,
          sink,
          result.ok ? "stdout" : "stderr",
          `compute.probe=${provider} ok=${result.ok} durationMs=${result.durationMs ?? "none"} error=${detail}`
        );
        return result;
      }),
    });
    yield* Effect.forkIn(work.pipe(Effect.onExit((exit) => Deferred.done(current, exit))), owner, {
      startImmediately: true,
    });
    const selection = yield* awaitAt(Deferred.await(current), "executor.compute.selection").pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (O.getOrUndefined(HashMap.get(probes, key)) === current) probes = HashMap.remove(probes, key);
        })
      )
    );
    yield* emitStd(
      ctx,
      sink,
      "stdout",
      `compute.provider=${selection.provider} reason=${selection.reason} candidates=${A.join(selection.candidates, ",")}`
    );
    if (selection.cacheable) selections = HashMap.set(selections, key, selection);
    return { cacheKey: key, selection };
  });
  return TaskExecutor.of({
    run: Effect.fn("TranscriptionExecutor.run")(function* (ctx, sink) {
      const parsed = readTranscriptionOptions(ctx.input);
      const cancellation = yield* Scope.fork(owner);
      const signal = yield* Effect.abortSignal.pipe(Effect.provideService(Scope.Scope, cancellation));
      let child: WorkerProcessRun | null = null;
      let finished = false;
      const finish = Effect.fnUntraced(function* (
        result: ExecutorFinishEvent["result"],
        tails = { stdout: "", stderr: "" }
      ) {
        if (finished) return;
        finished = true;
        const closedAt = yield* time.now;
        yield* sink.emit({
          type: "finish",
          taskId: ctx.taskId,
          attemptId: ctx.attemptId,
          result,
          closedAt,
          stdoutTail: tails.stdout,
          stderrTail: tails.stderr,
        });
      });
      const execute = Effect.gen(function* () {
        if (parsed === null)
          return yield* WorkerFailure.make({
            operation: "executor",
            legacyMessage: "source file missing: transcription options incomplete",
          });
        const asrTier = parseAsrTier(parsed.asrTier, DEFAULT_ASR_TIER);
        const speakerCount = parseSpeakerCount(parsed.speakerCount, DEFAULT_SPEAKER_COUNT);
        const snapshot = yield* host.snapshot;
        const pidStartedAt = yield* time.now;
        const spawnedAt = yield* time.now;
        yield* sink.emit({
          type: "spawn",
          taskId: ctx.taskId,
          attemptId: ctx.attemptId,
          pid: snapshot.pid,
          pidStartedAt,
          spawnedAt,
          kind: "ai-worker",
        });
        let persistDir: string | null = null;
        let lastStage: TranscriptionStage | null = null;
        const tails = { stdout: "", stderr: "" };
        const progress = Effect.fnUntraced(function* (
          stage: TranscriptionStage,
          percent: number | null,
          ticks: number
        ) {
          const next = yield* partials.setStage(ctx.taskId, parsed.downloadTaskId, stage);
          const changed = stage !== lastStage;
          lastStage = stage;
          if (changed && persistDir !== null)
            yield* checkpoints.saveStages(persistDir, next.stageHistory).pipe(
              Effect.catchIf(
                (error) => /cancelled|enoent/i.test(message(error)),
                () => Effect.void
              )
            );
          if (changed) yield* hooks.onStage({ taskId: ctx.taskId, downloadTaskId: parsed.downloadTaskId, stage });
          yield* sink.emit({
            type: "progress",
            taskId: ctx.taskId,
            attemptId: ctx.attemptId,
            progress: { percent, bytesDownloaded: null, bytesTotal: null, speedBps: null, etaMs: null, ticks },
            enteredProcessing: stage === "committing" || !HashSet.has(active, stage),
          });
          yield* emitStd(ctx, sink, "stdout", `stage=${stage}`);
        });
        const partial = Effect.fnUntraced(function* (segment: PipelineSegment) {
          const next = yield* partials.append(ctx.taskId, parsed.downloadTaskId, segment);
          yield* hooks.onPartial({
            taskId: ctx.taskId,
            downloadTaskId: parsed.downloadTaskId,
            segments: next.segments,
          });
        });
        const inlineSink = {
          progress: Effect.fnUntraced(function* (stage: TranscriptionStage, percent: number | null) {
            const ticks = yield* time.now;
            yield* progress(stage, percent, ticks).pipe(Effect.mapError(hostFailure("progress")));
          }),
          partial,
        };
        const existing = parsed.rediarize === true ? yield* seeds.latestTranscript(parsed.downloadTaskId) : null;
        const inline = {
          taskId: ctx.taskId,
          sourceFilePath: parsed.sourceFilePath,
          modelId: parsed.cloudModelId ?? "",
          skipVad: parsed.skipVad === true,
          autoSkipAllowed: parsed.trigger === "auto" && parsed.skipVad !== true,
          asrTier,
          language: parsed.language,
          speakerCount,
          existingTranscript: existing ?? undefined,
          signal,
        };
        let output: ExecutionResult;
        if (parsed.provider === "cloud" && parsed.rediarize !== true) {
          yield* partials.clear(ctx.taskId);
          if (hooks.cloud === undefined)
            return yield* WorkerFailure.make({
              operation: "executor",
              legacyMessage: "Cloud transcription is unavailable in this application",
            });
          output = yield* hooks.cloud(
            { taskId: inline.taskId, sourceFilePath: inline.sourceFilePath, modelId: inline.modelId, signal },
            inlineSink
          );
        } else if (hooks.inProcess !== undefined) output = yield* hooks.inProcess(inline, inlineSink);
        else {
          const fingerprint = yield* checkpoints.sourceFingerprint(parsed.sourceFilePath);
          const version = `${modelVersion}:${asrTier}:spk-${speakerCount}`;
          const workDir = path.join(
            config.workDir ?? snapshot.temporaryDirectory,
            "vidbee-transcript",
            manifestWorkKey(ctx.taskId, fingerprint, version)
          );
          yield* files.mkdir(workDir, true);
          persistDir = workDir;
          const workerWork = Effect.gen(function* () {
            yield* checkpoints.ensure({ workDir, taskId: ctx.taskId, fingerprint, modelVersion: version });
            const restored = yield* partials.restoreFromManifest({
              taskId: ctx.taskId,
              downloadTaskId: parsed.downloadTaskId,
              workDir,
            });
            if (restored !== null) {
              yield* hooks.onPartial({
                taskId: ctx.taskId,
                downloadTaskId: parsed.downloadTaskId,
                segments: restored.segments,
              });
              if (S.is(StageSchema)(restored.stage))
                yield* hooks.onStage({
                  taskId: ctx.taskId,
                  downloadTaskId: parsed.downloadTaskId,
                  stage: restored.stage,
                });
            }
            const candidate = yield* awaitAt(resolve(ctx, sink), "executor.resolveRuntime");
            for (const line of formatRuntimeLog(candidate, 0)) {
              tails.stdout += `${line}\n`;
              yield* emitStd(ctx, sink, "stdout", line);
            }
            const selected = yield* awaitAt(compute(candidate, asrTier, ctx, sink), "executor.resolveCompute");
            const existingTranscriptPath = existing === null ? undefined : path.join(workDir, SEED_TRANSCRIPT_FILE);
            if (existing !== null && existingTranscriptPath !== undefined)
              yield* seedFiles.write(existingTranscriptPath, existing);
            const run = Effect.fnUntraced(function* (provider: SherpaExecutionProvider) {
              const env = yield* host.workerEnvironment(config.env, candidate.layer === "electron");

              return yield* attempts.run(
                {
                  execPath: candidate.execPath,
                  execArgv: config.execArgv,
                  workerScript: config.workerScript,
                  env,
                  signal,
                  start: {
                    type: "start",
                    taskId: ctx.taskId,
                    attemptId: ctx.attemptId,
                    sourceFilePath: parsed.sourceFilePath,
                    ffmpegPath: "",
                    workDir,
                    modelsDir: config.modelsDir,
                    skipVad: parsed.skipVad === true,
                    autoSkipAllowed: parsed.trigger === "auto" && parsed.skipVad !== true,
                    backend: config.backend ?? "sherpa",
                    fingerprint,
                    modelVersion: version,
                    asrTier,
                    provider,
                    language: parsed.language,
                    speakerCount,
                    existingTranscriptPath,
                  },
                },
                {
                  ffmpegPath: hooks.ffmpegPath,
                  heartbeat: emitStd(ctx, sink, "stdout", "worker-alive"),
                  progress: (stage, percent, ticks) =>
                    progress(stage, percent, ticks).pipe(Effect.mapError(hostFailure("progress"))),
                  partial,
                  log: (stream, line) =>
                    Effect.sync(() => {
                      tails[stream] += `${line}\n`;
                    }).pipe(Effect.andThen(emitStd(ctx, sink, stream, line))),
                  stderr: (text) =>
                    Effect.sync(() => {
                      tails.stderr += text;
                    }),
                  stderrTail: () => tails.stderr,
                  attach: (next, expected) =>
                    Effect.sync(() => {
                      if (expected === undefined || child === expected) child = next;
                    }),
                }
              );
            });
            let result: ExecutionResult | undefined;
            if (selected.selection.provider !== "cpu")
              result = yield* awaitAt(run(selected.selection.provider), "executor.worker.accelerator").pipe(
                Effect.catch(
                  Effect.fnUntraced(function* (error) {
                    if (signal.aborted) return yield* error;
                    const detail = message(error);
                    const line = `compute.fallback=cpu from=${selected.selection.provider} error=${Str.trim(Str.replace(/\s+/g, " ")(detail))}`;
                    tails.stderr += `${line}\n`;
                    yield* emitStd(ctx, sink, "stderr", line);
                    selections = HashMap.set(selections, selected.cacheKey, {
                      ...selected.selection,
                      cacheable: true,
                      provider: "cpu",
                      reason: "runtime-provider-failure",
                    });
                    return undefined;
                  })
                )
              );
            let restarts = 0;
            while (result === undefined) {
              result = yield* awaitAt(run("cpu"), "executor.worker.cpu").pipe(
                Effect.catch(
                  Effect.fnUntraced(function* (error) {
                    if (
                      signal.aborted ||
                      !recoverable(error) ||
                      restarts >= (config.maxWorkerRestarts ?? DEFAULT_MAX_WORKER_RESTARTS)
                    )
                      return yield* error;
                    restarts += 1;
                    const line = `runtime.restarts=${restarts}`;
                    tails.stdout += `${line}\n`;
                    yield* emitStd(ctx, sink, "stdout", line);
                    return undefined;
                  })
                )
              );
            }
            yield* remove(workDir);
            yield* partials.clear(ctx.taskId);
            return result;
          });
          const workerExit = yield* Effect.exit(workerWork);
          if (Exit.isFailure(workerExit)) {
            if (signal.aborted) {
              yield* remove(workDir);
              yield* partials.clear(ctx.taskId);
              return { result: { type: "cancelled" as const }, tails };
            }
            const errorValue = Cause.squash(workerExit.cause);
            const classified = classifyTranscriptionFailure(original(errorValue));
            return {
              result: {
                type: "error" as const,
                error: classified,
                exitCode: S.is(WorkerExitFailure)(errorValue) ? errorValue.code : null,
              },
              tails: {
                stdout: tails.stdout,
                stderr: Str.trim(tails.stderr).length > 0 ? tails.stderr : classified.rawMessage,
              },
            };
          }
          output = workerExit.value;
        }
        if (signal.aborted) return { result: { type: "cancelled" as const }, tails };
        const committed = yield* store.commit({
          downloadTaskId: parsed.downloadTaskId,
          transcriptionTaskId: ctx.taskId,
          sourceFilePath: parsed.sourceFilePath,
          result: output.result,
        });
        const resultKind = yield* S.decodeUnknownEffect(TranscriptResultKind)(committed.resultKind).pipe(
          Effect.mapError(hostFailure("commitResultKind"))
        );
        if (output.cleanup !== undefined) {
          yield* output.cleanup;
          yield* partials.clear(ctx.taskId);
        }
        return {
          result: {
            type: "success" as const,
            output: {
              filePath: parsed.sourceFilePath,
              size: 1,
              durationMs: output.durationMs || null,
              sha256: null,
              transcript: { resultKind, transcriptId: committed.id },
            },
          },
          tails,
        };
      });
      const work = awaitAt(execute, "executor.execute").pipe(
        Effect.flatMap((outcome) => finish(outcome.result, outcome.tails)),
        Effect.catchCause((cause) => {
          const complete = Effect.suspend(() => {
            if (signal.aborted) return finish({ type: "cancelled" });
            const raw = Cause.squash(cause);
            const error = classifyTranscriptionFailure(original(raw));
            return finish({ type: "error", error, exitCode: null }, { stdout: "", stderr: error.rawMessage });
          });
          return timing.turn("executor.execute.rejection").pipe(Effect.andThen(complete));
        })
      );
      yield* time
        .microtask(work.pipe(Effect.ignoreCause))
        .pipe(
          Effect.mapError((error) =>
            QueueHostFailure.make({ original: original(error), legacyMessage: message(error) })
          )
        );
      const cancel = Effect.gen(function* () {
        yield* Scope.close(cancellation, Exit.void);
        if (child !== null) yield* child.terminate(1000);
      }).pipe(
        Effect.mapError((error) => QueueHostFailure.make({ original: original(error), legacyMessage: message(error) }))
      );
      return { cancel: () => cancel, pause: cancel };
    }),
  });
});
export const layer = (config: TranscriptionExecutorConfig) => Layer.effect(TaskExecutor, make(config));

export const commitLayer = Layer.effect(
  ExecutorCommit,
  Effect.map(TranscriptStore, (store) => ({ commit: store.commit }))
);
