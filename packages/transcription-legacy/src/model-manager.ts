import * as Core from '@vidbee/transcription/model-manager'
import { LegacyTiming } from '@vidbee/task-queue/LegacyTiming.service'
import { runLegacyPromise, runLegacySync } from '@vidbee/task-queue-legacy/runtime'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Option from 'effect/Option'
import * as Scheduler from 'effect/Scheduler'
import { Models, ModelsHooks } from '../../transcription/src/Models.service'
import { makeModelsLayer } from '../../transcription/src/Models.layer'
import { HostFailure } from '../../transcription/src/Transcription.errors'
import { modelFiles, modelFilesLayer, modelFilesRuntime } from './host/model-runtime'
import { transcriptionCause } from './bridge/errors'
import { legacyModelHttpLayer } from './host/http'
import { preferChinaMirrors } from './download-mirrors'
import type { AsrTierId } from './asr-tiers'
import type { ModelFileSpec, ModelGroup, ModelStatus } from './types'
import type { ModelStatusSink } from '../../transcription/src/Models.service'
import type { TranscriptionError } from '../../transcription/src/Transcription.errors'

export interface ModelManagerOptions {
  modelsDir: string
  catalog?: readonly ModelFileSpec[]
  fetchImpl?: typeof fetch
  /** Called at download time so a settings change applies to the next file. */
  preferChina?: boolean | (() => boolean)
  /** Override candidate URLs (tests). Production uses ModelScope + GitHub mirrors. */
  resolveUrls?: (spec: ModelFileSpec) => readonly string[]
  /** Per-URL header timeout so a blocked GitHub host does not sit at 0%. */
  attemptTimeoutMs?: number
  /**
   * Test seam. Runs after this attempt's files are in its private staging
   * directory and before publication, so tests can overlap two managers.
   */
  afterArchiveStaged?: (stagingDir: string) => void | Promise<void>
}

export interface EnsureReadyOptions {
  groups?: readonly ModelGroup[]
  tiers?: readonly AsrTierId[]
}


const failure = (operation:string) => (cause:unknown) => HostFailure.make({operation,cause,legacyMessage:cause instanceof Error?cause.message:String(cause)})
const modelCause = (cause:Cause.Cause<unknown>):unknown => {
  const found=Cause.findErrorOption(cause)
  if(Option.isSome(found)&&typeof found.value==='object'&&found.value!==null&&'operation'in found.value&&found.value.operation==='cancel'&&'cause'in found.value)return found.value.cause
  return transcriptionCause(cause)
}
export const modelPartPath = (dest:string):string => Core.modelPartPath(dest,process.pid)
export const removeModelPartFiles = (dest:string):void => runLegacySync(modelFilesRuntime,modelFiles.removePartFiles(dest),modelCause)
export const finalizeModelFile = (temporary:string,destination:string):void => runLegacySync(modelFilesRuntime,modelFiles.publishFile(temporary,destination),modelCause)
export const MODEL_DOWNLOAD_CANCELLED = 'download cancelled'
export const isModelDownloadCancelled = (error:unknown):boolean => Core.isModelDownloadCancelled(error)

/** Cross-owner adapter: each call enters the supplied manager's own warmed runtime. */
export const modelsLayerFor = (manager:ModelManager,runSink:(action:Effect.Effect<void,HostFailure>)=>void) => {
 const attempt=<A>(operation:string,body:()=>A)=>Effect.try({try:body,catch:failure(operation)})
 const promised=<A>(operation:string,body:()=>Promise<A>)=>Effect.tryPromise({try:body,catch:failure(operation)})
 let listeners:Array<{emit:ModelStatusSink['emit'];listener:(status:ModelStatus)=>void;remove:()=>void}>=[]
 return Layer.succeed(Models,{
  modelsDir:manager.modelsDir,
  status:(groups,tiers)=>attempt('manager.status',()=>manager.status(groups,tiers)),
  pathFor:spec=>attempt('manager.pathFor',()=>manager.pathFor(spec)),
  pathByRole:(role,tier)=>attempt('manager.pathByRole',()=>manager.pathByRole(role,tier)),
  pathById:id=>attempt('manager.pathById',()=>manager.pathById(id)),
  incompleteModelIssue:tier=>attempt('manager.incompleteModelIssue',()=>manager.incompleteModelIssue(tier)),
  ensureReady:options=>promised('manager.ensureReady',()=>manager.ensureReady(options)),
  ensureReadyAllowCancel:options=>promised('manager.ensureReadyAllowCancel',()=>manager.ensureReadyAllowCancel(options)),
  redownload:promised('manager.redownload',()=>manager.redownload()),
  removeTier:tier=>attempt('manager.removeTier',()=>manager.removeTier(tier)),
  cancelDownload:tier=>attempt('manager.cancelDownload',()=>manager.cancelDownload(tier)),
  subscribe:sink=>attempt('manager.subscribe',()=>{
   if(!listeners.some(entry=>entry.emit===sink.emit)){
    const listener=(status:ModelStatus)=>runSink(sink.emit(status));const remove=manager.subscribe(listener)
    listeners.push({emit:sink.emit,listener,remove})
   }
   return Effect.sync(()=>{const entry=listeners.find(item=>item.emit===sink.emit);if(entry===undefined)return;entry.remove();listeners=listeners.filter(item=>item!==entry)})
  }),
 })
}

