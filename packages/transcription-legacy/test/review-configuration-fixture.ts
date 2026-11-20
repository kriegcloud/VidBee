import os from 'node:os'
import {syncBuiltinESMExports} from 'node:module'
import type * as Recommend from '../src/asr-recommend'
import type * as Recognizer from '../src/asr-recognizer'
import type * as Concurrency from '../src/concurrency'
export function observeMachine(api:Pick<typeof Recommend,'readMachineProfile'|'resolveGpuProfile'|'isAppleSilicon'>){
 const trace:unknown[]=[];const originalCpus=os.cpus,originalMemory=os.totalmem;let call=0
 Object.defineProperty(os,'cpus',{configurable:true,writable:true,value:()=>{trace.push(['cpus',++call]);return Array.from({length:3},()=>({model:'Apple M4 fixture'}))}})
 Object.defineProperty(os,'totalmem',{configurable:true,writable:true,value:()=>{trace.push('totalmem');return 8*1024**3}});syncBuiltinESMExports()
 try{
  for(const options of [{platform:'darwin',arch:'arm64'},{platform:'darwin',arch:'x64',cpuModel:'Apple M3 override'},{platform:'linux',arch:'x64',devices:[{vendorId:0x10de,deviceString:'NVIDIA fixture'}]},{platform:'linux',arch:'x64',gpu:'unknown' as const,gpuName:''}]){
   trace.push(['read',api.readMachineProfile(options)]);trace.push(['gpu',api.resolveGpuProfile(options)]);trace.push(['apple',api.isAppleSilicon(options)])
  }
  return trace
 }finally{Object.defineProperty(os,'cpus',{configurable:true,writable:true,value:originalCpus});Object.defineProperty(os,'totalmem',{configurable:true,writable:true,value:originalMemory});syncBuiltinESMExports()}
}
export function observeRecognizer(api:Pick<typeof Recognizer,'resolveAsrModelPaths'|'tryRecognizerConfig'>){
 const trace:unknown[]=[];let issue:string|null=null,throwRole:string|null=null;const error=new Error('fixture role failed')
 const models={incompleteModelIssue:(tier:string)=>{trace.push(['issue',tier]);return issue},pathByRole:(role:string,tier:string)=>{trace.push(['role',role,tier]);if(role===throwRole)throw error;return `/model/${role}`}} as unknown as Parameters<typeof api.resolveAsrModelPaths>[0]
 const capture=(fn:()=>unknown)=>{try{return {result:fn()}}catch(cause){return {error:cause instanceof Error?{name:cause.name,message:cause.message,identity:cause===error}:{thrown:String(cause)}}}}
 trace.push(['paths',capture(()=>api.resolveAsrModelPaths(models,'minimal'))])
 for(const tier of ['minimal','sense-voice','fire-red-asr','parakeet-v3','qwen3-1.7b'] as const)for(const args of [[],[3,'cuda',1],[null,null,null]] as const)trace.push(['config',tier,args,capture(()=>Reflect.apply(api.tryRecognizerConfig,undefined,[models,tier,...args]))])
 issue='model incomplete fixture';trace.push(['incomplete',capture(()=>api.resolveAsrModelPaths(models,'minimal')),api.tryRecognizerConfig(models,'minimal')]);issue=null
 throwRole='asr-frontend';trace.push(['role-error',capture(()=>api.resolveAsrModelPaths(models,'minimal')),api.tryRecognizerConfig(models,'minimal')]);throwRole=null
 trace.push(['unknown-tier',Reflect.apply(api.tryRecognizerConfig,undefined,[models,'unknown-tier'])]);return trace
}
export async function observeConcurrency(api:Pick<typeof Concurrency,'applyTranscriptionConcurrency'>){
 const trace:unknown[]=[];const queue={setMaxConcurrency:(n:number)=>{trace.push(['global',n]);return Promise.resolve().then(()=>{trace.push('global-resolved')})},setMaxPerGroup:(group:string,n:number|null)=>{trace.push(['group',group,n]);return Promise.resolve().then(()=>{trace.push('group-resolved')})},setMaxConcurrentDownloads:(n:number)=>{trace.push(['downloads',n]);return Promise.resolve().then(()=>{trace.push('downloads-resolved')})}}
 const value=api.applyTranscriptionConcurrency({queue,maxConcurrentDownloads:'3',maxConcurrentTranscriptions:4});trace.push(['returned',value===undefined]);await Promise.resolve();trace.push('microtask')
 const error=new Error('setter fixture');try{api.applyTranscriptionConcurrency({queue:{...queue,setMaxPerGroup:()=>{trace.push('group-throw');throw error}},maxConcurrentDownloads:null,maxConcurrentTranscriptions:NaN})}catch(cause){trace.push(['throw-identity',cause===error])}
 await Promise.resolve();return trace
}
