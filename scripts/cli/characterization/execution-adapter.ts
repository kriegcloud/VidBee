/** Test-only adaptation of frozen scenarios to strict operations and host capabilities. */
import * as C from '@vidbee/cli';
import { createLocalClient as localOwner } from '@vidbee/cli-legacy/local-client';
import { DownloadFiles } from '@vidbee/downloader-core/DownloadFiles.service';
import { HostFailure } from '@vidbee/downloader-core/Downloader.errors';
import * as NodePath from '@effect/platform-node/NodePath';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Cause from 'effect/Cause';
import * as Clock from 'effect/Clock';
import * as Duration from 'effect/Duration';
import * as Layer from 'effect/Layer';
import * as FetchHttpClient from 'effect/http/FetchHttpClient';
import * as fs from 'node:fs';
import * as os from 'node:os';
const fail = cause => C.CliFailure.make({ message: cause instanceof Error ? cause.message : String(cause), cause });
const invoke = thunk => Effect.tryPromise({ try: thunk, catch: fail });
async function perform(effect) {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  const error = Cause.squash(exit.cause);
  if (error?._tag === 'CliFailure') {
    if (error.category === 'type') throw new TypeError(error.message);
    if (error.category === 'range') throw new RangeError(error.message);
    if (error.cause instanceof Error) throw error.cause;
    throw Error(error.message);
  }
  throw error;
}
const nativeClock = Effect.runSync(Clock.Clock);
function clock(options = {}) {
  const now = options.clock ?? options.now;
  return {
    currentTimeMillisUnsafe: () => nativeClock.currentTimeMillisUnsafe(),
    currentTimeMillis: nativeClock.currentTimeMillis,
    currentTimeNanosUnsafe: () => nativeClock.currentTimeNanosUnsafe(),
    currentTimeNanos: nativeClock.currentTimeNanos,
    monotonicTimeNanosUnsafe: () => nativeClock.monotonicTimeNanosUnsafe(),
    monotonicTimeNanos: nativeClock.monotonicTimeNanos,
    sleep: duration => nativeClock.sleep(duration),
    ...(now ? { currentTimeMillisUnsafe: now, currentTimeMillis: Effect.sync(now) } : {}),
    ...(options.delay ? { sleep: duration => Effect.promise(() => options.delay(Duration.toMillis(duration))) } : {}),
  };
}
function base(options = {}) {
  const read = options.readFile ?? (path => fs.readFileSync(path, 'utf8'));
  const host = Layer.succeed(C.CliHost, {
    platform: options.platform ?? process.platform,
    homeDirectory: (options.homedir ?? os.homedir)(),
    executingArtifactUrl: new URL(import.meta.url),
    environment: key => Effect.sync(() => (options.env ?? process.env)[key]),
  });
  const files = Layer.succeed(DownloadFiles, {
    read: path => Effect.try({ try: () => read(path), catch: cause => HostFailure.make({ operation: 'read', legacyMessage: String(cause), cause }) }),
    exists: path => Effect.sync(() => (options.exists ?? fs.existsSync)(path)),
    write: (path, text) => Effect.try({ try: () => fs.writeFileSync(path, text), catch: cause => HostFailure.make({ operation: 'write', legacyMessage: String(cause), cause }) }),
    makeDirectory: (path, recursive) => Effect.try({ try: () => { fs.mkdirSync(path, { recursive }); }, catch: cause => HostFailure.make({ operation: 'mkdir', legacyMessage: String(cause), cause }) }),
  });
  return Layer.mergeAll(NodePath.layer, host, files, C.CliPidLivenessLive);
}
function descriptorOptions(options = {}) {
  return { pathOverride: options.pathOverride, envOverride: options.envOverride, platform: options.platform, homeDirectory: options.homedir?.() };
}
export function resolveDescriptorPath(options = {}) {
  return Effect.runSync(C.resolveDescriptorPath(descriptorOptions(options)).pipe(Effect.provide(base(options))));
}
export function readDescriptor(options = {}) {
  return Effect.runSync(C.readDescriptor(descriptorOptions(options)).pipe(Effect.provide(base(options))));
}
export function isPidAlive(pid, probe = (pid, signal) => process.kill(pid, signal)) {
  return Effect.runSync(Effect.try({ try: () => { probe(pid, 0); return true; }, catch: () => false }).pipe(Effect.orElseSucceed(() => false)));
}
export function defaultCachePath() { return Effect.runSync(C.defaultCachePath().pipe(Effect.provide(base({platform:os.platform()})))); }
export function readCliVersion(paths) { return Effect.runSync(C.readCliVersion(paths).pipe(Effect.provide(C.CliVersionLive.pipe(Layer.provide(base()))))); }
export function checkUpgrade(options) {
  const registry = Layer.succeed(C.CliRegistry, { latest: invoke(options.fetchLatest) });
  return perform(C.checkUpgrade(options).pipe(Effect.provide(C.CliUpgradeLive.pipe(Layer.provide(Layer.mergeAll(base(), registry)))), Effect.provideService(Clock.Clock, clock(options))));
}
export class AutomationClient {
  options;
  session;
  rawFetch;
  constructor(options) {
    this.options = options;
    const fetch = options.fetch ?? globalThis.fetch;
    this.fetch = async (url, init) => {
      // Frozen callback observations use the old header object spelling. The
      // executable oracle separately checks native HTTP bytes and header order.
      const headers = { Accept: init.headers.accept };
      if (init.headers.authorization) headers.Authorization = init.headers.authorization;
      if (init.method === 'POST') headers['Content-Type'] = init.headers['content-type'];
      const response = await fetch(String(url), { ...init, headers, body: init.body instanceof Uint8Array ? new TextDecoder().decode(init.body) : init.body });
      return { ...response, headers: new Headers(), arrayBuffer: async () => new TextEncoder().encode(await response.text()).buffer };

    };
    this.session = Effect.runSync(C.AutomationClient(options).pipe(Effect.provide(FetchHttpClient.layer)));
  }
  execute(effect) { return perform(effect.pipe(Effect.provideService(FetchHttpClient.Fetch, this.fetch), Effect.provideService(Clock.Clock, clock(this.options)))); }
  handshake() {
    if (this.rawFetch) return this.rawFetch().then(response => this.execute(C.handshakeReply({ statusText: '', ...response })));
    return this.execute(this.session.handshake);
  }
  ensureToken() { return this.execute(this.session.ensureToken); }
  list(input) { return this.execute(this.session.list(input)); }
  get(id) { return this.execute(this.session.get(id)); }
  stats() { return this.execute(this.session.stats); }
  add(request) { return this.execute(this.session.add(request)); }
  removeFromHistory(id) { return this.execute(this.session.removeFromHistory(id)); }
  cancel(id) { return this.execute(this.session.cancel(id)); }
  pause(id, reason) { return this.execute(this.session.pause(id, reason)); }
  resume(id) { return this.execute(this.session.resume(id)); }
  retry(id) { return this.execute(this.session.retry(id)); }
}
export function runProbe(options) {
  const process = Layer.succeed(C.CliProbeProcess, {
    start: (spec, sink) => Effect.try({
      try: () => {
        const handle = options.spawner(spec.command, spec.argv);
        const emit = event => Effect.runSync(sink.emit(event));
        handle.stdout.on('data', chunk => emit({ _tag: 'stdout', chunk }));
        handle.stderr.on('data', chunk => emit({ _tag: 'stderr', chunk }));
        handle.on('error', error => emit({ _tag: 'rawError', error }));
        handle.on('close', code => emit({ _tag: 'complete', outcome: { _tag: 'Raw', code, signal: null, killed: false } }));
        const signal = signal => Effect.sync(() => handle.kill(signal));
        return { _tag: 'Acquired', run: { pid: undefined, observeClose: Effect.void, signalChild: signal, signalGroup: signal, signalTree: signal, signalPid: signal, writeStdin: () => Effect.void } };
      },
      catch: cause => HostFailure.make({ operation: 'spawn', legacyMessage: String(cause), cause }),
    }),
  });
  return perform(C.runProbe(options).pipe(Effect.provide(C.CliProbeLive.pipe(Layer.provide(Layer.mergeAll(base(), process))))));
}
export function ensureDesktopReady(enabled, options = {}) {
  const fixture = base(options.descriptorOptions);
  const descriptor = C.CliDescriptorLive.pipe(Layer.provide(fixture));
  const launcher = Layer.succeed(C.CliLauncher, { launch: spec => Effect.try({ try: () => options.spawnLauncher(spec.command, spec.argv), catch: fail }) });
  return perform(C.ensureDesktopReady(enabled, options).pipe(Effect.provide(C.CliAutostartLive.pipe(Layer.provide(Layer.mergeAll(base(options), descriptor, launcher)))), Effect.provideService(Clock.Clock, clock(options))));
}
function clientEffects(client) {
  const out = {};
  for (const name of ['list', 'get', 'removeFromHistory', 'add', 'cancel', 'pause', 'resume', 'retry']) if (client[name]) out[name] = (...args) => invoke(() => client[name](...args));
  out.stats = invoke(() => client.stats());
  return out;
}
export function connect(options) {
  const descriptor = Layer.succeed(C.CliDescriptor, { read: () => Effect.sync(() => options.readDescriptorImpl({})), path: () => Effect.succeed('/fixture/d') });
  const autostart = Layer.succeed(C.CliAutostart, { ensure: (...args) => invoke(() => options.ensureDesktopReadyImpl(...args)) });
  const automation = Layer.succeed(C.CliAutomation, { make: request => Effect.sync(() => options.buildAutomationClient(request.baseUrl, request.token ?? null)) });
  const local = Layer.succeed(C.CliLocal, { open: request => invoke(() => options.createLocalClientImpl(request)) });
  return perform(C.connect(options.flags).pipe(Effect.provide(C.CliConnectionLive.pipe(Layer.provide(Layer.mergeAll(base(), descriptor, autostart, automation, local))))));
}
export function run(argv, io) {
  const connection = Layer.succeed(C.CliConnection, { connect: flags => invoke(async () => {
    const value = await io.connect({ flags });
    return value.kind === 'error' ? value : { kind: 'connected', client: clientEffects(value.client), shutdown: value.teardown ? invoke(value.teardown).pipe(Effect.ignore) : Effect.void };
  }) });
  const output = Layer.succeed(C.CliOutput, { stdout: text => Effect.sync(() => io.stdout(text.slice(0, -1))), stderr: text => Effect.sync(() => io.stderr(text.slice(0, -1))) });
  const probe = Layer.succeed(C.CliProbe, { run: options => invoke(() => io.probe(options)) });
  const version = Layer.succeed(C.CliVersion, { read: () => Effect.sync(io.readVersion) });
  const upgrade = Layer.succeed(C.CliUpgrade, { check: options => invoke(() => io.checkUpgrade(options)), cachePath: Effect.succeed('/fixture/cache') });
  return perform(C.run(argv).pipe(Effect.provide(C.CliProgramLive.pipe(Layer.provide(Layer.mergeAll(connection, output, probe, version, upgrade))))));
}
// The SQLite/executor scenarios exercise the retained local owner capability.
export const createLocalClient = localOwner;
