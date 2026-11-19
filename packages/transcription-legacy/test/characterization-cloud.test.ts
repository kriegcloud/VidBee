import './fixtures/audit-isolation'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { manifestWorkKey, sourceFingerprint } from '@vidbee/transcription-legacy'
import { cloudClipWav, runCloudTranscription } from '@vidbee/transcription-legacy/cloud-runner'
import type { CloudTranscriptionRunInput } from '@vidbee/transcription-legacy/cloud-runner'

const roots:string[]=[]
afterEach(()=>{for(const dir of roots.splice(0))rmSync(dir,{recursive:true,force:true})})
function fixture(samples=1600, initial?:string){
 const root=mkdtempSync(join(tmpdir(),'transcription-cloud-'));roots.push(root)
 const source=join(root,'source.wav');writeFileSync(source,'source')
 const ffmpeg=join(root,'ffmpeg');writeFileSync(ffmpeg,'#!/bin/sh\nexit 91\n',{mode:0o755})
 writeFileSync(join(root,'ffprobe'),'#!/bin/sh\nprintf "1\\n"\n',{mode:0o755})
 const directory=join(root,'vidbee-transcript',manifestWorkKey('task',sourceFingerprint(source),'cloud-v1:model'))
 mkdirSync(directory,{recursive:true});writeFileSync(join(directory,'audio-16k-mono.wav'),cloudClipWav(new Uint8Array(samples*2)))
 if(initial!==undefined)writeFileSync(join(directory,'cloud.json'),initial)
 const trace:unknown[]=[]
 const input:CloudTranscriptionRunInput={accountId:'account',taskId:'task',sourceFilePath:source,modelId:'model',ffmpegPath:ffmpeg,workRoot:root,signal:new AbortController().signal,onProgress:(...args)=>trace.push(['progress',...args]),onPartial:segment=>trace.push(['partial',segment]),transcribe:async()=>({text:'hello',language:'en',requestId:'fixed',modelId:'model',audioSeconds:0.1,credits:1})}
 return {root,directory,input,trace,path:join(directory,'cloud.json')}
}
describe('pre-port cloud runner paid-result persistence',()=>{
 it('pins canonical complete WAV bytes including empty and odd PCM',()=>{
  expect([[],[1],[0,127,128,255]].map(bytes=>Array.from(cloudClipWav(Uint8Array.from(bytes))))).toMatchSnapshot()
 })
 it('persists request ID before callback, result before partial, returns cleanup after commit',async()=>{
  const f=fixture();let request='';const trace=f.trace
  f.input.transcribe=async(bytes,id,signal)=>{request=id;const saved=JSON.parse(readFileSync(f.path,'utf8'));expect(saved).toEqual({accountId:'account',clips:[{start:0,end:1600,requestId:id}]});trace.push(['upload',{bytes:bytes.length,idSaved:saved.clips[0].requestId===id,sameSignal:signal===f.input.signal,files:readdirSync(f.directory).sort()}]);return {text:'hello',language:'en',requestId:'fixed',modelId:'model',audioSeconds:0.1,credits:1}}
  const run=await runCloudTranscription(f.input)
  expect(request).toMatch(/^[a-f0-9-]{36}$/);expect({result:run.result,durationMs:run.durationMs,trace}).toMatchSnapshot()
  expect(JSON.parse(readFileSync(f.path,'utf8'))).toEqual({accountId:'account',clips:[{start:0,end:1600,requestId:request,result:{text:'hello',language:'en',requestId:'fixed',modelId:'model',audioSeconds:0.1,credits:1}}]})
  expect(existsSync(f.directory)).toBe(true);await run.cleanup();await run.cleanup();expect(existsSync(f.directory)).toBe(false)
 },30000)
 it('replays saved paid results without upload and preserves unknown persisted keys',async()=>{
  const saved={accountId:'account',extra:{root:true},clips:[{start:0,end:1600,requestId:'fixed',extra:{clip:true},result:{text:'saved',language:'xx',unknown:17}}]}
  const f=fixture(1600,JSON.stringify(saved));f.input.transcribe=async()=>{throw new Error('already paid')}
  const run=await runCloudTranscription(f.input);expect({result:run.result,durationMs:run.durationMs,trace:f.trace}).toMatchSnapshot();expect(JSON.parse(readFileSync(f.path,'utf8'))).toEqual(saved)
 },30000)
 it('ambiguous failures keep identity; failed reservation rotates before retry only for first 409',async()=>{
  for(const status of [409,500]){
   const f=fixture();const error=Object.assign(new Error('reservation'),{code:'AI_TRANSCRIPTION_FAILED',status});const ids:string[]=[]
   f.input.transcribe=async(_bytes,id)=>{ids.push(id);if(ids.length===1)throw error;return {text:'retry',language:null,requestId:'fixed',modelId:'model',audioSeconds:0.1,credits:1}}
   if(status===409){const run=await runCloudTranscription(f.input);expect(run.result.segments[0]?.text).toBe('retry');expect(ids.length).toBe(2);expect(ids[0]).not.toBe(ids[1]);expect(JSON.parse(readFileSync(f.path,'utf8')).clips[0].requestId).toBe(ids[1])}
   else{await expect(runCloudTranscription(f.input)).rejects.toBe(error);const saved=JSON.parse(readFileSync(f.path,'utf8'));expect(saved.clips[0].requestId).toMatch(/^[a-f0-9-]{36}$/);expect(saved.clips[0].requestId).not.toBe(ids[0]);expect(saved.clips[0].result).toBeUndefined()}
  }
  const capped=fixture();const cappedError=Object.assign(new Error('reservation cap'),{code:'AI_TRANSCRIPTION_FAILED',status:409});const cappedIds:string[]=[];capped.input.transcribe=async(_bytes,id)=>{cappedIds.push(id);expect(JSON.parse(readFileSync(capped.path,'utf8')).clips[0].requestId).toBe(id);throw cappedError};await expect(runCloudTranscription(capped.input)).rejects.toBe(cappedError);expect(cappedIds).toHaveLength(2);expect(cappedIds[0]).not.toBe(cappedIds[1]);const rotated=JSON.parse(readFileSync(capped.path,'utf8')).clips[0].requestId;expect(rotated).toMatch(/^[a-f0-9-]{36}$/);expect(cappedIds).not.toContain(rotated)
  const f=fixture();const error=Object.assign(new Error('ambiguous'),{status:502});let id='';f.input.transcribe=async(_bytes,request)=>{id=request;throw error};await expect(runCloudTranscription(f.input)).rejects.toBe(error);expect(JSON.parse(readFileSync(f.path,'utf8')).clips[0]).toEqual({start:0,end:1600,requestId:id})
 },30000)
 it('pins account mismatch, checkpoint mismatch and syntax failures as rejected errors',async()=>{
  const cases=[['{"accountId":"other","clips":[]}', 'Sign in with the Cloud account that started this transcription'],['{"accountId":"account","clips":[{"start":1,"end":1600,"requestId":"fixed"}]}','Cloud transcription checkpoint does not match the audio']]
  for(const [json,message] of cases){const f=fixture(1600,json);await expect(runCloudTranscription(f.input)).rejects.toThrow(message)}
  const f=fixture(1600,'{');await expect(runCloudTranscription(f.input)).rejects.toBeInstanceOf(SyntaxError)
 },30000)
 it('pins section 9 old malformed saved results and consumed shape failures',async()=>{
  const results:unknown[]=[]
  for(const value of [true,7,'saved',{text:42,language:17}]){
   const original=JSON.stringify({accountId:'account',clips:[{start:0,end:1600,requestId:'fixed',result:value}]});const f=fixture(1600,original);let calls=0;f.input.transcribe=async()=>{calls++;throw new Error('must not upload a malformed saved result')}
  /* Before the port: exact recorded combined expectation retained verbatim.
exports[`pre-port cloud runner paid-result persistence > pins section 9 old malformed saved results and consumed shape failures > section 9 old values 1`] = `
[
  {
    "calls": 0,
    "result": {
      "asrTier": "cloud:model",
      "language": undefined,
      "modelVersion": "cloud:model",
      "resultKind": "no-speech",
      "segments": [],
      "sourceKind": "asr",
      "speakers": [],
    },
    "trace": [
      [
        "progress",
        "preparing-audio",
        null,
      ],
      [
        "progress",
        "recognizing",
        0,
      ],
      [
        "progress",
        "committing",
        1,
      ],
    ],
    "value": true,
  },
  {
    "calls": 0,
    "result": {
      "asrTier": "cloud:model",
      "language": undefined,
      "modelVersion": "cloud:model",
      "resultKind": "no-speech",
      "segments": [],
      "sourceKind": "asr",
      "speakers": [],
    },
    "trace": [
      [
        "progress",
        "preparing-audio",
        null,
      ],
      [
        "progress",
        "recognizing",
        0,
      ],
      [
        "progress",
        "committing",
        1,
      ],
    ],
    "value": 7,
  },
  {
    "calls": 0,
    "result": {
      "asrTier": "cloud:model",
      "language": undefined,
      "modelVersion": "cloud:model",
      "resultKind": "no-speech",
      "segments": [],
      "sourceKind": "asr",
      "speakers": [],
    },
    "trace": [
      [
        "progress",
        "preparing-audio",
        null,
      ],
      [
        "progress",
        "recognizing",
        0,
      ],
      [
        "progress",
        "committing",
        1,
      ],
    ],
    "value": "saved",
  },
  {
    "calls": 0,
    "result": {
      "asrTier": "cloud:model",
      "language": 17,
      "modelVersion": "cloud:model",
      "resultKind": "transcript",
      "segments": [
        {
          "confidence": null,
          "endMs": 100,
          "speakerKey": null,
          "startMs": 0,
          "text": 42,
          "words": [],
        },
      ],
      "sourceKind": "asr",
      "speakers": [],
    },
    "trace": [
      [
        "progress",
        "preparing-audio",
        null,
      ],
      [
        "progress",
        "recognizing",
        0,
      ],
      [
        "partial",
        {
          "confidence": null,
          "endMs": 100,
          "speakerKey": null,
          "startMs": 0,
          "text": 42,
          "words": [],
        },
      ],
      [
        "progress",
        "committing",
        1,
      ],
    ],
    "value": {
      "language": 17,
      "text": 42,
    },
  },
  {
    "calls": 0,
    "result": {
      "asrTier": "cloud:model",
      "language": null,
      "modelVersion": "cloud:model",
      "resultKind": "no-speech",
      "segments": [],
      "sourceKind": "asr",
      "speakers": [],
    },
    "trace": [
      [
        "progress",
        "preparing-audio",
        null,
      ],
      [
        "progress",
        "recognizing",
        0,
      ],
      [
        "progress",
        "committing",
        1,
      ],
    ],
    "value": {
      "language": null,
      "text": "",
    },
  },
  {
    "calls": 1,
    "result": {
      "asrTier": "cloud:model",
      "language": "en",
      "modelVersion": "cloud:model",
      "resultKind": "transcript",
      "segments": [
        {
          "confidence": null,
          "endMs": 100,
          "speakerKey": null,
          "startMs": 0,
          "text": "fresh",
          "words": [],
        },
      ],
      "sourceKind": "asr",
      "speakers": [],
    },
    "trace": [
      [
        "progress",
        "preparing-audio",
        null,
      ],
      [
        "progress",
        "recognizing",
        0,
      ],
      [
        "partial",
        {
          "confidence": null,
          "endMs": 100,
          "speakerKey": null,
          "startMs": 0,
          "text": "fresh",
          "words": [],
        },
      ],
      [
        "progress",
        "committing",
        1,
      ],
    ],
    "value": null,
  },
]
`;


  */
   // Before the port: these truthy saved values produced no-speech or a segment with non-string text (design section 9, cloud.clipResult).
   await expect(runCloudTranscription(f.input)).rejects.toThrow('Invalid transcription data at cloud.clipResult.')
   expect(calls).toBe(0);expect(readFileSync(f.path,'utf8')).toBe(original)
  }
  for(const value of [{text:'',language:null},null]){
   const f=fixture(1600,JSON.stringify({accountId:'account',clips:[{start:0,end:1600,requestId:'fixed',result:value}]}));let calls=0;f.input.transcribe=async()=>{calls++;return {text:'fresh',language:'en',requestId:'fixed',modelId:'model',audioSeconds:0.1,credits:1}}
   const run=await runCloudTranscription(f.input);results.push({value,calls,result:run.result,trace:f.trace})
  }
  // Before the port: this combined snapshot also accepted four malformed saved-result cases; its unchanged valid entries remain here (design section 9, cloud.clipResult).
  expect(results).toMatchSnapshot('section 9 old values')
  for(const json of ['null','{"accountId":"account","clips":null}','{"accountId":"account","clips":7}']){const f=fixture(1600,json);await expect(runCloudTranscription(f.input)).rejects.toThrow()}
 },30000)
 it('quiet-boundary equal energy picks last candidate and serial clip percentages use total samples',async()=>{
  const f=fixture(320000);const clips:unknown[]=[];f.input.transcribe=async(bytes,id)=>{clips.push({bytes:bytes.length,saved:JSON.parse(readFileSync(f.path,'utf8')).clips.map((clip:{start:number;end:number})=>({start:clip.start,end:clip.end})),validId:/^[a-f0-9-]{36}$/.test(id)});return {text:'',language:null,requestId:'fixed',modelId:'model',audioSeconds:0,credits:0}}
  const run=await runCloudTranscription(f.input);expect({clips,result:run.result,durationMs:run.durationMs,trace:f.trace}).toMatchSnapshot()
 },30000)
 it('pre-abort rejects with original reason before filesystem work and hook throws keep identity',async()=>{
  const f=fixture();const error=new Error('stop');const controller=new AbortController();controller.abort(error);f.input.signal=controller.signal;const pending=runCloudTranscription(f.input);expect(pending).toBeInstanceOf(Promise);await expect(pending).rejects.toBe(error);expect(existsSync(f.path)).toBe(false)
  const other=fixture();other.input.onProgress=()=>{throw error};await expect(runCloudTranscription(other.input)).rejects.toBe(error);expect(JSON.parse(readFileSync(other.path,'utf8'))).toEqual({accountId:'account',clips:[]})
 },30000)
})

