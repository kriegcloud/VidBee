import './fixtures/audit-isolation'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as T from '@vidbee/transcription-legacy'
import type { ExecutorContext, ExecutorFinishEvent } from '@vidbee/task-queue-legacy'
const result:T.PipelineResult={resultKind:'no-speech',modelVersion:'cloud-v',asrTier:null,language:null,speakers:[],segments:[]}
const segment:T.PipelineSegment={speakerKey:null,startMs:0,endMs:10,text:'partial',confidence:null}
const context=(options:Parameters<typeof T.buildTranscriptionInput>[0]):ExecutorContext=>({taskId:'audit-executor',attemptId:'attempt',attemptNumber:1,input:T.buildTranscriptionInput(options)})
for(const available of [false,true])test(`audit cloud executor call shape, callbacks, partial clearing and commit-before-cleanup available=${available}`,{timeout:30000},async()=>{
 const trace:string[]=[];const store=new T.MemoryTranscriptStore({clock:()=>1000});const ctx=context({downloadTaskId:'d',sourceFilePath:'/fixture/source',trigger:'manual',provider:'cloud'})
 // Omit cloudModelId at the public TaskInput boundary to pin the parser's cloud default before executor forwarding.
 if(ctx.input.options)delete ctx.input.options.cloudModelId
 T.transcriptionPartials.append(ctx.taskId,'d',segment)
 const executor=new T.TranscriptionExecutor({store,workerScript:'/unused',modelsDir:'/unused',resolveFfmpegPath:()=>'/unused',onPartial:event=>{trace.push('partial');assert.deepEqual(event.segments,[segment]);assert.deepEqual(T.transcriptionPartials.getByTask(ctx.taskId)?.segments,[segment])},onStage:()=>trace.push('stage'),...(available?{runCloud:async(input:Parameters<NonNullable<ConstructorParameters<typeof T.TranscriptionExecutor>[0]['runCloud']>>[0])=>{
  trace.push('cloud');assert.equal(T.transcriptionPartials.getByTask(ctx.taskId),null);assert.deepEqual(Object.keys(input),['taskId','sourceFilePath','modelId','signal','onProgress','onPartial']);assert.equal(input.taskId,ctx.taskId);assert.equal(input.sourceFilePath,'/fixture/source');assert.equal(input.modelId,'qwen/qwen3-asr-1.7b');assert.equal(input.signal.aborted,false)
  input.onProgress('recognizing',0.5);trace.push('after-progress');input.onPartial?.(segment);trace.push('after-partial')
  return{result,durationMs:123,cleanup:async()=>{trace.push('cleanup');assert.equal(store.getByTranscriptionTaskId(ctx.taskId)?.resultKind,'no-speech');assert.deepEqual(T.transcriptionPartials.getByTask(ctx.taskId)?.segments,[segment])}}
 }}:{})})
 let done:(value:ExecutorFinishEvent)=>void=()=>{};const finished=new Promise<ExecutorFinishEvent>(resolve=>done=resolve)
 executor.run(ctx,{onSpawn:()=>trace.push('spawn'),onProgress:()=>trace.push('progress'),onStd:()=>trace.push('std'),onFinish:event=>{trace.push('finish');done(event)}});trace.push('run-return');const end=await finished
 assert.equal(end.result.type,available?'success':'error',JSON.stringify(end));if(!available){assert.equal(end.stderrTail,'Cloud transcription is unavailable in this application');assert.equal(store.getByTranscriptionTaskId(ctx.taskId),null)}else if(end.result.type==='success'){assert.equal(end.result.output.durationMs,123)}
 assert.equal(T.transcriptionPartials.getByTask(ctx.taskId),null)
 assert.deepEqual(trace,available?['run-return','spawn','cloud','stage','progress','std','after-progress','partial','after-partial','cleanup','finish']:['run-return','spawn','finish'])
})
test('audit rediarize provider cloud uses local in-process seed and absent seed is undefined', {timeout:30000},async()=>{
 for(const hasSeed of [false,true]){const store=new T.MemoryTranscriptStore({clock:()=>1000});if(hasSeed)store.commit({transcriptId:'seed',downloadTaskId:'d',transcriptionTaskId:'captions:d:en',sourceFilePath:'/fixture/source',result:{...result,resultKind:'transcript',sourceKind:'captions',segments:[segment]}})
 const expected=hasSeed?T.latestTranscriptSeed(store,'d'):undefined;let seen=false
 const executor=new T.TranscriptionExecutor({store,workerScript:'/unused',modelsDir:'/unused',resolveFfmpegPath:()=>'/unused',runCloud:async()=>{assert.fail('rediarize selected cloud')},runInProcess:async input=>{seen=true;assert.deepEqual(input.existingTranscript,expected);return{result,durationMs:1}}})
 let done:(value:ExecutorFinishEvent)=>void=()=>{};const finished=new Promise<ExecutorFinishEvent>(resolve=>done=resolve);executor.run(context({downloadTaskId:'d',sourceFilePath:'/fixture/source',trigger:'force',provider:'cloud',rediarize:true}),{onSpawn:()=>{},onProgress:()=>{},onStd:()=>{},onFinish:done});assert.equal((await finished).result.type,'success');assert.equal(seen,true);T.transcriptionPartials.clear('audit-executor')}
})

