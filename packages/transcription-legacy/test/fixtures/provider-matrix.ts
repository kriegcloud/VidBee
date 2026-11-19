export const probeOutcomes = ['fast','margin','slow','untimed','failure','timeout','throw','missing-model'] as const
export const providerCases = [false,true].flatMap(libraryPresent => [false,true].flatMap(disableGpu => ['absent','present','stale'].flatMap(cache => probeOutcomes.flatMap(accelerator => probeOutcomes.map(cpu => ({libraryPresent,disableGpu,cache,accelerator,cpu}))))))
export type ProviderCase = typeof providerCases[number]
export const observeProvider = async(api:typeof import('../../src/compute-provider'),input:ProviderCase)=>{
 const calls:string[]=[]
 const selection=await api.selectSherpaProvider({platform:'linux',arch:'x64',gpuKinds:['nvidia'],probe:async provider=>{
  calls.push(provider)
  const outcome=provider==='cpu'?input.cpu:input.accelerator
  if(outcome==='throw')throw new Error('fixture probe rejected')
  const stderr=provider==='cuda'&&!input.libraryPresent?'Fallback to cpu!':''
  const fallback=api.isSherpaProviderFallbackLog(provider,stderr)
  return {provider,stderr,ok:!fallback&&!['failure','timeout','missing-model'].includes(outcome),durationMs:outcome==='untimed'?null:provider==='cpu'?100:outcome==='fast'?90:outcome==='margin'?95:110,error:outcome==='missing-model'?'probe model unavailable':outcome==='timeout'?'provider probe timed out':outcome==='failure'?'provider probe process failed':null}
 }})
 // Neither Electron's GPU flag nor runtime disk-cache contents is an input to provider selection.
 return {calls,selection}
}