export class ModelManager {
 readonly modelsDir:string
 private readonly runtime:ManagedRuntime.ManagedRuntime<Models,TranscriptionError>
 private readonly models:typeof Models.Service
 private listeners:Array<{listener:(status:ModelStatus)=>void;sink:ModelStatusSink;remove:Effect.Effect<void>}>=[]
 constructor(opts:ModelManagerOptions){
  this.modelsDir=opts.modelsDir
  const catalog=opts.catalog
  const fetchImpl=opts.fetchImpl??fetch
  const preferChinaOption=opts.preferChina
  const resolveUrls=opts.resolveUrls
  const attemptTimeoutMs=opts.attemptTimeoutMs
  const afterArchiveStaged=opts.afterArchiveStaged
  const hooks=Layer.succeed(ModelsHooks,{
   makeAbortController:()=>new AbortController(),
   preferChina:Effect.try({try:()=>typeof preferChinaOption==='function'?preferChinaOption.call(this):typeof preferChinaOption==='boolean'?preferChinaOption:preferChinaMirrors(),catch:failure('preferChina')}),
   resolveUrls:!resolveUrls?undefined:(spec:ModelFileSpec)=>Effect.try({try:()=>resolveUrls.call(this,spec),catch:failure('resolveUrls')}),
   afterArchiveStaged:!afterArchiveStaged?undefined:(staging:string)=>Effect.tryPromise({try:()=>Promise.resolve(afterArchiveStaged.call(this,staging)),catch:failure('afterArchiveStaged')}),
  })
  const transport=legacyModelHttpLayer(fetchImpl,(effect,complete)=>{try{runLegacySync(this.runtime,effect,modelCause);complete()}catch(error){complete(error)}})
  const timing=Layer.succeed(LegacyTiming,{turn:()=>Effect.promise(()=>Promise.resolve())})
  const layer=makeModelsLayer({modelsDir:this.modelsDir,catalog,attemptTimeoutMs}).pipe(
   Layer.provide(Layer.mergeAll(modelFilesLayer,hooks,transport,timing,Layer.succeed(Scheduler.PreventSchedulerYield,true))))
  this.runtime=ManagedRuntime.make(Layer.merge(layer,Layer.succeed(Scheduler.PreventSchedulerYield,true)))
  this.models=runLegacySync(this.runtime,Models,modelCause)
 }
 subscribe(listener:(status:ModelStatus)=>void):()=>void {
  let entry=this.listeners.find(item=>item.listener===listener)
  if(entry===undefined){
   const sink:ModelStatusSink={emit:status=>Effect.try({try:()=>listener(status),catch:failure('listener')})}
   const remove=runLegacySync(this.runtime,this.models.subscribe(sink),modelCause)
   entry={listener,sink,remove};this.listeners.push(entry)
  }
  return ()=>this.unsubscribe(listener)
 }
 private unsubscribe(listener:(status:ModelStatus)=>void):void {
  const entry=this.listeners.find(item=>item.listener===listener)
  if(entry===undefined)return
  runLegacySync(this.runtime,entry.remove,modelCause)
  this.listeners=this.listeners.filter(item=>item!==entry)
 }
 status(groups?:readonly ModelGroup[],tiers?:readonly AsrTierId[]):ModelStatus{return runLegacySync(this.runtime,this.models.status(groups,tiers),modelCause)}
 pathFor(spec:Pick<ModelFileSpec,'fileName'>):string{return runLegacySync(this.runtime,this.models.pathFor(spec),modelCause)}
 incompleteModelIssue(tier?:AsrTierId):string|null{return runLegacySync(this.runtime,this.models.incompleteModelIssue(tier),modelCause)}
 pathByRole(role:ModelFileSpec['role'],tier?:AsrTierId):string|null{return runLegacySync(this.runtime,this.models.pathByRole(role,tier),modelCause)}
 pathById(id:string):string|null{return runLegacySync(this.runtime,this.models.pathById(id),modelCause)}
 ensureReady(opts?:EnsureReadyOptions):Promise<ModelStatus>{return runLegacyPromise(this.runtime,this.models.ensureReady(opts),modelCause)}
 ensureReadyAllowCancel(opts?:EnsureReadyOptions):Promise<ModelStatus>{return runLegacyPromise(this.runtime,this.models.ensureReadyAllowCancel(opts),modelCause)}
 async redownload():Promise<ModelStatus>{return runLegacyPromise(this.runtime,this.models.redownload,modelCause)}
 removeTier(tier:AsrTierId):ModelStatus{return runLegacySync(this.runtime,this.models.removeTier(tier),modelCause)}
 cancelDownload(tier:AsrTierId):ModelStatus{return runLegacySync(this.runtime,this.models.cancelDownload(tier),modelCause)}
}
