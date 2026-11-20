import {spawn,execFileSync} from 'node:child_process'
import type {ChildProcess,SpawnOptions} from 'node:child_process'
import * as NodePath from '@effect/platform-node/NodePath'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Scheduler from 'effect/Scheduler'
import {LegacyTiming} from '@vidbee/task-queue/LegacyTiming.service'
import {runLegacySync} from '@vidbee/task-queue-legacy/runtime'
import {backgroundChildSpawnOptions,lowerChildPriority} from '@vidbee/task-queue-legacy/process'
import {makeProcessCapabilitiesLayer} from '../../../downloader-core-legacy/src/Process.layer'
import {WorkerRuntime,ComputeProvider,RuntimeCommands} from '../../../transcription/src/WorkerRuntime.service'
import {layer as runtimeLayer} from '../../../transcription/src/WorkerRuntime.layer'
import {layer as providerLayer} from '../../../transcription/src/ComputeProvider.layer'
import {layer as probeLayer} from '../../../transcription/src/RuntimeProbe.layer'
import {layer as processLayer} from '../../../transcription/src/TranscriptionProcess.layer'
import {AtomicFilesLive} from '../../../transcription/src/AtomicFiles.layer'
import {WorkerProtocolLive} from '../../../transcription/src/WorkerProtocol.layer'
import {HostFailure} from '../../../transcription/src/Transcription.errors'
import {TranscriptionHost} from '../../../transcription/src/TranscriptionHost.service'
import {TranscriptionFilesLegacySync} from '../host/files'
import {TranscriptionHostLegacy} from '../host/host'
import {TranscriptionIdsLegacy} from '../host/ids'
import {legacyTimeLayer} from '../host/time'
import {WorkerResultJsonLegacy} from '../host/worker-result'
import {transcriptionCause} from './errors'
export type RuntimeSpawn=(command:string,argv:readonly string[],options:SpawnOptions)=>ChildProcess
export function makeWorkerRuntimeRuntime(spawnFn:RuntimeSpawn=(command,argv,options)=>spawn(command,[...argv],options)){
 let runtime:ManagedRuntime.ManagedRuntime<WorkerRuntime|ComputeProvider,never>
 const run=<A,E>(effect:Effect.Effect<A,E,WorkerRuntime|ComputeProvider>):A=>runLegacySync(runtime,effect,transcriptionCause)
 const capabilities=makeProcessCapabilitiesLayer(()=>runtime,transcriptionCause,(command,argv,options)=>{
  const child=spawnFn(command,argv,{env:options.env,stdio:['pipe','pipe','pipe'],...backgroundChildSpawnOptions()})
  lowerChildPriority(child.pid)
  child.stdin?.on('error',()=>{})
  return child
 })
 const host=Layer.effect(TranscriptionHost,Effect.map(TranscriptionHost,base=>({...base,lowerPriority:()=>Effect.void}))).pipe(Layer.provide(TranscriptionHostLegacy))
 const timing=Layer.succeed(LegacyTiming,{turn:()=>Effect.callback<void>(resume=>{queueMicrotask(()=>resume(Effect.void))})})
 const commands=Layer.succeed(RuntimeCommands,{execute:input=>Effect.try({try:()=>execFileSync(input.command,[...input.argv],{encoding:'utf8',timeout:input.timeoutMs,...(input.env===undefined?{}:{env:input.env})}),catch:cause=>HostFailure.make({operation:'runtimeCommand',legacyMessage:cause instanceof Error?cause.message:String(cause),cause})})})
 const foundation=Layer.mergeAll(host,TranscriptionFilesLegacySync,TranscriptionIdsLegacy,NodePath.layer,commands,timing,legacyTimeLayer(action=>run(action)),Layer.succeed(Scheduler.PreventSchedulerYield,true))
 const atomic=AtomicFilesLive.pipe(Layer.provideMerge(foundation))
 const protocol=WorkerProtocolLive.pipe(Layer.provide(WorkerResultJsonLegacy),Layer.provideMerge(atomic))
 const process=processLayer.pipe(Layer.provide(capabilities))
 const probe=probeLayer.pipe(Layer.provideMerge(protocol),Layer.provide(process))
 const services=Layer.mergeAll(runtimeLayer,providerLayer).pipe(Layer.provide(probe))
 runtime=ManagedRuntime.make(services)
 run(Effect.void)
 return runtime
}
let owner:ReturnType<typeof makeWorkerRuntimeRuntime>|undefined
export const getWorkerRuntimeRuntime=()=>owner??(owner=makeWorkerRuntimeRuntime())
