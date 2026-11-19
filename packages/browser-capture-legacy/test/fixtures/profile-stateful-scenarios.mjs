// Permanent controlled-host scenarios. The optional module argument records the unchanged old bundle.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import childProcess from 'node:child_process'
import timerPromises from 'node:timers/promises'
import { syncBuiltinESMExports } from 'node:module'
import { pathToFileURL } from 'node:url'
import { EventEmitter } from 'node:events'
import { chromium } from 'playwright-core'
const originalExists = fs.existsSync
fs.existsSync = file => {
  const fixed=['/usr/bin/','/opt/','/usr/lib/chromium'].some(prefix=>String(file).startsWith(prefix))
  if(current?.browserAbsent&&fixed)return false
  if(current?.discoveryFailure&&String(file)==='/usr/bin/google-chrome-stable')throw new RangeError('controlled discovery failure')
  return String(file).startsWith('/fixture/browser')?true:originalExists(file)
}
childProcess.spawnSync = (_command, args) => ({stdout: !current?.browserAbsent&&args[0] === 'chrome' ? '/fixture/browser\n' : '',status:0})
let current
const pendingDelays = []
timerPromises.setTimeout = (_ms, _value, options) => new Promise((resolve,reject) => {
  const signal = options?.signal
  if(signal?.aborted) {reject(signal.reason);return}
  const cancel=()=>reject(signal.reason)
  signal?.addEventListener('abort',cancel,{once:true})
  pendingDelays.push(()=>{signal?.removeEventListener('abort',cancel);resolve()})
})
Date.now = () => 1700000000000
syncBuiltinESMExports()
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes,no)=>{resolve=yes;reject=no})
  return {promise,resolve,reject}
}
const until = async (predicate,label) => {
  for(let i=0;i<1000;i+=1) {
    if(predicate()) return
    await new Promise(setImmediate)
  }
  throw new Error(`Controlled scenario did not reach ${label}`)
}
const turns = async () => {for(let i=0;i<40;i+=1) await Promise.resolve()}
const url = 'https://onlyfans.com/example'
const other = 'https://onlyfans.com/second'
const mediaUrl = 'https://cdn2.onlyfans.com/files/one.jpg?Signature=fixture'
const mediaPayload = id => ({id:100,media:[{id,type:'photo',files:{full:{url:mediaUrl}}}]})
const response = (responseUrl,body,status=200,jsonGate,fault) => ({
  url:()=>{if(fault==='url'){current.trace.push(['response-projection','url']);throw new RangeError('controlled response url')}return responseUrl},
  ok:()=>{if(fault==='ok'){current.trace.push(['response-projection','ok']);throw new RangeError('controlled response ok')}return status>=200&&status<300},
  status:()=>{if(fault==='status'){current.trace.push(['response-projection','status']);throw new RangeError('controlled response status')}return status},json:async()=>{
  current.trace.push(['json',responseUrl])
  return jsonGate ? await jsonGate.promise : body
}})
chromium.launchPersistentContext = async () => {
  const state=current
  state.trace.push(['launch'])
  if(state.launchFailure) throw state.launchFailure
  if(state.launchGate) await state.launchGate.promise
  const events=new EventEmitter(), closedEvents=new EventEmitter()
  let currentUrl=url, closed=false
  const page={
    url:()=>currentUrl,isClosed:()=>closed,context:()=>context,
    on:events.on.bind(events),off:events.off.bind(events),
    goto:async next=>{state.trace.push(['goto',next]);currentUrl=next;if(state.gotoFailure)throw state.gotoFailure;if(state.gotoGate)await state.gotoGate.promise},
    bringToFront:async()=>{state.trace.push(['front'])},
    evaluate:async()=>false,
    locator:()=>({first:()=>({getAttribute:async()=>null})}),
    getByText:()=>({all:async()=>[]}),
    waitForResponse:async()=>{state.trace.push(['waitResponse']);if(state.responseFailure)throw state.responseFailure;return state.responseGate ? await state.responseGate.promise : response('https://onlyfans.com/api2/v2/posts/100',mediaPayload(1))},
  }
  const context={pages:()=>[page],newPage:async()=>page,on:closedEvents.on.bind(closedEvents),cookies:async()=>[{name:'sess'},{name:'auth_id'}],close:async()=>{state.trace.push(['close']);closed=true;closedEvents.emit('close')}}
  state.contexts.push({context,page,events})
  return context
}
globalThis.fetch = async (_url,options) => {
  const state=current
  state.trace.push(['fetch',options.redirect,options.headers])
  if(state.fetchFailure) throw state.fetchFailure
  if(state.fetchGate) await state.fetchGate.promise
  return new Response(new Uint8Array([1,2,3]),{status:200,headers:{'content-type':state.mime ?? 'image/jpeg','content-length':state.total ?? '3'}})
}
const loaded = process.argv[2] ? await import(pathToFileURL(path.resolve(process.argv[2])).href) : await import('@vidbee/browser-capture-legacy/onlyfans-profile')
const Profiles = loaded.onlyfans_profile?.OnlyFansProfiles ?? loaded.OnlyFansProfiles
const root=fs.mkdtempSync(path.join(os.tmpdir(),'vidbee-stateful-profile-'))
const results=[]
const normalize = value => JSON.parse(JSON.stringify(value,(_key,value)=>{
  if(value===undefined)return {__undefined:true}
  if(typeof value==='number'&&!Number.isFinite(value))return {__number:String(value)}
  return typeof value==='string' ? value.replaceAll(root,'/fixture/root') : value
}))
const outcome = promise => promise.then(value=>({value}),error=>({error:{name:error instanceof Error?error.name:typeof error,message:error instanceof Error?error.message:String(error),injected:[current.launchFailure,current.gotoFailure,current.fetchFailure,current.responseFailure].includes(error)}}))
let sequence=0
const setup=(saved=true)=>{
  pendingDelays.splice(0)
  const directory=path.join(root,String(sequence++));fs.mkdirSync(directory)
  const state={trace:[],contexts:[],directory}
  current=state
  if(saved) fs.writeFileSync(path.join(directory,'example.json'),JSON.stringify({username:'example',profileUrl:url,state:'complete',updatedAt:1,pages:1,items:[{id:'1',postId:'100',category:'photos',state:'available',downloaded:false},{id:'2',postId:'101',category:'photos',state:'available',downloaded:false}]}))
  const profiles=new Profiles(directory,()=>'/fixture/downloads')
  return {...state,state,profiles}
}
const record=(name,value)=>results.push({name,result:normalize(value)})
try {
  {
    const f=setup(false)
    const first=f.profiles.get(url);first.items.push({id:'outside'})
    const again=f.profiles.get(url),listBefore=f.profiles.list()
    const invalid=await outcome(f.profiles.command({url:'invalid',action:'get'}))
    const get=await outcome(f.profiles.command({url,action:'get'}))
    record('get-list-clone-and-validation',{again,listBefore,invalid,get,listAfter:f.profiles.list()})
    await f.profiles.stop()
  }
  {
    const f=setup();const snapshot=f.profiles.get(url)
    snapshot.items[0].downloaded=true;snapshot.items[0].id='external mutation';snapshot.items.pop()
    const listed=f.profiles.list();listed[0].items[0].postId='another external mutation'
    record('saved-get-list-deep-clone',{profile:f.profiles.get(url),list:f.profiles.list()})
    await f.profiles.stop()
  }
  for(const same of [true,false]) for(const fail of [false,true]) {
    const f=setup(false);f.state.launchGate=deferred()
    const one=outcome(f.profiles.command({url,action:'open'})),two=outcome(f.profiles.command({url:same?url:other,action:'open'}))
    await until(()=>f.trace.some(row=>row[0]==='launch'),'one shared launch')
    const before={profiles:f.profiles.list(),trace:[...f.trace]}
    if(fail) f.state.launchGate.reject(new Error('controlled launch rejection'))
    else f.state.launchGate.resolve()
    const values=await Promise.all([one,two])
    record(`concurrent-open-${same?'same':'different'}-${fail?'reject':'resolve'}`,{before,values,profiles:f.profiles.list(),trace:f.trace})
    await f.profiles.stop()
  }
  {
    const f=setup(false);f.state.gotoGate=deferred()
    const opening=outcome(f.profiles.command({url,action:'open'}))
    await until(()=>f.trace.some(row=>row[0]==='goto'),'gated open navigation')
    const stop=await outcome(f.profiles.stop())
    f.state.gotoGate.resolve()
    record('open-stop-during-navigation',{stop,opening:await opening,profile:f.profiles.get(url),trace:f.trace})
    await f.profiles.stop()
  }
  {
    const f=setup();const gate=deferred();const tasks=new Map();let nested,reentered=false
    const queue={
      get:id=>tasks.get(id),list:()=>[],
      setMaxPerGroup:async(group,max)=>{f.trace.push(['cap',group,max])},
      retryManual:async id=>{f.trace.push(['retry',id])},
      add:async input=>{
        f.trace.push(['add',input]);tasks.set(input.id,{status:'queued'})
        if(!reentered) {reentered=true;nested=outcome(f.profiles.enqueue(queue,{url,itemIds:['1'],customDownloadPath:'/fixture/downloads'}));f.trace.push(['reentrant-get',f.profiles.get(url).state])}
        await gate.promise
      },
    }
    const a=outcome(f.profiles.enqueue(queue,{url,itemIds:['1'],customDownloadPath:'/fixture/downloads'}))
    await until(()=>f.trace.some(row=>row[0]==='add'),'queue admission')
    const b=await outcome(f.profiles.enqueue(queue,{url,itemIds:['1'],customDownloadPath:'/fixture/downloads'}))
    gate.resolve();record('queue-concurrent-reentry',{a:await a,b,nested:await nested,trace:f.trace,profile:f.profiles.get(url)})
    await f.profiles.stop()
  }
  {
    const f=setup();let calls=0
    const queue={get:()=>undefined,list:()=>[],setMaxPerGroup:async()=>{},retryManual:async()=>{},add:async input=>{f.trace.push(['add',input.id]);if(++calls===2)throw new RangeError('controlled second admission')}}
    record('queue-partial-failure',{outcome:await outcome(f.profiles.enqueue(queue,{url,itemIds:['1','2'],customDownloadPath:'/fixture/downloads'})),trace:f.trace,profile:f.profiles.get(url)})
    await f.profiles.stop()
  }
  for(const point of ['response','goto','fetch','mime','length','overflow']) {
    const f=setup();
    if(point==='response')f.state.responseFailure=new Error('controlled response failure')
    if(point==='goto')f.state.gotoFailure=new RangeError('controlled navigation failure')
    if(point==='fetch')f.state.fetchFailure=new TypeError('controlled fetch failure')
    if(point==='mime')f.state.mime='text/html'
    if(point==='length')f.state.total='4'
    if(point==='overflow')f.state.total='1e999'
    const progress=[]
    const value=await outcome(f.profiles.download(url,'1',path.join(f.directory,'downloads'),new AbortController().signal,(bytes,total)=>progress.push([bytes,total])))
    const folder=path.join(f.directory,'downloads','OnlyFans','example','photos')
    const residue=fs.existsSync(folder)?fs.readdirSync(folder).map(name=>[name,[...fs.readFileSync(path.join(folder,name))]]):[]
    const afterFailure=await outcome(f.profiles.command({url,action:'get'}))
    record(`download-failure-${point}`,{value,progress,residue,afterFailure,trace:f.trace})
    await f.profiles.stop()
  }
  {
    const f=setup();f.state.fetchGate=deferred();const progress=[]
    const active=outcome(f.profiles.download(url,'1',path.join(f.directory,'downloads'),new AbortController().signal,(bytes,total)=>{progress.push([bytes,total]);f.trace.push(['reentrant-get',f.profiles.get(url).items[0].downloaded])}))
    await until(()=>f.trace.some(row=>row[0]==='fetch'),'gated media transfer')
    const otherDownload=await outcome(f.profiles.download(other,'1',path.join(f.directory,'downloads'),new AbortController().signal,()=>{}))
    const open=await outcome(f.profiles.command({url,action:'open'}))
    const stop=await outcome(f.profiles.stop())
    f.state.fetchGate.resolve()
    record('download-stop-does-not-abort',{otherDownload,open,stop,active:await active,progress,profile:f.profiles.get(url),trace:f.trace})
    await f.profiles.stop()
  }
  {
    const first=setup();first.state.fetchGate=deferred()
    const one=outcome(first.profiles.download(url,'1',path.join(first.directory,'downloads'),new AbortController().signal,()=>{}))
    await until(()=>first.trace.some(row=>row[0]==='fetch'),'first owner transfer')
    const second=setup();second.state.fetchGate=deferred()
    const two=outcome(second.profiles.download(url,'1',path.join(second.directory,'downloads'),new AbortController().signal,()=>{}))
    await until(()=>second.trace.some(row=>row[0]==='fetch'),'independent second owner transfer')
    first.state.fetchGate.resolve();second.state.fetchGate.resolve()
    const values=await Promise.all([one,two])
    record('independent-owner-transfers',{values,first:first.profiles.get(url),second:second.profiles.get(url),traces:[first.trace,second.trace]})
    await first.profiles.stop();await second.profiles.stop()
  }
  {
    const f=setup(false);const gate=deferred()
    await f.profiles.command({url,action:'map'})
    await until(()=>f.contexts[0]?.events.listenerCount('response')===1,'mapping listener')
    const events=f.contexts[0].events
    events.emit('response',response('https://onlyfans.com/api2/v2/users/example',{id:7},200,gate))
    events.emit('response',response('https://onlyfans.com/api2/v2/users/7/posts/medias',{list:[mediaPayload(1)],hasMore:false}))
    const immediate={profile:f.profiles.get(url),trace:[...f.trace]}
    await until(()=>f.trace.some(row=>row[0]==='json'),'serialized owner JSON')
    const blockedOpen=await outcome(f.profiles.command({url:other,action:'open'}))
    let stopped=false;const stopping=outcome(f.profiles.stop()).then(value=>{stopped=true;return value})
    await turns();const beforeRelease={stopped,profile:f.profiles.get(url),trace:[...f.trace]}
    gate.resolve({id:7})
    for(const release of pendingDelays.splice(0))release()
    const stop=await stopping
    record('mapping-stop-drains-queued-responses',{immediate,blockedOpen,beforeRelease,stop,profile:f.profiles.get(url),trace:f.trace})
  }
  {
    const f=setup();const file=path.join(f.directory,'example.json')
    const stored=JSON.parse(fs.readFileSync(file,'utf8'));stored.items[1]={...stored.items[0],downloaded:true};fs.writeFileSync(file,JSON.stringify(stored))
    const value=await outcome(f.profiles.download(url,'1',path.join(f.directory,'downloads'),new AbortController().signal,()=>{}))
    record('duplicate-saved-items-collapse-on-collect',{value,profile:f.profiles.get(url)})
    await f.profiles.stop()
  }
  for(const fault of ['url','ok','status']) {
    const f=setup(false)
    await f.profiles.command({url,action:'map'})
    await until(()=>f.contexts[0]?.events.listenerCount('response')===1,'mapping listener for projection failure')
    const events=f.contexts[0].events
    events.emit('response',response('https://onlyfans.com/api2/v2/users/example',{id:7},fault==='status'?401:200,undefined,fault))
    await until(()=>f.trace.some(row=>row[0]==='response-projection'),'failing raw response projection')
    await turns()
    const during=f.profiles.get(url)
    const stopped=await outcome(f.profiles.stop())
    record(`response-projection-failure-${fault}`,{during,stopped,profile:f.profiles.get(url),trace:f.trace})
  }
  for(const point of ['browserAbsent','discoveryFailure']) {
    const f=setup(false);f.state[point]=true
    const markers=[]
    const pending=f.profiles.command({url,action:'map'}).then(value=>{const result={value};markers.push(['settled',result]);return result},error=>{const result={error:{name:error.name,message:error.message}};markers.push(['settled',result]);return result})
    markers.push(['returned',f.profiles.get(url)])
    for(let turn=1;turn<=8;turn+=1) {await Promise.resolve();markers.push(['turn',turn,f.profiles.get(url)])}
    const result=await pending
    await new Promise(setImmediate)
    record(`mapping-fast-failure-${point}`,{markers,result,profile:f.profiles.get(url),stop:await outcome(f.profiles.stop())})
  }
  process.stdout.write(`__PROFILE_STATEFUL__${JSON.stringify(results)}\n`)
} finally {
  fs.rmSync(root,{force:true,recursive:true})
}
