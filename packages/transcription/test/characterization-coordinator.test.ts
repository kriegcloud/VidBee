import './fixtures/audit-isolation'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { AutoTranscriptionCoordinator, MemoryTranscriptStore, enqueueTranscription, findActiveTranscription, listTranscriptionChildren } from '@vidbee/transcription'
import { TaskQueueAPI } from '@vidbee/task-queue-legacy'
import type { Task, TaskQueueEvent } from '@vidbee/task-queue-legacy'
import { MemoryPersistAdapter } from '@vidbee/task-queue-legacy/persist'
import { task } from '../../task-queue-legacy/test/fixtures'

const roots:string[]=[]
afterEach(()=>{vi.restoreAllMocks();for(const dir of roots.splice(0))rmSync(dir,{recursive:true,force:true})})
const tick=()=>new Promise<void>(done=>setImmediate(done))
function fixture(children:Task[]=[]){
 const root=mkdtempSync(join(tmpdir(),'transcription-coordinator-'));roots.push(root);const source=join(root,'source.mp4');writeFileSync(source,'source')
 const queue=new TaskQueueAPI({persist:new MemoryPersistAdapter(),clock:()=>1000,executor:{run:()=>({cancel:async()=>{},pause:async()=>{}})}})
 const trace:unknown[]=[];const download=task('download',{input:{kind:'video',url:'https://fixture.invalid/video',title:'fixture'}})
 let listener:((event:TaskQueueEvent)=>void)|undefined
 vi.spyOn(queue,'subscribe').mockImplementation(fn=>{trace.push('subscribe');listener=fn;return ()=>{trace.push('unsubscribe');listener=undefined}})
 vi.spyOn(queue,'get').mockImplementation(id=>id==='download'?download:children.find(child=>child.id===id))
 vi.spyOn(queue,'list').mockImplementation(input=>{trace.push(['list',input]);return {tasks:children,nextCursor:null}})
 vi.spyOn(queue,'add').mockImplementation(async input=>{trace.push(['add',JSON.parse(JSON.stringify(input).replaceAll(source,'/fixture/source.mp4'))]);return {id:'added',created:true}})
 vi.spyOn(queue,'cancel').mockImplementation(async(...args)=>{trace.push(['cancel',...args])})
 vi.spyOn(queue,'retryManual').mockImplementation(async(...args)=>{trace.push(['retry',...args])})
 const store=new MemoryTranscriptStore({clock:()=>1000})
 return {root,source,queue,trace,store,download,emit:()=>listener?.({type:'transition',taskId:'download',from:'running',to:'completed',reason:null,attempt:1,at:1000})}
}
it('enqueue pins active/completed/retry/force/no-speech/model changes and complete admission payloads',async()=>{
 const results:unknown[]=[]
 for(const status of ['queued','running','processing','paused','retry-scheduled','completed','failed','cancelled'] as const)for(const trigger of ['manual','auto','force'] as const){
  const child=task('child',{kind:'transcription',parentId:'download',status,input:{url:'vidbee://download/download',kind:'transcription',options:{asrTier:'minimal'}}})
  const f=fixture([child]);const pending=enqueueTranscription({queue:f.queue,store:f.store,downloadTaskId:'download',sourceFilePath:f.source,trigger,title:'fixture',language:' zh-Hant ',speakerCount:2});f.trace.push('immediate');queueMicrotask(()=>f.trace.push('marker'));const result=await pending;f.trace.push('settled');results.push({status,trigger,result,trace:f.trace})
 }
 expect(results).toMatchSnapshot()
 const f=fixture([task('failed',{kind:'transcription',status:'failed',input:{kind:'transcription',url:'x',options:{provider:'cloud',cloudModelId:'old'}}})]);await enqueueTranscription({queue:f.queue,store:f.store,downloadTaskId:'download',sourceFilePath:f.source,trigger:'manual',provider:'cloud',cloudModelId:'new'});expect(f.trace).toMatchSnapshot('different cloud model')
 const n=fixture([task('silent',{kind:'transcription',status:'completed',output:{filePath:'/fixture/source.mp4',size:6,durationMs:null,sha256:null,transcript:{transcriptId:'record',resultKind:'no-speech'}}})]);await enqueueTranscription({queue:n.queue,store:n.store,downloadTaskId:'download',sourceFilePath:n.source,trigger:'auto'});expect(n.trace).toMatchSnapshot('no speech creates retry work')
},30000)
it('child list sorts descending stably, pages and active selector prefers running over newer queued',()=>{
 const f=fixture([task('queued',{kind:'transcription',status:'queued',createdAt:3}),task('running',{kind:'transcription',status:'running',createdAt:1}),task('other',{kind:'video',createdAt:5}),task('tie',{kind:'transcription',status:'paused',createdAt:3})]);expect(listTranscriptionChildren(f.queue,'download').map(t=>t.id)).toEqual(['queued','tie','running']);expect(findActiveTranscription(f.queue,'download')?.id).toBe('running')
 vi.spyOn(f.queue,'list').mockReturnValueOnce({tasks:[task('one',{kind:'transcription'})],nextCursor:'next'}).mockReturnValueOnce({tasks:[task('two',{kind:'transcription'})],nextCursor:null});expect(listTranscriptionChildren(f.queue,'download').map(t=>t.id)).toEqual(['one','two']);expect(f.queue.list).toHaveBeenLastCalledWith({parentId:'download',limit:200,cursor:'next'})
})
it('coordinator has no backfill, starts once, enters caption import synchronously, and rechecks stop/remove/current/enabled',async()=>{
 const results:unknown[]=[]
 for(const intervention of ['stop','remove','current','disable','none'] as const){
  const f=fixture();let enabled=true;let release:((imported:boolean)=>void)|undefined
  const coordinator=new AutoTranscriptionCoordinator({queue:f.queue,store:f.store,isEnabled:()=>enabled,resolveSourceFile:()=>f.source,isModelsReady:()=>true,tryImportCaptions:input=>{f.trace.push(['caption',{...input,sourceFilePath:'/fixture/source.mp4'}]);return new Promise(done=>{release=done})}})
  coordinator.start();coordinator.start();f.trace.push('started');f.emit();f.trace.push('immediate')
  if(intervention==='stop')coordinator.stop();if(intervention==='remove')f.download.status='cancelled';if(intervention==='disable')enabled=false
  if(intervention==='current')vi.spyOn(f.store,'getLatestForDownload').mockReturnValue({id:'current',downloadTaskId:'download',transcriptionTaskId:'task',sourceFilePath:'/fixture/source.mp4',modelVersion:'fixture',asrTier:'minimal',sourceKind:'asr',resultKind:'no-speech',language:null,createdAt:1,updatedAt:1,supersededAt:null,speakers:[],segments:[]})
  release?.(false);await tick();coordinator.stop();results.push({intervention,trace:f.trace})
 }
 expect(results).toMatchSnapshot()
},30000)
it('pending flush is explicit, caption successes bypass disabled ASR and overlapping imports recheck current record',async()=>{
 const f=fixture();let ready=false;let imports=0
 const coordinator=new AutoTranscriptionCoordinator({queue:f.queue,store:f.store,isEnabled:()=>true,resolveSourceFile:()=>f.source,isModelsReady:()=>ready,tryImportCaptions:async()=>{imports++;return false}})
 coordinator.start();f.emit();f.emit();await tick();expect(f.queue.add).not.toHaveBeenCalled();ready=true;await coordinator.flushPending();expect(imports).toBe(3);expect(f.queue.add).toHaveBeenCalledTimes(1);await coordinator.flushPending();expect(f.queue.add).toHaveBeenCalledTimes(1);coordinator.stop();expect(f.trace).toMatchSnapshot()
 const other=fixture();const success=new AutoTranscriptionCoordinator({queue:other.queue,store:other.store,isEnabled:()=>false,resolveSourceFile:()=>other.source,tryImportCaptions:async()=>true});success.start();other.emit();await tick();expect(other.queue.add).not.toHaveBeenCalled();success.stop()
},30000)
