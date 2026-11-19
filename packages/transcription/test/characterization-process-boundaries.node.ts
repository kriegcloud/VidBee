import './fixtures/audit-isolation'
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { buildTranscriptionInput, extractEmbeddedCaptionTracks, MemoryTranscriptStore, MODEL_CATALOG, ModelManager, modelVersion, readPcmWav, SherpaTranscriptionPipeline, TranscriptionExecutor, transcriptionPartials } from '@vidbee/transcription'
import type { PipelineResult } from '@vidbee/transcription'
import type { ExecutorFinishEvent } from '@vidbee/task-queue-legacy'
import { executable, NODE } from './fixtures/process-runtime'
function temporary(t:{after:(fn:()=>void)=>void}){const root=mkdtempSync(join(tmpdir(),'vidbee-boundaries-'));t.after(()=>rmSync(root,{recursive:true,force:true}));return root}
function compare(name:string,value:unknown,root:string){const text=JSON.stringify(value,(key,item)=>['pid','pidStartedAt','spawnedAt','closedAt','ticks','startedAt'].includes(key)?1000:key==='transcriptId'?'ID':typeof item==='number'&&!Number.isFinite(item)?{number:String(item)}:item);const normalized=JSON.parse(text.split(root).join('<ROOT>').split(NODE).join('<NODE>').split(`runtime.version=${process.versions.node}`).join('runtime.version=<NODE_VERSION>'));const file=new URL(`./fixtures/process-boundary-${name}.json`,import.meta.url);if(process.env.VIDBEE_RECORD_CHARACTERIZATION==='1')writeFileSync(file,`${JSON.stringify(normalized,null,2)}\n`);assert.deepEqual(normalized,JSON.parse(readFileSync(file,'utf8')))}
function chunk(name:string,data:Buffer,size=data.length){const header=Buffer.alloc(8);header.write(name);header.writeUInt32LE(size,4);return Buffer.concat([header,data,data.length%2?Buffer.alloc(1):Buffer.alloc(0)])}
function format(bits:number,channels=1,sampleRate=16000,code=1){const data=Buffer.alloc(16);data.writeUInt16LE(code);data.writeUInt16LE(channels,2);data.writeUInt32LE(sampleRate,4);data.writeUInt16LE(bits,14);return chunk('fmt ',data)}
function wav(parts:Buffer[]){const header=Buffer.alloc(12);header.write('RIFF');header.write('WAVE',8);return Buffer.concat([header,...parts])}
const good:PipelineResult={resultKind:'no-speech',language:null,modelVersion,asrTier:'minimal',speakers:[],segments:[]}
test('PCM complete basic depth/channel/chunk and malformed external-file matrix', {timeout:30000},(t)=>{
  const root=temporary(t);const file=join(root,'wave');const cases:[string,Buffer][]=[
    ['8-bit-mono',wav([format(8),chunk('data',Buffer.from([0,128,255]))])],
    ['8-bit-stereo',wav([format(8,2),chunk('data',Buffer.from([0,255,128,128,255]))])],
    ['16-bit-stereo',wav([format(16,2),chunk('data',Buffer.from([0,128,255,127,0,64,0,64,255]))])],
    ['32-bit-nonfinite',wav([format(32,2,8000,3),chunk('data',Buffer.from('0000807f000080ff0000003f0000803f','hex'))])],
    ['24-bit',wav([format(24),chunk('data',Buffer.alloc(6))])],
    ['zero-bits',wav([format(0),chunk('data',Buffer.alloc(3))])],
    ['zero-channels',wav([format(16,0),chunk('data',Buffer.alloc(4))])],
    ['zero-rate',wav([format(16,1,0),chunk('data',Buffer.alloc(4))])],
    ['fmt-code-ignored',wav([format(16,1,16000,99),chunk('data',Buffer.from([0,64]))])],
    ['odd-unknown-chunk',wav([format(8),chunk('JUNK',Buffer.from([42])),chunk('data',Buffer.from([255]))])],
    ['data-before-fmt',wav([chunk('data',Buffer.alloc(32)),format(8)])],
    ['empty-data',wav([format(16),chunk('data',Buffer.alloc(0))])],
    ['declared-data-overrun',wav([format(16),chunk('data',Buffer.from([0,64,255]),1000)])],
    ['declared-data-zero',wav([format(16),chunk('data',Buffer.from([0,64]),0)])],
    ['first-data-wins',wav([format(8),chunk('data',Buffer.from([0])),chunk('data',Buffer.from([255]))])],
    ['duplicate-format-last-wins',wav([format(16),format(8,1,22050),chunk('data',Buffer.from([255]))])],
    ['no-data',wav([format(16),chunk('JUNK',Buffer.alloc(8))])],
    ['format-overrun',wav([chunk('fmt ',Buffer.alloc(2),100),chunk('JUNK',Buffer.alloc(24))])],
    ['truncated-format-fields',wav([chunk('JUNK',Buffer.alloc(16)),chunk('fmt ',Buffer.alloc(6))])],
    ['truncated-tail-header',wav([format(16),Buffer.alloc(7)])],
    ['short-header',Buffer.alloc(43)],['wrong-riff',Buffer.alloc(44)],['wrong-wave',Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(40)])]
  ]
  const values=cases.map(([name,bytes])=>{writeFileSync(file,bytes);try{const result=readPcmWav(file);return{name,result:{sampleRate:result.sampleRate,samples:Array.from(result.samples)}}}catch(error){assert.ok(error instanceof Error);return{name,error:{name:error.name,message:error.message}}}})
  compare('wav-matrix',values,root)
})
for(const mode of ['throw-error','throw-string','syntax-unrelated','syntax-unterminated','control-repair','control-and-invalid-syntax','native-nonfinite','native-wrong-text','native-null-root','native-unknown-keys'] as const)test(`fake addon result repair predicate and global restoration: ${mode}`,{timeout:30000},async(t)=>{
  const root=temporary(t);for(const spec of MODEL_CATALOG.filter(spec=>spec.tier==='minimal')){const file=join(root,spec.fileName);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,'fixture')}
  const file=join(root,'wave');writeFileSync(file,wav([format(16),chunk('data',Buffer.alloc(32000))]));const parse=JSON.parse;const failure=new Error('getResult identity');const raw=mode==='native-nonfinite'?'{"text":"Hello.","tokens":["Hello."],"timestamps":[1e999],"durations":[1e999]}':mode==='native-wrong-text'?'{"text":42}':mode==='native-null-root'?'null':mode==='native-unknown-keys'?'{"text":"Hello.","future":{"retained":true}}':mode==='syntax-unrelated'?'{"text": undefined}':mode==='syntax-unterminated'?'{"text":"unfinished':mode==='control-and-invalid-syntax'?'{"text":"raw\nline", bad}':'{"text":"Hello\nworld."}'
  let observedPatched=false
  class Recognizer{createStream(){return{acceptWaveform:()=>{}}}decode(){}getResult(){observedPatched=JSON.parse!==parse;if(mode==='throw-error')throw failure;if(mode==='throw-string')throw 'foreign rejection';return JSON.parse(raw)}}
  const addon={OfflineRecognizer:Recognizer,Vad:class{acceptWaveform(){}isEmpty(){return true}front(){return{}}pop(){}flush(){}},OfflineSpeakerDiarization:class{process(){return[]}},readWave:()=>({sampleRate:16000,samples:new Float32Array()})}
  let outcome:unknown
  try{outcome={result:await new SherpaTranscriptionPipeline({models:new ModelManager({modelsDir:root}),createAddon:()=>addon}).run({sourceFilePath:'/fixture/source',wavPath:file,durationMs:1000,skipVad:true,autoSkipAllowed:false,speakerCount:1})}}catch(error){if(mode==='throw-error')assert.equal(error,failure);if(mode==='throw-string')assert.equal(error,'foreign rejection');outcome=error instanceof Error?{error:{name:error.name,message:error.message}}:{rejection:error}}
  assert.equal(observedPatched,true);assert.equal(JSON.parse,parse);compare(`repair-${mode}`,outcome,root)
})
const workerCases = ['inline-wins','inline-false-file','relative-file','absolute-file','escape-file','default-file','malformed-file','null-file','scalar-file','unusable-result','nonfinite-result','malformed-progress','malformed-partial','malformed-log','malformed-error','unknown-and-scalars','split-utf8','late-output'] as const
for(const mode of workerCases)test(`worker external-data consumption and result precedence: ${mode}`,{timeout:30000},async(t)=>{
  const root=temporary(t);const source=join(root,'source');writeFileSync(source,'media');const capture:unknown[]=[]
  class RecordingStore extends MemoryTranscriptStore{override commit(input:Parameters<MemoryTranscriptStore['commit']>[0]){capture.push(['commit-input',input.result]);return super.commit({...input,result:good})}}
  const scripts:Record<typeof workerCases[number],string>={
    'inline-wins':`send({type:'result',result:{...good,extra:'inline'},resultPath:'missing',durationMs:1})`,
    'inline-false-file':`fs.writeFileSync(path.join(m.workDir,'chosen.json'),JSON.stringify({...good,extra:'file'}));send({type:'result',result:false,resultPath:'chosen.json',durationMs:1})`,
    'relative-file':`fs.writeFileSync(path.join(m.workDir,'chosen.json'),JSON.stringify({...good,extra:'relative'}));send({type:'result',resultPath:'chosen.json',durationMs:1})`,
    'absolute-file':`fs.writeFileSync(${JSON.stringify(join(root,'absolute.json'))},JSON.stringify({...good,extra:'absolute'}));send({type:'result',resultPath:${JSON.stringify(join(root,'absolute.json'))},durationMs:1})`,
    'escape-file':`fs.writeFileSync(path.join(m.workDir,'..','escape.json'),JSON.stringify({...good,extra:'escape'}));send({type:'result',resultPath:'../escape.json',durationMs:1})`,
    'default-file':`fs.writeFileSync(path.join(m.workDir,'pipeline-result.json'),JSON.stringify({...good,extra:'default'}));send({type:'result',durationMs:1})`,
    'malformed-file':`fs.writeFileSync(path.join(m.workDir,'pipeline-result.json'),'{broken');send({type:'result',durationMs:1})`,
    'null-file':`fs.writeFileSync(path.join(m.workDir,'pipeline-result.json'),'null');send({type:'result',durationMs:1})`,
    'scalar-file':`fs.writeFileSync(path.join(m.workDir,'pipeline-result.json'),'42');send({type:'result',durationMs:1})`,
    'unusable-result':`send({type:'result',result:{resultKind:42,segments:'bad',speakers:null},durationMs:'duration'})`,
    'nonfinite-result':`process.stdout.write('{"type":"result","result":{"resultKind":"transcript","language":null,"modelVersion":"fixture","speakers":[],"segments":[{"speakerKey":null,"startMs":1e999,"endMs":-1e999,"text":"fixture","confidence":1e999}]},"durationMs":1e999}\\n')`,
    'malformed-progress':`process.stdout.write('{"type":"progress","stage":"future-stage","percent":1e999}\\n');send({type:'progress',percent:'not-percent'});send({type:'result',result:good,durationMs:1})`,
    'malformed-partial':`process.stdout.write('{"type":"partial","startMs":1e999,"endMs":-1e999,"text":42,"words":[null]}\\n');send({type:'result',result:good,durationMs:1})`,
    'malformed-log':`send({type:'log',line:{unexpected:true}});send({type:'result',result:good,durationMs:1})`,
    'malformed-error':`send({type:'error',message:{unexpected:true}})`,
    'unknown-and-scalars':`process.stdout.write('null\\nfalse\\n42\\n"string"\\n{"type":"future-kind","payload":42}\\n{broken\\n');send({type:'result',result:good,durationMs:1})`,
    'split-utf8':`const bytes=Buffer.from(JSON.stringify({type:'log',stream:'stdout',line:'é漢字😀'})+'\\n');const index=bytes.indexOf(Buffer.from('é'))+1;process.stdout.write(bytes.subarray(0,index));const timer=setInterval(()=>{if(fs.existsSync(${JSON.stringify(join(root,'utf8-release'))})){clearInterval(timer);process.stdout.write(bytes.subarray(index));send({type:'result',result:good,durationMs:1})}},1)`,
    'late-output':`process.stdout.write([{type:'result',result:good,durationMs:1},{type:'log',stream:'stdout',line:'after-result'},{type:'progress',stage:'recognizing',percent:0.4},{type:'partial',speakerKey:null,startMs:0,endMs:1,text:'late'},{type:'result',result:{...good,extra:'second'},durationMs:2}].map(value=>JSON.stringify(value)+'\\n').join(''))`
  }
  const reads:string[]=[];if(mode==='split-utf8'){const original=childProcess.spawn;t.mock.method(childProcess,'spawn',(...args:Parameters<typeof childProcess.spawn>)=>{const child=original(...args);child.stdout?.on('data',chunk=>{reads.push(String(chunk));if(reads.length===1)writeFileSync(join(root,'utf8-release'),'release')});return child});syncBuiltinESMExports();t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports()})}
  const worker=executable(root,'worker',`const fs=require('node:fs'),path=require('node:path'),good=${JSON.stringify(good)};const send=m=>process.stdout.write(JSON.stringify(m)+'\\n');let b='';process.stdin.on('data',x=>{b+=x;if(!b.includes('\\n'))return;const m=JSON.parse(b.split('\\n')[0]);process.stdin.removeAllListeners('data');${scripts[mode]};setInterval(()=>{},1000)})`)
  let done:(event:ExecutorFinishEvent)=>void=()=>{};const finished=new Promise<ExecutorFinishEvent>(resolve=>done=resolve);const executor=new TranscriptionExecutor({store:new RecordingStore({clock:()=>1000}),workerScript:worker,modelsDir:root,workDir:root,resolveFfmpegPath:()=>'/fixture/ffmpeg',execPath:NODE,forceLayer:'electron',skipProbe:true,backend:'fake',onPartial:event=>capture.push(['partial',event]),onStage:event=>capture.push(['stage',event])})
  const context={taskId:`boundary-${mode}`,attemptId:'attempt',attemptNumber:1,input:buildTranscriptionInput({downloadTaskId:'download',sourceFilePath:source,trigger:'manual'})}
  executor.run(context,{onSpawn:event=>capture.push(['spawn',event]),onProgress:event=>capture.push(['progress',event]),onStd:event=>capture.push(['std',event]),onFinish:event=>{capture.push(['finish',event]);done(event)}})
  await finished;if(mode==='split-utf8'){assert.ok(reads.length>=2);assert.equal(reads[0],'{"type":"log","stream":"stdout","line":"');assert.ok(reads.slice(1).join('').startsWith('é漢字😀'))}capture.push(['partial-state',transcriptionPartials.getByTask(context.taskId)]);compare(`worker-${mode}`,capture,root);transcriptionPartials.clear(context.taskId)
})

