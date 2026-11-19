import { setTimeout as probeDelay } from 'node:timers/promises'
import { LegacyTiming } from '@vidbee/task-queue/LegacyTiming.service'
import { spawnSync, type SpawnOptions } from 'node:child_process'
import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as NodePath from '@effect/platform-node/NodePath'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import type * as Cause from 'effect/Cause'
import * as Exit from 'effect/Exit'
import type * as ManagedRuntime from 'effect/ManagedRuntime'
import { runLegacySync } from '@vidbee/task-queue-legacy/runtime'
import { makeProcessLayer, type RawProcessInvocation } from '../../downloader-core-legacy/src/Process.layer.js'
import { CaptureHostDriver } from '../../browser-capture/src/CaptureHost.service.js'
import { CaptureHostLive } from '../../browser-capture/src/CaptureHost.layer.js'
import { CaptureFiles } from '../../browser-capture/src/CaptureFiles.service.js'
import { CaptureTimers } from '../../browser-capture/src/CaptureTimers.service.js'
import { RecorderLive } from '../../browser-capture/src/Recorder.layer.js'
import { VirtualDisplayLive } from '../../browser-capture/src/VirtualDisplay.layer.js'
import { HostFailure } from '../../browser-capture/src/Capture.errors.js'

const failure = (operation: string) => (cause: unknown) => new HostFailure({ operation, cause, legacyMessage: cause instanceof Error ? cause.message : String(cause) })
const sync = <A>(operation: string, action: () => A) => Effect.try({ try: action, catch: failure(operation) })
const async = <A>(operation: string, action: () => Promise<A>) => Effect.tryPromise({ try: action, catch: failure(operation) })
const info = (stat: fs.Stats) => ({ get size() { return stat.size }, get isFile() { return stat.isFile() }, get isDirectory() { return stat.isDirectory() } })
export const legacyCaptureFiles = Layer.succeed(CaptureFiles, CaptureFiles.of({
  readText: (path, options) => options?.sync ? sync('readText', () => fs.readFileSync(path, 'utf8')) : async('readText', () => fsp.readFile(path, 'utf8')),
  readBytes: (path, options) => options?.sync ? sync('readBytes', () => fs.readFileSync(path)) : async('readBytes', () => fsp.readFile(path)),
  exists: path => sync('exists', () => fs.existsSync(path)),
  stat: (path, options) => options?.sync ? sync('stat', () => info(fs.statSync(path))) : async('stat', () => fsp.stat(path)).pipe(Effect.map(info)),
  list: (path, options) => options?.sync ? sync('list', () => fs.readdirSync(path)) : async('list', () => fsp.readdir(path)),
  mkdir: (path, options) => options?.sync ? sync('mkdir', () => { fs.mkdirSync(path, options === undefined ? undefined : {recursive:options.recursive,mode:options.mode}) }) : async('mkdir', () => fsp.mkdir(path, options === undefined ? undefined : {recursive:options.recursive,mode:options.mode})).pipe(Effect.asVoid),
  tempDirectory: (prefix, options) => options?.sync ? sync('tempDirectory', () => fs.mkdtempSync(prefix)) : async('tempDirectory', () => fsp.mkdtemp(prefix)),
  copy: (source, target, options) => options?.sync ? sync('copy', () => fs.copyFileSync(source, target)) : async('copy', () => fsp.copyFile(source, target)),
  write: (path, data, options) => options?.sync ? sync('write', () => options.mode === undefined ? fs.writeFileSync(path, data) : fs.writeFileSync(path, data, { mode: options.mode })) : async('write', () => options?.mode === undefined ? fsp.writeFile(path, data) : fsp.writeFile(path, data, { mode: options.mode })),
  rename: (source, target, options) => options?.sync ? sync('rename', () => fs.renameSync(source, target)) : async('rename', () => fsp.rename(source, target)),
  remove: (path, options) => options?.sync ? sync('remove', () => fs.rmSync(path, options === undefined ? undefined : {recursive:options.recursive,force:options.force})) : async('remove', () => fsp.rm(path, options === undefined ? undefined : {recursive:options.recursive,force:options.force})),
}))
export const legacyCaptureHostDriver = Layer.succeed(CaptureHostDriver, CaptureHostDriver.of({
  snapshot: sync('snapshot', () => ({ platform: process.platform, home: os.homedir(), temp: os.tmpdir(), execPath: process.execPath, pid: process.pid, environment: { ...process.env } })),
  makeAbortController: () => new AbortController(),
  exists: path => sync('exists', () => fs.existsSync(path)),
  which: binary => Effect.sync(() => {
    try {
      const result = spawnSync('which', [binary], { encoding: 'utf8' })
      const found = result.stdout.trim().split(/\r?\n/)[0]
      return found && fs.existsSync(found) ? found : null
    } catch { return null }
  }),
  probeDisplay: (display, timeout) => sync('probeDisplay', () => spawnSync('xdpyinfo', ['-display', display], { encoding: 'utf8', timeout }).status === 0),
}))
/** Explicit descriptor/observer policies identify the original capture invocation form. */
export const captureRawInvocation: RawProcessInvocation = {
  options: (spec, defaults) => {
    const options: SpawnOptions = { stdio: spec.stdin === 'ignore' && spec.stdout === 'ignore' && spec.stderr === 'ignore' ? 'ignore' : [spec.stdin, spec.stdout, spec.stderr] }
    if (spec.env !== undefined) options.env = defaults.env
    if (spec.cwd !== undefined) options.cwd = spec.cwd
    if (spec.detached) options.detached = true
    if (spec.windowsHide) options.windowsHide = true
    if (spec.abortSignal !== undefined) options.signal = spec.abortSignal
    return options
  },
  stdin: (spec, bytes) => spec.rawCloseObservation === 'on-demand' && bytes.length === 1 && bytes[0] === 113 ? 'q' : bytes,
}
export const makeLegacyCaptureTimers = <R, ER>(runtime: () => ManagedRuntime.ManagedRuntime<R, ER>, mapError: (cause: Cause.Cause<unknown>) => unknown) =>
  Layer.succeed(CaptureTimers, CaptureTimers.of({
    now: Effect.sync(() => Date.now()),
    sleepProbe: ms=>Effect.promise(()=>probeDelay(ms)),
    sleep: ms => Effect.callback<void>(resume => { const timer = setTimeout(() => queueMicrotask(() => resume(Effect.void)), ms); return Effect.sync(() => clearTimeout(timer)) }),
    defer: (action, options) => Effect.sync(() => { queueMicrotask(() => {
      if (!options?.rejectOnFailure) { runLegacySync(runtime(), action, mapError); return }
      runtime().runFork(action).addObserver(exit => {
        if (Exit.isFailure(exit)) {
          const error = mapError(exit.cause)
          void Promise.reject(error)
        }
      })
    }) }),
    after: (ms, action, options) => Effect.sync(() => {
      const timer = setTimeout(() => runLegacySync(runtime(), action, mapError), ms)
      if (!options.keepAlive) timer.unref()
      return Effect.sync(() => clearTimeout(timer))
    }),
  }))
export const makeCapturePlatformLayer = <R, ER>(runtime: () => ManagedRuntime.ManagedRuntime<R, ER>, mapError: (cause: Cause.Cause<unknown>) => unknown) => {
  const host = CaptureHostLive.pipe(Layer.provide(legacyCaptureHostDriver), Layer.provide(NodePath.layer))
  const timing = Layer.succeed(LegacyTiming,{turn:()=>Effect.callback<void>(resume=>{queueMicrotask(()=>resume(Effect.void))})})
  const dependencies = Layer.mergeAll(timing, host, legacyCaptureFiles, makeLegacyCaptureTimers(runtime, mapError), makeProcessLayer(runtime, mapError, captureRawInvocation), NodePath.layer)
  return Layer.mergeAll(RecorderLive, VirtualDisplayLive).pipe(Layer.provideMerge(dependencies))
}
