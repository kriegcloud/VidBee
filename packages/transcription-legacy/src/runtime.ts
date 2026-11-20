import * as Core from '@vidbee/transcription/runtime'
import * as Effect from 'effect/Effect'
import {runLegacySync,runLegacyPromise} from '@vidbee/task-queue-legacy/runtime'
import {WorkerRuntime as RuntimeService} from '../../transcription/src/WorkerRuntime.service'
import {HostFailure} from '../../transcription/src/Transcription.errors'
import {getWorkerRuntimeRuntime} from './bridge/worker-runtime'
import {transcriptionCause} from './bridge/errors'
import type {AsrTierId} from './asr-tiers'
import type {SherpaExecutionProvider,SherpaProviderProbeResult} from './compute-provider'
export type WorkerRuntimeLayer = 'env' | 'bundled' | 'system' | 'electron'
export interface WorkerRuntime {
  execPath: string
  layer: WorkerRuntimeLayer
  version: string
  guarded: boolean
}
export interface ProbeCache {
  get: (key: string) => boolean | undefined
  set: (key: string, ok: boolean) => void
}
export interface ResolveWorkerRuntimeInput {
  envPath?: string | null
  bundledPath?: string | null
  systemPaths?: string[]
  electronPath?: string
  forceLayer?: WorkerRuntimeLayer | null
  minNodeMajor?: number
  probe?: (runtime: WorkerRuntime) => Promise<boolean>
  cache?: ProbeCache
  lookUpSystem?: boolean
}
export interface ProbeWorkerProviderInput {
  execPath: string
  execArgv?: string[]
  workerScript: string
  modelsDir: string
  provider: SherpaExecutionProvider
  asrTier?: AsrTierId
  benchmark?: boolean
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
}

export const MIN_NODE_MAJOR=Core.MIN_NODE_MAJOR
export const DEFAULT_MAX_WORKER_RESTARTS=Core.DEFAULT_MAX_WORKER_RESTARTS
export const isElectronBinary=(bin:string):boolean=>Core.isElectronBinary(bin)
export const nodeBinaryName=(platform=process.platform):string=>Core.nodeBinaryName(platform)
export const nodeVersionMeetsBaseline=(version:string,minMajor=MIN_NODE_MAJOR):boolean=>Core.nodeVersionMeetsBaseline(version,minMajor)
export const formatRuntimeLog=(runtime:WorkerRuntime,restarts=0):string[]=>Core.formatRuntimeLog(runtime,restarts)
const run=<A,E>(effect:Effect.Effect<A,E,RuntimeService>):A=>runLegacySync(getWorkerRuntimeRuntime(),effect,transcriptionCause)
const promise=<A,E>(effect:Effect.Effect<A,E,RuntimeService>):Promise<A>=>runLegacyPromise(getWorkerRuntimeRuntime(),effect,transcriptionCause)
const failure=(operation:string)=>(cause:unknown)=>HostFailure.make({operation,cause,legacyMessage:cause instanceof Error?cause.message:String(cause)})
export const readNodeVersion=(bin:string):string=>run(Effect.flatMap(RuntimeService,service=>service.readNodeVersion(bin)))
export const probeCacheKey=(path:string):string=>run(Effect.flatMap(RuntimeService,service=>service.probeCacheKey(path)))
export const createFileProbeCache=(filePath?:string):ProbeCache=>{const cache=run(Effect.flatMap(RuntimeService,service=>service.createFileProbeCache(filePath)));return {get:key=>run(cache.get(key)) as boolean|undefined,set:(key,ok)=>run(cache.set(key,ok))}}
export const resolveBundledNodePath=(resources:string[]=[]):string|null=>run(Effect.flatMap(RuntimeService,service=>service.resolveBundledNodePath(resources)))
export const resolveSystemNodePaths=():string[]=>run(Effect.flatMap(RuntimeService,service=>service.resolveSystemNodePaths))
export const resolveWorkerExecPath=(preferred?:string):string=>run(Effect.flatMap(RuntimeService,service=>service.resolvePath(preferred)))
export function resolveWorkerRuntime(input:ResolveWorkerRuntimeInput={}):Promise<WorkerRuntime>{
 const probe=input.probe
 const cache=input.cache
 return promise(Effect.flatMap(RuntimeService,service=>service.resolve({...input,probe:probe?runtime=>Effect.tryPromise({try:()=>probe(runtime),catch:failure('runtimeProbe')}):undefined,cache:cache?{get:key=>Effect.try({try:()=>cache.get(key),catch:failure('probeCacheGet')}),set:(key,ok)=>Effect.try({try:()=>cache.set(key,ok),catch:failure('probeCacheSet')})}:undefined})))
}
export const probeWorkerProvider=(input:ProbeWorkerProviderInput):Promise<SherpaProviderProbeResult>=>promise(Effect.flatMap(RuntimeService,service=>service.probeProvider(input)))
export const probeWorker=async(input:Omit<ProbeWorkerProviderInput,'provider'|'asrTier'|'benchmark'>):Promise<boolean>=>{const result=await probeWorkerProvider({...input,provider:'cpu'});return result.ok}