const subtitleCases:[string,string][]=[
  ['invalid-json','{broken'],['bom-json','\ufeff{"streams":[]}'],['null-root','null'],['string-root','"text"'],['number-root','42'],['boolean-root','false'],['array-root','[]'],['missing-streams','{}'],['null-streams','{"streams":null}'],['number-streams','{"streams":42}'],['false-streams','{"streams":false}'],['string-streams','{"streams":"value"}'],['object-streams','{"streams":{}}'],['null-stream-item','{"streams":[null]}'],['scalar-stream-items','{"streams":[false,42,"text"]}'],['wrong-language','{"streams":[{"codec_type":"subtitle","codec_name":"subrip","index":0,"tags":{"language":42}}]}'],['nonfinite-index','{"streams":[{"codec_type":"subtitle","codec_name":"subrip","index":1e999,"tags":{"language":"eng"}}]}'],['wrong-index','{"streams":[{"codec_type":"subtitle","codec_name":"subrip","index":"0","tags":{"language":"eng"}}]}']
]
for(const [name,raw] of subtitleCases)test(`external ffprobe subtitle JSON exact recovery/traversal: ${name}`,{timeout:30000},async(t)=>{
  const root=temporary(t);const source=join(root,'source');writeFileSync(source,'media');const calls=join(root,'calls')
  executable(root,'ffprobe',`require('node:fs').appendFileSync(${JSON.stringify(calls)},JSON.stringify(['probe',process.argv.slice(2)])+'\\n');process.stdout.write(${JSON.stringify(raw)})`)
  const ffmpeg=executable(root,'ffmpeg',`require('node:fs').appendFileSync(${JSON.stringify(calls)},JSON.stringify(['extract',process.argv.slice(2)])+'\\n');process.stdout.write('WEBVTT\\n')`)
  let outcome:unknown
  try{outcome={result:await extractEmbeddedCaptionTracks({ffmpegPath:ffmpeg,filePath:source})}}catch(error){assert.ok(error instanceof Error);outcome={error:{name:error.name,message:error.message}}}
  compare(`subtitle-${name}`,{outcome,calls:readFileSync(calls,'utf8').trim().split('\n').map(line=>JSON.parse(line))},root)
})
