import './fixtures/audit-isolation'
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as T from '@vidbee/transcription'
import { TaskQueueAPI, type TaskQueueEvent } from '@vidbee/task-queue-legacy'
import { MemoryPersistAdapter } from '@vidbee/task-queue-legacy/persist'
import { task } from '../../task-queue-legacy/test/fixtures'
const roots:string[]=[]
afterEach(()=>{vi.restoreAllMocks();for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})})
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'audit-coordinator-'));roots.push(root);const source=join(root,'source');writeFileSync(source,'media')
 const queue=new TaskQueueAPI({persist:new MemoryPersistAdapter(),clock:()=>1000,executor:{run:()=>({cancel:async()=>{},pause:async()=>{}})}})
 const store=new T.MemoryTranscriptStore({clock:()=>1000});const download=task('download',{status:'completed',input:{kind:'video',url:'https://fixture.invalid',title:'fixture'}})
 const trace:unknown[]=[];let listener:(event:TaskQueueEvent)=>void=()=>{}
 vi.spyOn(queue,'subscribe').mockImplementation(fn=>{listener=fn;return()=>{}})
 vi.spyOn(queue,'get').mockImplementation(id=>id==='download'?download:undefined)
 const list=vi.spyOn(queue,'list').mockReturnValue({tasks:[],nextCursor:null})
 const add=vi.spyOn(queue,'add').mockImplementation(async input=>{trace.push(['add',JSON.parse(JSON.stringify(input).replaceAll(source,'<SOURCE>'))]);return{id:'added',created:true}})
 const emit=(to:'completed'|'failed'='completed')=>listener({type:'transition',taskId:'download',from:'running',to,reason:null,attempt:1,at:1000})
 return {root,source,queue,store,trace,download,list,add,emit,event:(event:TaskQueueEvent)=>listener(event)}
}
it('audit enqueue forwards force-rediarize and creation metadata; source failures reject before queue inspection',async()=>{
 const f=fixture();const creation={origin:'agent' as const,agentConversation:{downloadId:'download',threadId:'thread',promptId:'prompt'}}
 await T.enqueueTranscription({queue:f.queue,store:f.store,downloadTaskId:'download',sourceFilePath:f.source,trigger:'force',rediarize:true,speakerCount:2,creation})
 expect(f.trace).toMatchSnapshot()
 for(const source of [join(f.root,'absent'),join(f.root,'empty')]){if(source.endsWith('empty'))writeFileSync(source,'');f.list.mockClear();let pending:ReturnType<typeof T.enqueueTranscription>|undefined
 expect(()=>{pending=T.enqueueTranscription({queue:f.queue,store:f.store,downloadTaskId:'download',sourceFilePath:source,trigger:'manual'})}).not.toThrow()
 expect(pending).toBeInstanceOf(Promise);await expect(pending).rejects.toMatchObject({name:'Error',message:`source file missing: ${source}`});expect(f.list).not.toHaveBeenCalled()}
},30000)
it('audit coordinator filters events, forwards all resolvers and catches original import/enqueue failures',async()=>{
 const f=fixture();const importError=new Error('import rejected');const enqueueError=new Error('enqueue rejected');const warnings:unknown[][]=[]
 const coordinator=new T.AutoTranscriptionCoordinator({queue:f.queue,store:f.store,isEnabled:()=>true,resolveSourceFile:()=>{f.trace.push('source');return f.source},resolveAsrTier:()=> 'whisper-base',resolveProvider:()=> 'cloud',resolveCloudModelId:()=> 'fixture-cloud',resolveLanguage:()=> 'zh-Hant',tryImportCaptions:async()=>{f.trace.push('import');throw importError},logger:{warn:(...args)=>warnings.push(args)}})
 coordinator.start();f.emit('failed');f.event({type:'progress',taskId:'download',progress:{percent:null,bytesDownloaded:null,bytesTotal:null,speedBps:null,etaMs:null,ticks:1000},at:1000});f.download.kind='transcription';f.emit();expect(f.trace).toEqual([]);f.download.kind='video'
 f.add.mockImplementation(async input=>{f.trace.push(['add',JSON.parse(JSON.stringify(input).replaceAll(f.source,'<SOURCE>'))]);throw enqueueError})
 f.emit();await new Promise<void>(done=>setImmediate(done));expect(warnings).toEqual([['caption import failed',importError],['auto-transcription enqueue failed',enqueueError]]);expect(warnings[0]?.[1]).toBe(importError);expect(warnings[1]?.[1]).toBe(enqueueError);expect(f.trace).toMatchSnapshot();coordinator.stop()
},30000)
it('audit coordinator null and zero-byte sources stop before caption imports or queue inspection',async()=>{
 for(const missing of [true,false]){const f=fixture();writeFileSync(f.source,'');const imports=vi.fn(async()=>false);const coordinator=new T.AutoTranscriptionCoordinator({queue:f.queue,store:f.store,isEnabled:()=>true,resolveSourceFile:()=>missing?null:f.source,tryImportCaptions:imports});coordinator.start();f.emit();await new Promise<void>(done=>setImmediate(done));expect(imports).not.toHaveBeenCalled();expect(f.list).not.toHaveBeenCalled();expect(f.add).not.toHaveBeenCalled();coordinator.stop()}
},30000)
