import {spawn} from 'node:child_process'
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
import {Audio,AudioAbort} from '../../../transcription/src/Audio.service'
import {layer as audioLayer} from '../../../transcription/src/Audio.layer'
import {layer as waveLayer} from '../../../transcription/src/WaveReader.layer'
import {layer as processLayer} from '../../../transcription/src/TranscriptionProcess.layer'
import {TranscriptionHost} from '../../../transcription/src/TranscriptionHost.service'
import {TranscriptionFilesLegacySync} from '../host/files'
import {TranscriptionHostLegacy} from '../host/host'
import {BinaryWaveReaderLegacy} from '../host/wave-reader'
import {transcriptionCause} from './errors'
export type AudioSpawn=(command:string,argv:readonly string[],options?:SpawnOptions)=>ChildProcess
export function makeAudioRuntime(spawnFn:AudioSpawn=(command,argv,options)=>options===undefined?spawn(command,[...argv]):spawn(command,[...argv],options)){
 let runtime:ManagedRuntime.ManagedRuntime<Audio,never>
 const run=<A,E>(effect:Effect.Effect<A,E,Audio>):A=>runLegacySync(runtime,effect,transcriptionCause)
 const capabilities=makeProcessCapabilitiesLayer(()=>runtime,transcriptionCause,(command,argv,options)=>{
  if(Array.isArray(options.stdio)&&options.stdio[0]==='ignore'){
   const child=spawnFn(command,argv,{stdio:['ignore','pipe','pipe'],...backgroundChildSpawnOptions()})
   lowerChildPriority(child.pid)
   return child
  }
  return spawnFn(command,argv)
 })
 const host=Layer.effect(TranscriptionHost,Effect.map(TranscriptionHost,base=>({...base,lowerPriority:()=>Effect.void}))).pipe(Layer.provide(TranscriptionHostLegacy))
 const aborts=Layer.succeed(AudioAbort,{subscribe:(signal,action)=>Effect.sync(()=>{
  const listener=()=>{run(action)}
  signal.addEventListener('abort',listener,{once:true})
  return Effect.sync(()=>signal.removeEventListener('abort',listener))
 })})
 const timing=Layer.succeed(LegacyTiming,{turn:()=>Effect.callback<void>(resume=>{queueMicrotask(()=>resume(Effect.void))})})
 const waves=waveLayer.pipe(Layer.provide(BinaryWaveReaderLegacy),Layer.provide(TranscriptionFilesLegacySync))
 const nativeProcess=processLayer.pipe(Layer.provide(capabilities))
 const services=audioLayer.pipe(Layer.provide(waves),Layer.provide(nativeProcess),Layer.provide(host),Layer.provide(TranscriptionFilesLegacySync),Layer.provide(NodePath.layer),Layer.provide(aborts),Layer.provide(timing),Layer.provide(Layer.succeed(Scheduler.PreventSchedulerYield,true)))
 runtime=ManagedRuntime.make(services)
 run(Audio)
 return runtime
}
export const audioRuntime=makeAudioRuntime()
