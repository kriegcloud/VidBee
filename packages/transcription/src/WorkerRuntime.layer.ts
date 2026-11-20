import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as O from "effect/Option";
import * as Path from "effect/Path";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { AtomicFiles } from "./AtomicFiles.service.js";
import { isElectronBinary, MIN_NODE_MAJOR, nodeBinaryName, nodeVersionMeetsBaseline } from "./runtime.js";
import { HostFailure, RuntimeUnavailable } from "./Transcription.errors.js";
import { TranscriptionFiles } from "./TranscriptionFiles.service.js";
import { TranscriptionHost } from "./TranscriptionHost.service.js";
import { RuntimeCommands, RuntimeProbe, WorkerRuntime } from "./WorkerRuntime.service.js";
import type { WorkerRuntimeLayer } from "./Literal.model.js";
import type { WorkerRuntime as RuntimeValue } from "./Runtime.model.js";
import type { ResolveRuntimeOptions, RuntimeProbeCache } from "./WorkerRuntime.service.js";
export const commandsLayer = Layer.effect(
  RuntimeCommands,
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    return RuntimeCommands.of({
      execute: Effect.fn("RuntimeCommands.execute")((input) =>
        spawner
          .string(
            ChildProcess.make(input.command, input.argv, {
              ...(input.env === undefined ? {} : { env: input.env, extendEnv: false }),
            })
          )
          .pipe(
            Effect.timeout(input.timeoutMs),
            Effect.mapError((cause) =>
              HostFailure.make({
                operation: "runtimeCommand",
                legacyMessage: cause instanceof Error ? cause.message : String(cause),
                cause,
              })
            )
          )
      ),
    });
  })
);
export const make = Effect.fnUntraced(function* () {
  const files = yield* TranscriptionFiles;
  const host = yield* TranscriptionHost;
  const path = yield* Path.Path;
  const commands = yield* RuntimeCommands;
  const atomic = yield* AtomicFiles;
  const probe = yield* RuntimeProbe;
  const readNodeVersion = Effect.fnUntraced(function* (bin: string) {
    const snapshot = yield* host.snapshot;
    const out = yield* commands.execute({
      command: bin,
      argv: ["-v"],
      timeoutMs: 8000,
      env: { ...snapshot.environment, ELECTRON_RUN_AS_NODE: "1" },
    });
    return Str.replace(/^v/, "")(Str.trim(out));
  });
  const safeVersion = (bin: string) => readNodeVersion(bin).pipe(Effect.catchCause(() => Effect.succeed("")));
  const probeCacheKey = (bin: string) =>
    Effect.gen(function* () {
      const stat = yield* files.stat(bin);
      return `${path.basename(bin)}:${stat.size}:${stat.mtimeMs}`;
    }).pipe(Effect.catchCause(() => Effect.succeed(`${bin}:missing`)));
  const bundled = Effect.fnUntraced(function* (resourceDirs: string[] = []) {
    const snapshot = yield* host.snapshot;
    const name = nodeBinaryName(snapshot.platform);
    const extras = [
      snapshot.environment.VIDBEE_BUNDLED_NODE,
      ...A.map(resourceDirs, (dir) => path.join(dir, "node", name)),
      path.join(snapshot.cwd, "resources", "node", name),
    ];
    for (const resource of snapshot.resourceDirectories)
      if (resource.length > 0)
        extras.push(path.join(resource, "resources", "node", name), path.join(resource, "node", name));
    for (const candidate of extras) {
      const exists = Boolean(candidate);
      if (candidate !== undefined && exists && (yield* files.exists(candidate))) return candidate;
    }
    return null;
  });
  const which = Effect.gen(function* () {
    const snapshot = yield* host.snapshot;
    const out = yield* commands.execute({
      command: snapshot.platform === "win32" ? "where" : "which",
      argv: ["node"],
      timeoutMs: 5000,
    });
    const first = O.getOrUndefined(A.findFirst(A.map(Str.split(/\r?\n/)(out), Str.trim), (line) => line.length > 0));
    const hasFirst = Boolean(first);
    if (first === undefined || !hasFirst || isElectronBinary(first)) return null;
    return (yield* files.exists(first)) ? first : null;
  }).pipe(Effect.catchCause(() => Effect.succeed(null)));
  const system = Effect.gen(function* () {
    const snapshot = yield* host.snapshot;
    const found = [
      yield* which,
      snapshot.platform === "darwin" ? "/opt/homebrew/bin/node" : null,
      "/usr/local/bin/node",
      snapshot.platform === "win32"
        ? path.join(snapshot.environment.ProgramFiles ?? "C:\\Program Files", "nodejs", "node.exe")
        : null,
    ];
    const result: string[] = [];
    for (const value of found) {
      const hasValue = Boolean(value);
      if (value !== null && hasValue && !isElectronBinary(value) && (yield* files.exists(value))) result.push(value);
    }
    return A.dedupe(result);
  });
  const usable = Effect.fnUntraced(function* (bin: string | null | undefined, layer: WorkerRuntimeLayer, min: number) {
    const hasBin = Boolean(bin);
    if (bin == null || !hasBin || !(yield* files.exists(bin))) return null;
    if (layer !== "electron" && isElectronBinary(bin)) return null;
    const version = yield* safeVersion(bin);
    if (layer !== "electron" && !nodeVersionMeetsBaseline(version, min)) return null;
    return { execPath: bin, layer, version: version || "unknown", guarded: layer === "electron" };
  });
  const createCache = Effect.fnUntraced(function* (filePath?: string) {
    const snapshot = yield* host.snapshot;
    const cachePath = filePath ?? path.join(snapshot.temporaryDirectory, "vidbee-runtime-probe.json");
    const load = files.readText(cachePath).pipe(
      Effect.map((text) => O.getOrElse(S.decodeOption(S.fromJsonString(S.Unknown))(text), () => ({}))),
      Effect.catchCause(() => Effect.succeed({}))
    );
    const cache: RuntimeProbeCache = {
      get: Effect.fn("RuntimeProbeCache.get")(function* (key) {
        const root = yield* load;
        return yield* Effect.try({
          try: () => {
            if (root === null) throw new TypeError("Cannot access a null probe cache");
            return Reflect.get(Object(root), key) as unknown;
          },
          catch: (cause) =>
            HostFailure.make({
              operation: "probeCacheGet",
              legacyMessage: cause instanceof Error ? cause.message : String(cause),
              cause,
            }),
        });
      }),
      set: Effect.fn("RuntimeProbeCache.set")(function* (key, ok) {
        const root = yield* load;
        const next = { ...Object(root), [key]: ok };
        yield* atomic.writeJson(cachePath, next);
      }),
    };
    return cache;
  });
  return WorkerRuntime.of({
    readNodeVersion: safeVersion,
    probeCacheKey,
    createFileProbeCache: createCache,
    resolveBundledNodePath: bundled,
    resolveSystemNodePaths: system,
    resolve: Effect.fn("WorkerRuntime.resolve")(function* (input: ResolveRuntimeOptions = {}) {
      const snapshot = yield* host.snapshot;
      const min = input.minNodeMajor ?? MIN_NODE_MAJOR;
      const force = input.forceLayer ?? snapshot.environment.VIDBEE_TRANSCRIPTION_FORCE_LAYER ?? null;
      const electron = input.electronPath ?? snapshot.execPath;
      const bundle = input.bundledPath ?? (yield* bundled());
      const paths = input.lookUpSystem === false ? [] : (input.systemPaths ?? (yield* system));
      const ordered = [
        { layer: "env" as const, path: input.envPath ?? snapshot.environment.VIDBEE_TRANSCRIPTION_NODE ?? null },
        { layer: "bundled" as const, path: bundle },
        ...A.map(paths, (entry) => ({ layer: "system" as const, path: entry })),
        { layer: "electron" as const, path: electron },
      ];
      const hasForce = Boolean(force);
      const selected = hasForce ? A.filter(ordered, (item) => item.layer === force) : ordered;
      const candidates: RuntimeValue[] = [];
      for (const item of selected) {
        const runtime = yield* usable(item.path, item.layer, min);
        if (runtime !== null) candidates.push(runtime);
      }
      if (candidates.length === 0) {
        const fallback = yield* usable(electron, "electron", min);
        if (fallback === null)
          return yield* RuntimeUnavailable.make({
            operation: "resolveRuntime",
            legacyMessage: "no usable transcription worker runtime",
          });
        return fallback;
      }
      for (let index = 0; index < candidates.length; index++) {
        const runtime = candidates[index];
        if (runtime === undefined) continue;
        const last = index === candidates.length - 1;
        const hasProbe = Boolean(input.probe);
        if (input.probe === undefined || !hasProbe) return runtime;
        const key = yield* probeCacheKey(runtime.execPath);
        const cached = input.cache === undefined ? undefined : yield* input.cache.get(key);
        if (cached === true) return runtime;
        if (cached === false && !last) continue;
        let ok = false;
        if (cached === undefined) {
          ok = yield* Effect.suspend(() =>
            input.probe === undefined ? Effect.succeed(false) : input.probe(runtime)
          ).pipe(Effect.catchCause(() => Effect.succeed(false)));
          if (input.cache !== undefined) yield* input.cache.set(key, ok);
        }
        if (ok || last) return runtime;
      }
      const fallback = O.getOrUndefined(A.last(candidates));
      if (fallback === undefined)
        return yield* RuntimeUnavailable.make({
          operation: "resolveRuntime",
          legacyMessage: "no usable transcription worker runtime",
        });
      return fallback;
    }),
    resolvePath: Effect.fn("WorkerRuntime.resolvePath")(function* (preferred) {
      const snapshot = yield* host.snapshot;
      const hasPreferred = Boolean(preferred);
      if (preferred !== undefined && hasPreferred && (yield* files.exists(preferred)) && !isElectronBinary(preferred))
        return preferred;
      const env = snapshot.environment.VIDBEE_TRANSCRIPTION_NODE;
      const hasEnv = Boolean(env);
      if (env !== undefined && hasEnv && (yield* files.exists(env)) && !isElectronBinary(env)) return env;
      const bundle = yield* bundled();
      if (bundle !== null) return bundle;
      const paths = yield* system;
      const first = paths[0];
      const hasFirst = Boolean(first);
      return first !== undefined && hasFirst ? first : (preferred ?? snapshot.execPath);
    }),
    probeProvider: probe.run,
    probe: Effect.fn("WorkerRuntime.probe")((input) =>
      probe.run({ ...input, provider: "cpu" }).pipe(Effect.map((result) => result.ok))
    ),
  });
});
export const layer = Layer.effect(WorkerRuntime, make());