test('audit worker rediarize seed bytes and restored callbacks precede runtime/spawn; exported worker consumes seed', {timeout:60000},async t=>{
 const fs=await import('node:fs');const {join}=await import('node:path');const {tmpdir}=await import('node:os');const {executable,NODE,workerArgs}=await import('./fixtures/process-runtime');const {spawn}=await import('node:child_process')
 const root=fs.mkdtempSync(join(tmpdir(),'audit-seed-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const source=join(root,'source');fs.writeFileSync(source,'media');fs.utimesSync(source,1,1)
 const store=new T.MemoryTranscriptStore({clock:()=>1000});store.commit({transcriptId:'seed',downloadTaskId:'d',transcriptionTaskId:'caption',sourceFilePath:source,result:{...result,resultKind:'transcript',sourceKind:'captions',segments:[segment]}})
 const expected=T.latestTranscriptSeed(store,'d');assert(expected)
 const ctx=context({downloadTaskId:'d',sourceFilePath:source,trigger:'manual',rediarize:true,provider:'cloud',speakerCount:1})
 const fingerprint=T.sourceFingerprint(source);const version=`${T.modelVersion}:minimal:spk-1`;const work=join(root,'vidbee-transcript',T.manifestWorkKey(ctx.taskId,fingerprint,version));fs.mkdirSync(work,{recursive:true})
 const manifest=T.ensureChunkManifest({workDir:work,taskId:ctx.taskId,fingerprint,modelVersion:version})
 const chunks=[{...segment,index:0},{...segment,index:1,startMs:20,endMs:30,text:'second'}]
 for(const chunk of chunks)T.appendManifestChunk(manifest.path,chunk)
 fs.writeFileSync(join(work,'stages.json'),JSON.stringify([{stage:'recognizing',startedAt:10}]))
 const requests=join(root,'request');const seedBytes=join(root,'seed-bytes');const trace:string[]=[]
 const worker=executable(root,'worker',`process.stdin.once('data',bytes=>{const fs=require('node:fs');const request=JSON.parse(bytes.toString().split('\\n')[0]);fs.writeFileSync(${JSON.stringify(requests)},JSON.stringify(request));fs.copyFileSync(request.existingTranscriptPath,${JSON.stringify(seedBytes)});console.log(JSON.stringify({type:'result',result:${JSON.stringify(result)},durationMs:1}));setInterval(()=>{},1000)})`)
 const executor=new T.TranscriptionExecutor({store,workerScript:worker,workDir:root,modelsDir:root,resolveFfmpegPath:()=>'/fixture/ffmpeg',execPath:NODE,forceLayer:'electron',skipProbe:true,backend:'fake',runCloud:async()=>assert.fail('cloud rediarize'),onPartial:event=>{trace.push('restored-partial');assert.deepEqual(event.segments,chunks.map(({index,...value})=>({...value,words:undefined})))},onStage:event=>{trace.push(`stage:${event.stage}`)}})
 let done:(event:ExecutorFinishEvent)=>void=()=>{};const finished=new Promise<ExecutorFinishEvent>(resolve=>done=resolve)
 executor.run(ctx,{onSpawn:()=>trace.push('spawn'),onProgress:()=>trace.push('progress'),onStd:event=>trace.push(`std:${event.line.split('=')[0]}`),onFinish:done});assert.equal((await finished).result.type,'success')
 assert.deepEqual(trace.slice(0,3),['spawn','restored-partial','stage:recognizing']);assert(trace.indexOf('std:runtime.path')>1)
 const request=JSON.parse(fs.readFileSync(requests,'utf8'));assert.equal(request.existingTranscriptPath,join(work,T.SEED_TRANSCRIPT_FILE));assert.deepEqual(JSON.parse(fs.readFileSync(seedBytes,'utf8')),expected)
 // With one speaker, consuming the seed skips audio and preserves its text; no executable is present.
 const publicWork=join(root,'public-worker');fs.mkdirSync(publicWork);const seedPath=join(publicWork,'seed.json');T.writePipelineSeed(seedPath,expected)
 const child=spawn(NODE,workerArgs,{env:{...process.env,VIDBEE_TRANSCRIPTION_BACKEND:'fake'},detached:process.platform!=='win32',stdio:['pipe','pipe','pipe']});t.after(()=>child.kill('SIGKILL'));let stdout='';let stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk)
 child.stdin.end(JSON.stringify({...request,workDir:publicWork,existingTranscriptPath:seedPath,ffmpegPath:join(root,'missing')})+'\n');assert.equal(await new Promise(resolve=>child.once('close',resolve)),0);assert.equal(stderr,'')
 const messages=stdout.trim().split('\n').map(line=>JSON.parse(line));assert(!messages.some(message=>message.type==='error'));assert(messages.some(message=>message.type==='result'));const output=JSON.parse(fs.readFileSync(join(publicWork,'pipeline-result.json'),'utf8'));assert.deepEqual(output.segments.map(({speakerKey,...value}:T.PipelineSegment)=>value),expected.segments.map(({speakerKey,...value})=>value));assert.equal(output.segments[0].speakerKey,'speaker-1');assert.equal(output.language,expected.language);T.transcriptionPartials.clear(ctx.taskId)
})