it('cloud PCM parser keeps its separate four application errors and first-data-chunk rules',async()=>{
 const cases:Array<{name:string;mutate:(bytes:Buffer)=>Buffer;message:string}>=[
  {name:'non RIFF',mutate:bytes=>{bytes.write('NOPE');return bytes},message:'ffmpeg did not produce PCM WAV audio'},
  {name:'truncated chunk',mutate:bytes=>{bytes.writeUInt32LE(900000,40);return bytes},message:'ffmpeg produced truncated WAV audio'},
  {name:'wrong sample rate',mutate:bytes=>{bytes.writeUInt32LE(8000,24);return bytes},message:'ffmpeg produced unsupported PCM audio'},
  {name:'stereo',mutate:bytes=>{bytes.writeUInt16LE(2,22);return bytes},message:'ffmpeg produced unsupported PCM audio'},
  {name:'float format',mutate:bytes=>{bytes.writeUInt16LE(3,20);return bytes},message:'ffmpeg produced unsupported PCM audio'},
  {name:'odd payload',mutate:bytes=>{bytes.writeUInt32LE(3,40);return bytes},message:'ffmpeg produced unsupported PCM audio'},
  {name:'empty payload',mutate:bytes=>{bytes.writeUInt32LE(0,40);return bytes},message:'ffmpeg produced unsupported PCM audio'},
  {name:'missing data',mutate:bytes=>{bytes.write('JUNK',36);return bytes},message:'ffmpeg audio payload is missing'},
  {name:'data before fmt',mutate:bytes=>{bytes.write('data',12);return bytes},message:'ffmpeg produced unsupported PCM audio'}
 ]
 const results:unknown[]=[]
 for(const item of cases){const f=fixture();writeFileSync(join(f.directory,'audio-16k-mono.wav'),item.mutate(Buffer.from(cloudClipWav(new Uint8Array(3200)))));let error:unknown;try{await runCloudTranscription(f.input)}catch(caught){error=caught}expect(error).toBeInstanceOf(Error);expect(error).toMatchObject({name:'Error',message:item.message});results.push({case:item.name,trace:f.trace,saved:JSON.parse(readFileSync(f.path,'utf8')),files:readdirSync(f.directory).sort()})}
 expect(results).toMatchSnapshot()
},30000)

