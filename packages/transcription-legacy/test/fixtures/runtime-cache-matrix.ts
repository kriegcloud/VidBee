import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
export const runtimeCacheCases=['absent','true','false','stale'].flatMap(cache=>['success','failure','throw'].flatMap(probe=>[false,true].map(disableGpu=>({cache,probe,disableGpu}))))
export type RuntimeCacheCase=typeof runtimeCacheCases[number]
export async function observeRuntimeCache(api:typeof import('../../src/runtime'),input:RuntimeCacheCase){
 const root=mkdtempSync(join(tmpdir(),'runtime-cache-matrix-'));const file=join(root,'probe.json');const trace:unknown[]=[]
 try{
  const key=api.probeCacheKey(process.execPath)
  if(input.cache!=='absent')writeFileSync(file,JSON.stringify({[input.cache==='stale'?key+':stale':key]:input.cache!=='false'}))
  const cache=api.createFileProbeCache(file)
  const value=await api.resolveWorkerRuntime({envPath:process.execPath,bundledPath:process.execPath,electronPath:process.execPath,lookUpSystem:false,cache,probe:async runtime=>{trace.push(runtime.layer);if(input.probe==='throw')throw new Error('probe fixture');return input.probe==='success'}})
  return {layer:value.layer,version:value.version,guarded:value.guarded,trace,cache:JSON.parse(readFileSync(file,'utf8'))[key]??null}
 }finally{rmSync(root,{recursive:true,force:true})}
}
