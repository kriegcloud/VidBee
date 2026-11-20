import Parser from 'rss-parser'
export const feedTimingScenarios=['fetch-success','fetch-failure','body-failure','parse-failure','https-retry-success','https-retry-failure','probe-direct','probe-candidate','probe-candidates-fail','raw-false','raw-zero','raw-string','fetch-throw','body-throw','parse-throw','https-retry-throw-success','https-retry-throw-failure','probe-candidate-throw','probe-candidates-throw','abort-after-body','abort-after-parse','raw-true','raw-seven','raw-nan','raw-empty','raw-null','raw-undefined','status-zero','status-null','raw-image-array','raw-itunes-array'] as const
export async function observeFeedTiming(Ctor:new()=>{fetch(url:string,signal?:AbortSignal):Promise<unknown>;probe(url:string,signal?:AbortSignal):Promise<unknown>},scenario:string):Promise<unknown[]>{
 const trace:unknown[]=[]
 const originalParser=Parser.prototype.parseString,originalFetch=globalThis.fetch,originalAfter=globalThis.setTimeout,originalClear=globalThis.clearTimeout
 const failures=[new Error('initial'),new Error('candidate-one'),new Error('candidate-two')]
 const controller=new AbortController()
 let requests=0,parses=0
 try{
  Reflect.set(globalThis,'setTimeout',Object.assign((_callback:unknown,ms?:number)=>{trace.push(['timer',ms]);return 0},originalAfter))
  globalThis.clearTimeout=()=>{trace.push('clear')}
  Reflect.set(globalThis,'fetch',function(input:string|URL|Request){
   const request=++requests;trace.push(['fetch',String(input)])
   if(scenario==='fetch-throw'||scenario==='https-retry-throw-failure'||scenario==='https-retry-throw-success'&&request===1)throw failures[request-1]??failures[0]
   if(scenario==='fetch-failure'||scenario==='https-retry-failure'||scenario==='https-retry-success'&&request===1)return Promise.reject(failures[request-1]??failures[0])
   const html=scenario.startsWith('probe-')&&scenario!=='probe-direct'&&request===1
   const text=html?'<link rel="alternate" type="application/rss+xml" href="/one"><link rel="alternate" type="application/atom+xml" href="/two">':'xml'
   return Promise.resolve({ok:true,status:scenario==='status-zero'?0:scenario==='status-null'?null:200,url:String(input),text(){trace.push('text');if(scenario==='body-throw')throw failures[0];return scenario==='body-failure'?Promise.reject(failures[0]):Promise.resolve(text)}})
  })
  Reflect.set(Parser.prototype,'parseString',function(){
   const index=parses++;trace.push('parse')
   if(scenario==='parse-throw'||scenario==='probe-candidates-throw'||scenario==='probe-candidate-throw'&&index===0)throw failures[index]??failures[0]
   if(scenario==='parse-failure'||scenario==='probe-candidates-fail'||scenario==='probe-candidate'&&index===0)return Promise.reject(failures[index]??failures[0])
   if(scenario==='raw-false')return Promise.resolve(false)
   if(scenario==='raw-zero')return Promise.resolve(0)
   if(scenario==='raw-string')return Promise.resolve('text')
   if(scenario==='raw-true')return Promise.resolve(true)
   if(scenario==='raw-seven')return Promise.resolve(7)
   if(scenario==='raw-nan')return Promise.resolve(NaN)
   if(scenario==='raw-empty')return Promise.resolve('')
   if(scenario==='raw-null')return Promise.resolve(null)
   if(scenario==='raw-undefined')return Promise.resolve(undefined)
   if(scenario==='raw-image-array')return Promise.resolve({items:[],image:Object.assign([],{url:'cover'})})
   if(scenario==='raw-itunes-array')return Promise.resolve({items:[],itunes:Object.assign([],{image:'cover'})})
   return Promise.resolve({items:[]})
  })
  const url=scenario.startsWith('https-retry')?'http://fixture.invalid/feed':'https://fixture.invalid/feed'
  const owner=new Ctor()
  const pending=(scenario.startsWith('probe-')?owner.probe(url):owner.fetch(url,scenario.startsWith('abort-')?controller.signal:undefined)).then(value=>{trace.push(['settled',value])},error=>{trace.push(['rejected',error instanceof Error?error.name:typeof error,error instanceof Error?error.message:String(error),failures.indexOf(error)])})
  trace.push('returned')
  let marker=0;const step=()=>{trace.push(['microtask',++marker]);if((scenario==='abort-after-body'&&marker===2)||(scenario==='abort-after-parse'&&marker===4))controller.abort(failures[0]);if(marker<30)queueMicrotask(step)};queueMicrotask(step)
  await pending;trace.push('awaited');for(let i=0;i<40;i++)await Promise.resolve()
  return trace
 }finally{Parser.prototype.parseString=originalParser;globalThis.fetch=originalFetch;globalThis.setTimeout=originalAfter;globalThis.clearTimeout=originalClear}
}