it('cloud partial-hook failure is after paid result persistence and replay can finish without upload',async()=>{
 const f=fixture();const error=new Error('partial hook');f.input.onPartial=()=>{throw error}
 await expect(runCloudTranscription(f.input)).rejects.toBe(error)
 const saved=JSON.parse(readFileSync(f.path,'utf8'));expect(saved.clips[0].result.text).toBe('hello')
 f.input.onPartial=segment=>f.trace.push(['replayed partial',segment]);f.input.transcribe=async()=>{throw new Error('paid twice')}
 const replay=await runCloudTranscription(f.input);expect(replay.result.segments[0]?.text).toBe('hello');expect(existsSync(f.directory)).toBe(true)
},30000)

it('cloud detects a changed short read after a paid first clip without discarding its saved result',async()=>{
 const f=fixture(320000);let calls=0
 f.input.transcribe=async()=>{calls++;writeFileSync(join(f.directory,'audio-16k-mono.wav'),new Uint8Array(44));return {requestId:'fixed',modelId:'model',text:'paid',language:'en',audioSeconds:19.95,credits:1}}
 await expect(runCloudTranscription(f.input)).rejects.toThrow('Extracted audio changed during Cloud transcription')
 expect(calls).toBe(1);const saved=JSON.parse(readFileSync(f.path,'utf8'));expect(saved.clips.length).toBe(1);expect(saved.clips[0].result.text).toBe('paid');expect(saved.clips[0].end).toBe(319200)
},30000)

