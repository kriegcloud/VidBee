import { readFixturePid, requireFixturePid, killFixtureProcess } from './fixtures/audit-pid'
import './fixtures/audit-isolation'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { buildTranscriptionInput, MemoryTranscriptStore, modelVersion, TranscriptionExecutor, transcriptionPartials } from '@vidbee/transcription-legacy'
import type { PipelineResult } from '@vidbee/transcription-legacy'
import type { ExecutorContext, ExecutorEvents, ExecutorFinishEvent } from '@vidbee/task-queue-legacy'
import { executable, NODE } from './fixtures/process-runtime'

const result:PipelineResult={resultKind:'no-speech',language:null,modelVersion,asrTier:'minimal',speakers:[],segments:[]}
const ctx:ExecutorContext={taskId:'task-process',attemptId:'attempt',attemptNumber:1,input:buildTranscriptionInput({downloadTaskId:'download',sourceFilePath:'/fixture/source',trigger:'manual'})}
function callbacks(trace:unknown[],resolve:(value:ExecutorFinishEvent)=>void):ExecutorEvents{return{onSpawn:event=>trace.push(['spawn',event]),onProgress:event=>trace.push(['progress',event]),onStd:event=>trace.push(['std',event]),onFinish:event=>{trace.push(['finish',event]);resolve(event)}}}
function compare(name:string,trace:unknown[],root=''){
  const json=JSON.stringify(trace,(key,value)=>key==='pid'?'PID':['pidStartedAt','spawnedAt','closedAt','ticks','startedAt'].includes(key)?1000:key==='transcriptId'?'ID':value)
  const normalized=JSON.parse((root?json.split(root).join('<ROOT>'):json).split(NODE).join('<NODE>').split(`runtime.version=${process.versions.node}`).join('runtime.version=<NODE_VERSION>'))
  const file=new URL(`./fixtures/process-executor-${name}.json`,import.meta.url)
  if(process.env.VIDBEE_RECORD_CHARACTERIZATION==='1')writeFileSync(file,`${JSON.stringify(normalized,null,2)}\n`)
  assert.deepEqual(normalized,JSON.parse(readFileSync(file,'utf8')))
}
test('executor queued launch, sync callback prefixes, stage deduplication and partial state survive in-process success', {timeout:30000},async()=>{
  const trace:unknown[]=[];let done:(e:ExecutorFinishEvent)=>void=()=>{};const finished=new Promise<ExecutorFinishEvent>(resolve=>done=resolve)
  const executor=new TranscriptionExecutor({store:new MemoryTranscriptStore({clock:()=>1000}),workerScript:'/unused',modelsDir:'/unused',resolveFfmpegPath:()=>'/unused',onStage:event=>trace.push(['stage',event,transcriptionPartials.getByTask(ctx.taskId)]),onPartial:event=>trace.push(['partial',event,transcriptionPartials.getByTask(ctx.taskId)]),runInProcess:async(input)=>{
    trace.push(['pipeline',input.sourceFilePath,input.skipVad,input.autoSkipAllowed,input.asrTier,input.speakerCount,input.signal.aborted]);queueMicrotask(()=>trace.push('pipeline-microtask'))
    input.onProgress('recognizing',0.1);trace.push('after-progress');input.onProgress('recognizing',0.2);trace.push('after-same-stage')
    input.onPartial?.({speakerKey:null,startMs:0,endMs:1,text:'fixture',confidence:null});trace.push('after-partial');input.onProgress('committing',1);return{result,durationMs:0}
  }})
  executor.run(ctx,callbacks(trace,done));trace.push('run-return');queueMicrotask(()=>trace.push('caller-microtask'));await finished;trace.push(['after-finish',Boolean(transcriptionPartials.getByTask(ctx.taskId))]);compare('in-process',trace);transcriptionPartials.clear(ctx.taskId)
})
for(const action of ['cancel','pause'] as const)test(`executor ${action} before launch still enters in-process seam, passes aborted signal, skips commit`,{timeout:30000},async()=>{
  const trace:unknown[]=[];let done:(e:ExecutorFinishEvent)=>void=()=>{};const finished=new Promise<ExecutorFinishEvent>(resolve=>done=resolve)
  const store=new MemoryTranscriptStore();const executor=new TranscriptionExecutor({store,workerScript:'/unused',modelsDir:'/unused',resolveFfmpegPath:()=>'/unused',runInProcess:async(input)=>{trace.push(['pipeline',input.signal.aborted]);return{result,durationMs:1}}})
  const handle=executor.run(ctx,callbacks(trace,done));const pending=handle[action]?.();trace.push('handle-return');void pending?.then(()=>trace.push('handle-resolved'));queueMicrotask(()=>trace.push('caller-microtask'));await finished;assert.equal(store.getByTranscriptionTaskId(ctx.taskId),null);compare(action,trace)
})
test('executor missing options fail asynchronously without a spawn callback', {timeout:30000},async()=>{
  const trace:unknown[]=[];let done:(e:ExecutorFinishEvent)=>void=()=>{};const finished=new Promise<ExecutorFinishEvent>(resolve=>done=resolve)
  const executor=new TranscriptionExecutor({store:new MemoryTranscriptStore(),workerScript:'/unused',modelsDir:'/unused',resolveFfmpegPath:()=>'/unused'})
  executor.run({...ctx,input:{kind:'transcription',url:''}},callbacks(trace,done));trace.push('run-return');queueMicrotask(()=>trace.push('caller-microtask'));await finished;compare('invalid',trace)
})
for(const mode of ['success','exit-zero','exit-nonzero','signal-term','protocol-error','unterminated','result-file-missing','cancel-ignore-term'] as const)test(`worker executor complete lifecycle and restart classification: ${mode}`,{timeout:30000},async(t)=>{
  const root=mkdtempSync(join(tmpdir(),'vidbee-executor-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const source=join(root,'source');writeFileSync(source,'media');utimesSync(source,1,1);const starts=join(root,'starts');const pidFile=join(root,'pid');const termFile=join(root,'term')
  const body=mode==='success'?`console.log(JSON.stringify({type:'log',stream:'stderr',line:'diagnostic'}));console.log(JSON.stringify({type:'progress',stage:'recognizing',percent:0.5}));console.log(JSON.stringify({type:'result',result:${JSON.stringify(result)},durationMs:321}));setInterval(()=>{},1000)`:mode==='exit-zero'?'process.exit(0)':mode==='exit-nonzero'?'process.stderr.write("crash detail");process.exit(7)':mode==='signal-term'?"process.kill(process.pid,'SIGTERM')":mode==='protocol-error'?`console.log(JSON.stringify({type:'error',message:'native decode failure'}));setInterval(()=>{},1000)`:mode==='unterminated'?`process.stdout.write(JSON.stringify({type:'result',result:${JSON.stringify(result)},durationMs:1}));process.exit(0)`:mode==='result-file-missing'?`console.log(JSON.stringify({type:'result',resultPath:'missing.json',durationMs:1}));setInterval(()=>{},1000)`:`process.on('SIGTERM',()=>require('node:fs').writeFileSync(${JSON.stringify(termFile)},'term'));setInterval(()=>{},1000)`
  const worker=executable(root,'worker',`let b='';process.stdin.on('data',x=>{b+=x;if(!b.includes('\\n'))return;const fs=require('node:fs');fs.appendFileSync(${JSON.stringify(starts)},b.split('\\n')[0]+'\\n');fs.writeFileSync(${JSON.stringify(pidFile)},String(process.pid)+'\\n');process.stdin.removeAllListeners('data');${body}})`)
  const trace:unknown[]=[];let done:(e:ExecutorFinishEvent)=>void=()=>{};const finished=new Promise<ExecutorFinishEvent>(resolve=>done=resolve)
  const store=new MemoryTranscriptStore({clock:()=>1000});const executor=new TranscriptionExecutor({store,workerScript:worker,modelsDir:'/fixture/models',resolveFfmpegPath:()=>'/fixture/ffmpeg',backend:'fake',execPath:NODE,forceLayer:'electron',skipProbe:true,maxWorkerRestarts:1,workDir:root})
  const handle=executor.run({...ctx,input:buildTranscriptionInput({downloadTaskId:'download',sourceFilePath:source,trigger:'manual'})},callbacks(trace,done));trace.push('run-return')
  if(mode==='cancel-ignore-term'){for(const deadline=Date.now()+25000;Date.now()<deadline&&readFixturePid(pidFile)===null;)await delay(5);assert.equal(existsSync(pidFile),true);await handle.cancel();trace.push('cancel-resolved');assert.equal(existsSync(termFile),true)}
  const end=await finished;const pid=requireFixturePid(pidFile);assert.throws(()=>process.kill(pid,0));assert.equal(end.result.type,mode==='success'?'success':mode==='cancel-ignore-term'?'cancelled':'error')
  trace.push(['requests',readFileSync(starts,'utf8').trim().split('\n').map(line=>JSON.parse(line))]);trace.push(['retained-work-dirs',readdirSync(join(root,'vidbee-transcript')).sort()]);compare(mode,trace,root);transcriptionPartials.clear(ctx.taskId)
})
test('parent heartbeat is unreferenced, stops during killed-but-alive gap, and cancel waits for owned worker reaping', {timeout:30000},async(t)=>{
  const root=mkdtempSync(join(tmpdir(),'vidbee-heartbeat-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const source=join(root,'source');writeFileSync(source,'media');const ready=join(root,'ready');const term=join(root,'term')
  const worker=executable(root,'worker',`process.on('SIGTERM',()=>require('node:fs').writeFileSync(${JSON.stringify(term)},'term'));process.stdin.on('data',()=>require('node:fs').writeFileSync(${JSON.stringify(ready)},String(process.pid)+'\\n'));setInterval(()=>{},1000)`)
  let beat:(()=>void)|undefined;let timer:NodeJS.Timeout|undefined;const interval=globalThis.setInterval
  t.mock.method(globalThis,'setInterval',(callback:()=>void,milliseconds?:number)=>{const handle=interval(callback,milliseconds);if(milliseconds===10000){beat=callback;timer=handle}return handle})
  const trace:unknown[]=[];let done:(e:ExecutorFinishEvent)=>void=()=>{};let isFinished=false;const finished=new Promise<ExecutorFinishEvent>(resolve=>done=event=>{isFinished=true;resolve(event)})
  const executor=new TranscriptionExecutor({store:new MemoryTranscriptStore(),workerScript:worker,modelsDir:root,workDir:root,resolveFfmpegPath:()=>'/unused',execPath:NODE,forceLayer:'electron',skipProbe:true,backend:'fake'})
  const handle=executor.run({...ctx,input:buildTranscriptionInput({downloadTaskId:'download',sourceFilePath:source,trigger:'manual'})},callbacks(trace,done))
  for(const deadline=Date.now()+25000;Date.now()<deadline&&readFixturePid(ready)===null;)await delay(5);assert.equal(existsSync(ready),true);assert.ok(beat);assert.ok(timer);assert.equal(timer.hasRef(),false)
  beat();const aliveCount=()=>trace.filter(event=>Array.isArray(event)&&event[0]==='std'&&event[1].line==='worker-alive').length
  assert.equal(aliveCount(),1);const cancelling=handle.cancel();beat();assert.equal(aliveCount(),1);assert.equal(isFinished,false)
  for(const deadline=Date.now()+25000;Date.now()<deadline&&!existsSync(term);)await delay(5);assert.equal(existsSync(term),true);const pid=requireFixturePid(ready);assert.doesNotThrow(()=>process.kill(pid,0));assert.equal(isFinished,false)
  await cancelling;assert.equal((await finished).result.type,'cancelled');assert.throws(()=>process.kill(pid,0));assert.equal(aliveCount(),1);transcriptionPartials.clear(ctx.taskId)
})
test('progress callback throw stops stdout delivery and is classified once after the synchronous prefix', {timeout:30000},async()=>{
  const failure=new Error('fixture callback failure');const trace:string[]=[];let done:(e:ExecutorFinishEvent)=>void=()=>{};const finished=new Promise<ExecutorFinishEvent>(resolve=>done=resolve)
  const executor=new TranscriptionExecutor({store:new MemoryTranscriptStore(),workerScript:'/unused',modelsDir:'/unused',resolveFfmpegPath:()=>'/unused',onStage:()=>trace.push('stage'),runInProcess:async(input)=>{input.onProgress('recognizing',0.1);trace.push('unreachable');return{result,durationMs:1}}})
  executor.run(ctx,{onSpawn:()=>trace.push('spawn'),onProgress:()=>{trace.push('progress');throw failure},onStd:()=>trace.push('stdout'),onFinish:event=>{trace.push('finish');done(event)}});trace.push('run-return');const end=await finished;assert.deepEqual(trace,['run-return','spawn','stage','progress','finish']);assert.equal(end.result.type,'error');assert.equal(end.stderrTail,failure.message);transcriptionPartials.clear(ctx.taskId)
})
test('verified accelerator failure falls back to CPU and caches that winner for the next task', {timeout:30000,skip:process.platform!=='linux'||process.arch!=='x64'?'accelerator ladder fixture recorded for linux-x64':false},async(t)=>{
  const root=mkdtempSync(join(tmpdir(),'vidbee-provider-fallback-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const source=join(root,'source');writeFileSync(source,'media');utimesSync(source,1,1);const requests=join(root,'requests')
  const worker=executable(root,'worker',`let b='';process.stdin.on('data',x=>{b+=x;if(!b.includes('\\n'))return;const line=b.split('\\n')[0];require('node:fs').appendFileSync(${JSON.stringify(requests)},line+'\\n');const m=JSON.parse(line);process.stdin.removeAllListeners('data');if(m.type==='probe')console.log(JSON.stringify({type:'probe-ok',durationMs:m.provider==='cuda'?1:10}));else if(m.provider==='cuda')console.log(JSON.stringify({type:'error',message:'cuda runtime failed'}));else console.log(JSON.stringify({type:'result',result:${JSON.stringify(result)},durationMs:123}));setInterval(()=>{},1000)})`)
  const trace:unknown[]=[];const executor=new TranscriptionExecutor({store:new MemoryTranscriptStore({clock:()=>1000}),workerScript:worker,modelsDir:'/fixture/models',resolveFfmpegPath:()=>'/fixture/ffmpeg',execPath:NODE,forceLayer:'electron',workDir:root,resolveGpuKinds:async()=>['nvidia']})
  for(const taskId of ['first','second']){
    let done:(event:ExecutorFinishEvent)=>void=()=>{};const finished=new Promise<ExecutorFinishEvent>(resolve=>done=resolve)
    executor.run({...ctx,taskId,input:buildTranscriptionInput({downloadTaskId:'download',sourceFilePath:source,trigger:'manual'})},callbacks(trace,done));trace.push(['run-return',taskId]);assert.equal((await finished).result.type,'success');transcriptionPartials.clear(taskId)
  }
  trace.push(['requests',readFileSync(requests,'utf8').trim().split('\n').map(line=>JSON.parse(line))]);compare('accelerator-fallback',trace,root)
})
