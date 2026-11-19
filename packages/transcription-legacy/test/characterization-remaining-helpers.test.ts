import './fixtures/audit-isolation'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { cpus, totalmem } from 'node:os'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import * as T from '@vidbee/transcription-legacy'

it('catalog filtering and prep percentages preserve full defaults, null totals and nonfinite calculations',()=>{
 const groups=[undefined,[],['vad'],['speaker'],['asr'],['punct'],['vad','speaker','asr']] as const
 expect(groups.flatMap(group=>[undefined,[],['minimal'],['quality']].map(tiers=>({group,tiers,result:Reflect.apply(T.catalogFor,undefined,[{groups:group,tiers}])})))).toMatchSnapshot()
 const file={id:'f',present:false,path:'/fixture/model',bytes:0};const results:unknown[]=[]
 for(const ready of [false,true])for(const files of [[],[file],[{...file,present:true},file]])for(const total of [null,0,10,NaN,Infinity])for(const received of [-1,0,5,20,NaN]){const status={ready,files,downloads:[{url:'https://fixture.invalid/model',total,received}]};results.push({status,percent:T.modelFillPercent(status),prep:T.toModelPrepStatus(status)})}
 expect(results).toMatchSnapshot()
},30000)
it('path/config wrappers keep missing model null and old synchronous role evaluation',()=>{
 const dir=mkdtempSync(join(tmpdir(),'transcription-helper-'))
 try{const models=new T.ModelManager({modelsDir:dir,catalog:[]});expect(T.resolveAsrModelPaths(models,'minimal')).toEqual({encoder:null,decoder:null,frontend:null,joiner:null,model:null,tokenizer:null,tokens:null});expect(T.tryRecognizerConfig(models,'minimal')).toBeNull();const issue=new Error('role failed');vi.spyOn(models,'incompleteModelIssue').mockImplementation(()=>{throw issue});expect(()=>T.resolveAsrModelPaths(models,'minimal')).toThrow(issue);expect(T.tryRecognizerConfig(models,'minimal')).toBeNull()}
 finally{vi.restoreAllMocks();rmSync(dir,{recursive:true,force:true})}
 expect(['ffmpeg','/fixture/bin/ffmpeg','/fixture/bin/ffmpeg.exe','/fixture/bin/FFMPEG.EXE','/fixture/bin/other'].map(T.ffprobePathFromFfmpeg)).toMatchSnapshot()
 expect([0,1,14999,15000,15001,30001,NaN].map(endMs=>T.splitTurnForAsr({startMs:0,endMs,extra:'retained'}))).toMatchSnapshot()
 expect([0,1,1000,NaN,Infinity].flatMap(wav=>[-1,0,1000,10000,NaN].map(source=>({wav,source,reusable:T.isReusableExtractedWav(wav,source)})))).toMatchSnapshot()
})
it('host wrappers read fresh environment and resolve selected shared library without recording machine values',()=>{
 const expected=dirname(createRequire(import.meta.url).resolve(`sherpa-onnx-${process.platform==='win32'?'win':process.platform}-${process.arch}/package.json`));const lib=T.resolveSherpaLibraryDir();expect(lib).toBe(expected)
 const key='VIDBEE_CHARACTERIZATION_ENV';const old=process.env[key]
 try{process.env[key]='first';const first=T.sherpaWorkerEnv({ELECTRON_RUN_AS_NODE:'extra',LD_LIBRARY_PATH:'fixture-old'});process.env[key]='second';const second=T.sherpaWorkerEnv({ELECTRON_RUN_AS_NODE:'extra'},{electronAsNode:false});expect(first[key]).toBe('first');expect(second[key]).toBe('second');expect(first.ELECTRON_RUN_AS_NODE).toBe('1');expect(second.ELECTRON_RUN_AS_NODE).toBe('extra');if(process.platform==='linux')expect(first.LD_LIBRARY_PATH).toBe(`${expected}:fixture-old`)}
 finally{if(old===undefined)delete process.env[key];else process.env[key]=old}
 const options={platform:'darwin',arch:'arm64',cpuModel:'Apple M4',gpu:'apple' as const,gpuName:'Apple M4'}
 const ramBytes=totalmem();const cpuCount=Math.max(1,cpus().length)
 expect(T.readMachineProfile(options)).toEqual({arch:'arm64',class:T.classifyMachine(ramBytes,cpuCount),cpuCount,gpu:'apple',gpuName:'Apple M4',os:'macos',ramBytes})
 expect([options,{platform:'darwin',arch:'x64',cpuModel:'Apple M4'},{platform:'linux',arch:'arm64',cpuModel:'Apple M4'}].map(T.isAppleSilicon)).toEqual([true,true,false])
 expect([{vendorId:0x10de},{vendorId:0x1002},{vendorId:0x8086},{vendorId:0x106b},{deviceString:'NVIDIA RTX'},{vendorString:'unknown'}].map(T.gpuKindFromHint)).toEqual(['nvidia','amd','intel','apple','nvidia','unknown'])
 expect(T.transcriptionError('unknown','fixture')).toEqual(T.classifyTranscriptionFailure('fixture'))
 expect(['source has no audio stream','DOES NOT CONTAIN ANY STREAM','other'].map(T.isNoAudioStreamError)).toEqual([true,true,false])
 expect(T.SHERPA_EXECUTION_PROVIDERS.map(provider=>({provider,fallback:T.isSherpaProviderFallbackLog(provider,'CUDA failed; falling back to cpu')}))).toMatchSnapshot()
})
it('fake pipeline public construction preserves supplied identity, synchronous progress, delay and seed branches',async()=>{
 const trace:unknown[]=[];const supplied:T.PipelineResult={resultKind:'transcript',language:'en',asrTier:'minimal',modelVersion:'fixture',speakers:[],segments:[]}
 const input={sourceFilePath:'/fixture/source',wavPath:'/fixture/wave',durationMs:1000,skipVad:false,autoSkipAllowed:true,onProgress:(event:unknown)=>trace.push(['progress',event]),onPartial:(segment:unknown)=>trace.push(['partial',segment])}
 const pending=new T.FakeTranscriptionPipeline({result:supplied}).run(input);trace.push('immediate');queueMicrotask(()=>trace.push('marker'));expect(await pending).toBe(supplied);expect(trace).toMatchSnapshot()
 expect(await new T.FakeTranscriptionPipeline().run(input)).toMatchSnapshot('silence')
 expect(await new T.FakeTranscriptionPipeline({speech:true}).run({...input,speakerCount:1})).toMatchSnapshot('speech')
 const controller=new AbortController();controller.abort();await expect(new T.FakeTranscriptionPipeline().run({...input,signal:controller.signal})).rejects.toThrow('cancelled')
 vi.useFakeTimers()
 try{const controller=new AbortController();const pending=new T.FakeTranscriptionPipeline({delayMs:100}).run({...input,signal:controller.signal});const failure=expect(pending).rejects.toThrow('cancelled');controller.abort();expect(vi.getTimerCount()).toBe(1);await vi.advanceTimersByTimeAsync(100);await failure}
 finally{vi.useRealTimers()}
 const seed={language:'en',asrTier:null,modelVersion:'seed',sourceKind:'captions' as const,speakers:[],segments:[{speakerKey:null,startMs:0,endMs:1000,text:'hello',words:[],confidence:null}]}
 expect(await new T.FakeTranscriptionPipeline().run({...input,existingTranscript:seed,speakerCount:1})).toMatchSnapshot('seed')
},30000)
