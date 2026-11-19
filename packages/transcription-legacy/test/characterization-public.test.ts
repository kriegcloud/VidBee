import { readFileSync } from 'node:fs'
import * as T from '@vidbee/transcription-legacy'
import * as Asr from '@vidbee/transcription-legacy/asr'
import * as Concurrency from '@vidbee/transcription-legacy/concurrency'
import * as Cloud from '@vidbee/transcription-legacy/cloud'
import * as CloudRunner from '@vidbee/transcription-legacy/cloud-runner'
import * as Mirrors from '@vidbee/transcription-legacy/download-mirrors'
import { describe, expect, it } from 'vitest'

const atoms:unknown[]=[undefined,null,false,true,0,7,-1,NaN,Infinity,-Infinity,'','en',' zh-Hant ','minimal','quality','future']
const observe=(fn:Function,args:unknown[])=>{try{return {returned:Reflect.apply(fn,undefined,args)}}catch{return {engine:true,failed:true}}}
const paths:T.AsrModelPaths={encoder:'/fixture/encoder',decoder:'/fixture/decoder',frontend:'/fixture/frontend',joiner:'/fixture/joiner',model:'/fixture/model',tokenizer:'/fixture/tokenizer',tokens:'/fixture/tokens'}
const families=['whisper','qwen3','fire-red-asr','sense-voice','parakeet'] as const
describe('pre-port public exports and pure oracle',()=>{
 it('freezes all importable entry value names and shared identities',()=>{
  expect({root:Object.keys(T).sort(),asr:Object.keys(Asr).sort(),concurrency:Object.keys(Concurrency).sort(),cloud:Object.keys(Cloud).sort(),cloudRunner:Object.keys(CloudRunner).sort(),mirrors:Object.keys(Mirrors).sort()}).toMatchSnapshot()
  for(const name of Object.keys(Asr).filter(name=>name in T)){expect(Reflect.get(T,name)).toBe(Reflect.get(Asr,name))}
  for(const name of Object.keys(Concurrency).filter(name=>name!=='canAdmitTranscription'))expect(Reflect.get(T,name)).toBe(Reflect.get(Concurrency,name))
  expect(T.isHumanCaptionTrack).toBe(T.isImportableCaptionTrack)
 })
 it('pins complete catalogs, tier aliases, language/count/provider and scalar coercions',()=>{
  expect({tiers:T.ASR_TIERS,ids:T.ASR_TIER_IDS,families:T.ASR_FAMILY_ORDER,catalog:T.MODEL_CATALOG,version:T.modelVersion,whisper:[...T.WHISPER_LANGUAGE_CODES],sense:[...T.SENSE_VOICE_LANGUAGE_CODES],qwen:T.QWEN3_LANGUAGE_NAMES,speakers:T.SPEAKER_COUNT_CHOICES,cloud:Cloud}).toMatchSnapshot()
  const fns={parseAsrTier:T.parseAsrTier,isAsrTierId:T.isAsrTierId,parseSpeakerCount:T.parseSpeakerCount,isSpeakerCount:T.isSpeakerCount,sherpaNumClusters:T.sherpaNumClusters,clampMaxConcurrentTranscriptions:T.clampMaxConcurrentTranscriptions,parseTranscriptionProvider:Cloud.parseTranscriptionProvider,embeddingIdForLanguage:T.embeddingIdForLanguage,isWeakGpu:T.isWeakGpu,languageGroupFor:T.languageGroupFor,osKindFor:T.osKindFor,prettyGpuName:T.prettyGpuName,collectGpuDevices:T.collectGpuDevices}
  expect(Object.entries(fns).map(([name,fn])=>({name,cases:atoms.map(value=>({value,...observe(fn,[value])}))}))).toMatchSnapshot()
  expect(T.ASR_TIER_IDS.map(tier=>({tier,info:T.asrTierInfo(tier),higher:T.higherAsrTiers(tier),upgrade:T.upgradeAsrTiers(tier)}))).toMatchSnapshot()
  expect(()=>Reflect.apply(T.asrTierInfo,undefined,['future'])).toThrow('unknown asr tier: future')
 },30000)
 it('pins all five recognizer families, defaults/overrides and each missing role',()=>{
  const values:unknown[]=[]
  for(const family of families){
   values.push({family,default:T.buildOfflineRecognizerConfig(family,paths),override:T.buildOfflineRecognizerConfig(family,paths,-3,'zh','cuda',7),supports:T.familySupportsAsrLanguage(family),language:atoms.map(language=>observe(T.asrLanguageForFamily,[family,language]))})
   for(const role of Object.keys(paths)){
    const partial={...paths,[role]:null}
    try{values.push({family,role,result:T.buildOfflineRecognizerConfig(family,partial)})}catch(error){expect(error).toBeInstanceOf(Error);values.push({family,role,error:error instanceof Error?{name:error.name,message:error.message}:error})}
   }
  }
  expect(values).toMatchSnapshot();expect(()=>Reflect.apply(T.buildOfflineRecognizerConfig,undefined,['future',paths])).toThrow('unknown asr family: future')
  const calls:unknown[]=[];for(const family of families)T.applyAsrStreamLanguage({setOption:(...args)=>calls.push(args)},family,'zh');expect(calls).toEqual([])
 })
 it('pins per-field options normalization and complete task construction',()=>{
  const seed={downloadTaskId:'download',sourceFilePath:'/fixture/source.mp4',trigger:'manual',skipVad:true,asrTier:'quality',language:' zh-Hant ',speakerCount:2,rediarize:true,provider:'cloud',cloudModelId:'model'}
  const results:unknown[]=[]
  for(const key of Object.keys(seed))for(const value of atoms){const options={...seed,[key]:value};results.push({key,value,read:observe(T.readTranscriptionOptions,[{url:'file:///fixture/source.mp4',kind:'transcription',options}]),build:observe(T.buildTranscriptionInput,[{...options,title:'title',creation:{origin:'extension',requestId:'fixed'}}])})}
  expect(results).toMatchSnapshot()
  expect(atoms.map(options=>({options,...observe(T.readTranscriptionOptions,[{url:'file:///fixture/source.mp4',options}])}))).toMatchSnapshot('wrong options roots')
 },30000)
 it('pins complete classifier payload and branch precedence, retry cap/defaults and non-Error values',()=>{
  const messages=['ENOSPC permission denied ffmpeg not found','EACCES ffmpeg not found','ffprobe ENOENT','source has no audio stream','does not contain any stream','ffmpeg conversion failed','source file missing: /fixture/media','ECONNRESET','sherpa-onnx unavailable','model missing: whisper','unclassified']
  const errors:unknown[]=[...atoms,...messages.map(message=>new Error(message))]
  for(const delay of atoms)errors.push(Object.assign(new Error('ENOSPC'),{status:429,retryAfterMs:delay}))
  errors.push(Object.assign(new Error('ENOSPC'),{code:'AI_TRANSCRIPTION_FAILED'}),Object.assign(new Error('permission denied'),{code:'AI_REQUEST_ALREADY_EXISTS'}))
  expect(errors.map(error=>({input:error instanceof Error?{...error,message:error.message}:error,result:T.classifyTranscriptionFailure(error)}))).toMatchSnapshot()
 })
 it('pins recommendation/GPU payloads across machine thresholds and host-explicit profiles',()=>{
  const profiles:unknown[]=[]
  for(const ramGB of [0,7.49,7.5,8,15.5,16,32,NaN,Infinity])for(const cpuCount of [0,4,5])for(const language of ['zh','ja','ko','en','fr'])for(const gpu of ['unknown','intel','nvidia','amd','apple'] as const){const input={ramBytes:ramGB*1024**3,cpuCount,language,gpu,os:'linux' as const,arch:'x64'};profiles.push({input,class:T.classifyMachine(input.ramBytes,cpuCount),result:T.recommendAsrModels(input)})}
  expect(profiles).toMatchSnapshot()
  const devices=[{vendorId:0x10de,deviceString:'NVIDIA RTX fixture',active:false},{vendorString:'Intel',deviceString:'Intel Iris',active:true},{vendorString:'Apple',deviceString:'ANGLE (Apple, Apple M4 Max, Metal)'}]
  expect({devices:T.collectGpuDevices({gpuDevice:[null,...devices],auxAttributes:{glRenderer:'Metal Renderer: Apple M4',glVendor:'Apple'}}),kind:T.classifyGpuDevices(devices),name:T.gpuNameFromDevices(devices),profile:T.resolveGpuProfile({platform:'darwin',arch:'arm64',cpuModel:'Apple M4',devices})}).toMatchSnapshot()
 },30000)
 it('provider candidate and result oracle includes exact 0.95 threshold, falsy/non-finite durations and thrown probe failures',async()=>{
  const candidates:unknown[]=[];for(const platform of ['linux','darwin','win32','freebsd'] as const)for(const arch of ['x64','arm64','ia32'])for(const gpuKinds of [[],['unknown'],['intel'],['nvidia']] as const)candidates.push({platform,arch,gpuKinds,result:T.sherpaProviderCandidates({platform,arch,gpuKinds})})
  expect(candidates).toMatchSnapshot()
  const results:unknown[]=[]
  for(const accelerator of [0,94,95,96,null,NaN,Infinity])for(const cpu of [0,100,null]){const calls:string[]=[];const result=await T.selectSherpaProvider({platform:'linux',arch:'x64',gpuKinds:['nvidia'],probe:async provider=>{calls.push(provider);return {provider,ok:true,durationMs:provider==='cpu'?cpu:accelerator,error:null}}});results.push({accelerator,cpu,calls,result})}
  for(const error of [new Error('probe model unavailable'),'bad']){const calls:string[]=[];results.push({error:String(error),result:await T.selectSherpaProvider({platform:'win32',arch:'x64',probe:async provider=>{calls.push(provider);throw error}}),calls})}
  expect(results).toMatchSnapshot()
 },30000)
 it('concurrency setters start in order without awaiting and synchronous throws stop following calls',()=>{
  const trace:unknown[]=[]
  const result=T.applyTranscriptionConcurrency({maxConcurrentDownloads:'3',maxConcurrentTranscriptions:4,queue:{setMaxConcurrency:n=>{trace.push(['global',n]);return new Promise(()=>{})},setMaxPerGroup:(...args)=>{trace.push(['group',...args]);return new Promise(()=>{})},setMaxConcurrentDownloads:n=>{trace.push(['downloads',n])}}})
  expect({trace,result}).toMatchSnapshot()
  const error=new Error('queue');expect(()=>T.applyTranscriptionConcurrency({maxConcurrentDownloads:0,maxConcurrentTranscriptions:NaN,queue:{setMaxConcurrency:()=>{throw error},setMaxPerGroup:()=>{throw new Error('not reached')},setMaxConcurrentDownloads:()=>{throw new Error('not reached')}}})).toThrow(error)
 })
})

it('outside-type engine failures stay failures; frozen Node error text is evidence only',async()=>{
 const cases:Array<{name:string;args:unknown[];engine:boolean}>=JSON.parse(readFileSync(new URL('./fixtures/engine-errors.json',import.meta.url),'utf8'))
 for(const entry of cases){expect(entry.engine).toBe(true);expect(()=>Reflect.apply(Reflect.get(T,entry.name),undefined,entry.args)).toThrow()}
})