it('cloud fixed temporary collision preserves old checkpoint and callback rejection identity rules',async()=>{
 const f=fixture();mkdirSync(`${f.path}.tmp`)
 await expect(runCloudTranscription(f.input)).rejects.toMatchObject({code:'EISDIR'});expect(existsSync(f.path)).toBe(false);expect(existsSync(`${f.path}.tmp`)).toBe(true)
 for(const thrown of [new Error('callback'), 'callback', 7, {code:'OTHER',status:503,retryAfterMs:71}]){const f=fixture();f.input.transcribe=async()=>{throw thrown};await expect(runCloudTranscription(f.input)).rejects.toBe(thrown);expect(JSON.parse(readFileSync(f.path,'utf8')).clips[0].result).toBeUndefined()}
 const nil=fixture();nil.input.transcribe=async()=>{throw null};await expect(runCloudTranscription(nil.input)).rejects.toBeInstanceOf(TypeError)
},30000)

it('review: fresh paid callback values are saved before consumption and replay ignores unused fields',async()=>{
 const subject=process.env.CLOUD_REVIEW_ORACLE ? (await import(process.env.CLOUD_REVIEW_ORACLE)).runCloudTranscription : runCloudTranscription
 for(const value of [
  {text:'paid',requestId:'r',modelId:'m',credits:1},
  {text:'paid',language:'en',audioSeconds:null},
  {text:'paid',language:null,audioSeconds:NaN},
  {text:'',language:null},
  {text:false,language:null},
  {text:0,language:null},
 ]){
  const f=fixture();let calls=0
  f.input.transcribe=async()=>{calls++;return JSON.parse(JSON.stringify(value))}
  const output=await subject(f.input)
  expect(output.result.segments.map((s:{text:string})=>s.text)).toEqual(value.text ? [value.text] : [])
  expect(output.result.language).toBe('language' in value?value.language:undefined)
  expect(JSON.parse(readFileSync(f.path,'utf8')).clips[0].result).toEqual(JSON.parse(JSON.stringify(value)))
  if(typeof value.text==='string'){
   const replay=await subject(f.input)
   expect(replay.result).toEqual(output.result);expect(calls).toBe(1)
  }
 }
},30000)
