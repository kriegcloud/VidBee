import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { MODEL_CATALOG, ModelManager, SherpaTranscriptionPipeline } from '@vidbee/transcription-legacy'
import { NODE, workerArgs } from './fixtures/process-runtime'
const preload=fileURLToPath(new URL('./fixtures/process-addon.cjs',import.meta.url))
function temporary(t:{after:(fn:()=>void)=>void}){const root=mkdtempSync(join(tmpdir(),'vidbee-addon-'));t.after(()=>rmSync(root,{recursive:true,force:true}));for(const spec of MODEL_CATALOG.filter(spec=>spec.tier==='minimal')){const file=join(root,spec.fileName);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,'fixture')}return root}
function compare(name:string,value:unknown,root:string){const normalized=JSON.parse(JSON.stringify(value).split(root).join('<ROOT>'));const file=new URL(`./fixtures/process-addon-${name}.json`,import.meta.url);if(process.env.VIDBEE_RECORD_CHARACTERIZATION==='1')writeFileSync(file,`${JSON.stringify(normalized,null,2)}\n`);assert.deepEqual(normalized,JSON.parse(readFileSync(file,'utf8')))}
for(const benchmark of [false,true])test(`exported worker fake addon probe exact setup, decode-only clock and JSON repair; benchmark=${benchmark}`,{timeout:30000},async(t)=>{
  const root=temporary(t);const traceFile=join(root,'trace');const child=spawn(NODE,['--require',preload,...workerArgs],{env:{...process.env,VIDBEE_TRANSCRIPTION_BACKEND:'sherpa',VIDBEE_ADDON_TRACE:traceFile},stdio:['pipe','pipe','pipe']});t.after(()=>child.kill('SIGKILL'))
  let stdout='';let stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);child.stdin.end(`${JSON.stringify({type:'probe',modelsDir:root,asrTier:'minimal',provider:'cuda',benchmark})}\n`)
  const code=await new Promise(resolve=>child.once('close',resolve));assert.equal(code,0);assert.equal(stderr,'');assert.equal(stdout,'{"type":"probe-ok","provider":"cuda","durationMs":10}\n');compare(`probe-${benchmark}`,readFileSync(traceFile,'utf8').trim().split('\n').map(line=>JSON.parse(line)),root)
})
for(const mode of ['retry','0','-1','NaN','Infinity'] as const)test(`exported worker blocking stdout boundary write ${mode}`,{timeout:30000},async(t)=>{
  const root=temporary(t);const traceFile=join(root,'trace');const child=spawn(NODE,['--require',preload,...workerArgs],{env:{...process.env,VIDBEE_TRANSCRIPTION_BACKEND:'fake',VIDBEE_ADDON_TRACE:traceFile,VIDBEE_WRITE_MODE:mode},stdio:['pipe','pipe','pipe']});t.after(()=>child.kill('SIGKILL'))
  let stdout='';let stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);child.stdin.end('{"type":"probe"}\n');const code=await new Promise(resolve=>child.once('close',resolve))
  assert.equal(stderr,'');assert.equal(stdout,mode==='retry'?'{"type":"probe-ok"}\n':'');assert.equal(code,mode==='retry'?0:1);compare(`write-${mode}`,readFileSync(traceFile,'utf8').trim().split('\n').map(line=>JSON.parse(line)),root)
})
test('pipeline fake-addon seam omits inputFinished and restores JSON.parse after repairing raw controls', {timeout:30000},async(t)=>{
  const root=temporary(t);const wav=join(root,'wave.wav');const header=Buffer.alloc(44);header.write('RIFF');header.write('WAVE',8);header.write('fmt ',12);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(16000,24);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(32000,40);writeFileSync(wav,Buffer.concat([header,Buffer.alloc(32000)]))
  const trace:unknown[]=[];const parse=JSON.parse
  class Recognizer {constructor(config:Record<string,unknown>){trace.push(['recognizer',config])}createStream(){trace.push('createStream');return{acceptWaveform:(input:{sampleRate:number;samples:Float32Array})=>trace.push(['acceptWaveform',input.sampleRate,input.samples.length]),inputFinished:()=>trace.push('inputFinished')}}decode(){trace.push('decode')}getResult(){trace.push(['getResult',JSON.parse===parse]);return JSON.parse('{"text":"Hello\nworld."}')}}
  const addon={OfflineRecognizer:Recognizer,Vad:class{acceptWaveform(){}isEmpty(){return true}front(){return{}}pop(){}flush(){}},OfflineSpeakerDiarization:class{process(){return[]}},readWave:()=>({sampleRate:16000,samples:new Float32Array()})}
  const pipeline=new SherpaTranscriptionPipeline({models:new ModelManager({modelsDir:root}),createAddon:()=>{trace.push('createAddon');return addon}})
  const promise=pipeline.run({sourceFilePath:'/fixture/source',wavPath:wav,durationMs:1000,skipVad:true,autoSkipAllowed:false,speakerCount:1,onProgress:event=>trace.push(['progress',event]),onPartial:event=>trace.push(['partial',event])});trace.push('run-return');queueMicrotask(()=>trace.push('caller-microtask'));const result=await promise;assert.equal(JSON.parse,parse);compare('pipeline',{trace,result},root)
})

test('exported worker blocking stdout stalls on an unread pipe and resumes losslessly when parent drains', {timeout:30000},async(t)=>{
  const root=temporary(t);const traceFile=join(root,'trace');const child=spawn(NODE,['--require',preload,...workerArgs],{env:{...process.env,VIDBEE_TRANSCRIPTION_BACKEND:'fake',VIDBEE_ADDON_TRACE:traceFile,VIDBEE_WRITE_MODE:'backpressure'},stdio:['pipe','pipe','pipe']});t.after(()=>child.kill('SIGKILL'));child.stdin.on('error',()=>{})
  let stderr='';child.stderr.on('data',chunk=>stderr+=chunk);child.stdin.end('{"type":"probe"}\n'.repeat(20000))
  let blocked=false
  for(let i=0;i<1000;i++){
    try{const lines=readFileSync(traceFile,'utf8').trim().split('\n');const last=lines.at(-1);if(last&&JSON.parse(last)[0]==='write-before'){blocked=true;break}}catch{}
    await delay(5)
  }
  assert.equal(blocked,true);assert.equal(child.exitCode,null);assert.equal(child.signalCode,null)
  let stdout='';child.stdout.on('data',chunk=>stdout+=chunk);const code=await new Promise(resolve=>child.once('close',resolve));assert.equal(code,0);assert.equal(stderr,'')
  const events=readFileSync(traceFile,'utf8').trim().split('\n').map(line=>JSON.parse(line));const messages=stdout.trimEnd().split('\n');assert.ok(messages.length>1);assert.equal(stdout,messages.map(()=>'{"type":"probe-ok"}\n').join(''));assert.equal(events.length,messages.length*2)
  for(let i=0;i<messages.length;i++){assert.deepEqual(events[i*2],['write-before',i+1]);assert.deepEqual(events[i*2+1],['write-after',i+1,20])}
})
