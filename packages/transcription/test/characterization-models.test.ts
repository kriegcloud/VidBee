import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModelManager, finalizeModelFile, isModelDownloadCancelled, modelPartPath, removeModelPartFiles, startMinimalModelFill } from '@vidbee/transcription'
import type { ModelManagerOptions } from '@vidbee/transcription'

type Spec = NonNullable<ModelManagerOptions['catalog']>[number]
const roots:string[]=[]
const root=()=>{const dir=mkdtempSync(join(tmpdir(),'transcription-models-'));roots.push(dir);return dir}
const hash=(text:string|Buffer)=>createHash('sha256').update(text).digest('hex')
const spec:Spec={id:'test-model',fileName:'tiny/model.onnx',url:'https://fixture.invalid/model',required:true,group:'asr',role:'asr-model',tier:'minimal'}
const clean=(value:unknown,dir:string):unknown=>JSON.parse(JSON.stringify(value).replaceAll(dir,'<root>'))
const manager=(dir:string, extra:Partial<ModelManagerOptions>={})=>new ModelManager({modelsDir:dir,catalog:[spec],resolveUrls:s=>[s.url],...extra})
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();for(const dir of roots.splice(0))rmSync(dir,{recursive:true,force:true})})
describe('pre-port model manager',()=>{
 it('constructor is synchronous, status payloads are complete, present nonempty raw files skip hashing',async()=>{
  const dir=root();let calls=0
  const models=manager(dir,{catalog:[{...spec,sha256:'0'.repeat(64)}],fetchImpl:async()=>{calls++;throw new Error('must not fetch')}})
  expect(existsSync(dir)).toBe(true)
  expect(clean(models.status(),dir)).toMatchSnapshot('missing occupancy')
  mkdirSync(join(dir,'tiny'));writeFileSync(join(dir,spec.fileName),'wrong digest')
  expect(clean(models.status(['asr'],['minimal']),dir)).toMatchSnapshot('present raw')
  expect(models.pathById('test-model')).toBe(join(dir,spec.fileName));expect(models.pathById('missing')).toBeNull()
  const trace:string[]=[];const pending=models.ensureReady({groups:['asr'],tiers:['minimal']}).then(()=>trace.push('done'))
  trace.push('immediate');queueMicrotask(()=>trace.push('marker'));await pending
  expect(trace).toEqual(['immediate','done','marker']);expect(calls).toBe(0)
  expect(models.pathByRole('asr-model')).toBe(join(dir,spec.fileName));expect(models.incompleteModelIssue()).toBeNull()
  expect(clean(models.removeTier('minimal'),dir)).toMatchSnapshot('removed');expect(existsSync(join(dir,'tiny'))).toBe(false)
  expect(()=>Reflect.apply(models.removeTier,models,['standard'])).toThrow('unknown ASR tier: standard')
 },30000)
 it('downloads fallback candidates with exact GET shape and publishes despite incorrect content-length',async()=>{
  const dir=root();const calls:unknown[]=[];const emissions:unknown[]=[]
  vi.spyOn(Date,'now').mockReturnValue(1000)
  const models=manager(dir,{resolveUrls:()=>['https://fixture.invalid/fail','https://fixture.invalid/ok'],fetchImpl:async(url,init)=>{calls.push({url,keys:Object.keys(init ?? {}),method:init?.method,aborted:init?.signal?.aborted});return String(url).endsWith('fail')?new Response('ignored',{status:503}):new Response('abc',{headers:{'content-length':'999'}})}})
  models.subscribe(status=>emissions.push(clean(status,dir)))
  const result=await models.ensureReady({groups:['asr'],tiers:['minimal']})
  expect(clean(result,dir)).toMatchSnapshot('complete result');expect(calls).toMatchSnapshot('exact requests');expect(emissions).toMatchSnapshot('full callbacks')
  expect(readFileSync(join(dir,spec.fileName),'utf8')).toBe('abc');expect(readdirSync(join(dir,'tiny'))).toEqual(['model.onnx'])
  expect(statSync(join(dir,spec.fileName)).mode & 0o777).toBe(0o666 & ~process.umask())
 },30000)
 it('checksum failures remove parts and rejected callbacks preserve identity',async()=>{
  const dir=root();const models=manager(dir,{catalog:[{...spec,sha256:hash('expected')}],fetchImpl:async()=>new Response('bad')})
  await expect(models.ensureReady({tiers:['minimal']})).rejects.toThrow('model checksum mismatch for https://fixture.invalid/model')
  expect(readdirSync(join(dir,'tiny'))).toEqual([])
  expect(clean(models.status(),dir)).toMatchSnapshot('failed state')
  const error=new Error('listener throw');const other=manager(root(),{fetchImpl:async()=>new Response('x')});other.subscribe(()=>{throw error})
  await expect(other.ensureReady({tiers:['minimal']})).rejects.toBe(error)
 },30000)
 it('live listeners deduplicate, unsubscribe/re-add order is synchronous and throws escape cancel',()=>{
  const models=manager(root());const trace:string[]=[];let removeB=()=>{}
  const b=()=>trace.push('b');const c=()=>trace.push('c')
  const a=()=>{trace.push('a');removeB();models.subscribe(c)}
  const stale=models.subscribe(a);models.subscribe(a);removeB=models.subscribe(b)
  expect(trace).toEqual([]);models.cancelDownload('minimal');trace.push('returned')
  expect(trace).toEqual(['a','c','returned']);stale();models.subscribe(a);trace.length=0;models.cancelDownload('minimal');expect(trace).toEqual(['c','a'])
  const error=new Error('escape');models.subscribe(()=>{throw error});expect(()=>models.cancelDownload('minimal')).toThrow(error)
 })
 it('tier busy guard is synchronous and cancellation rejects with stable application error',async()=>{
  const models=manager(root(),{fetchImpl:(_url,init)=>new Promise((_resolve,reject)=>{init?.signal?.addEventListener('abort',()=>reject(init.signal?.reason))})})
  const pending=models.ensureReady({tiers:['minimal']});const assertion=expect(pending).rejects.toMatchObject({name:'AbortError',message:'download cancelled: minimal'})
  expect(()=>models.removeTier('minimal')).toThrow('cannot delete minimal while it is downloading')
  models.cancelDownload('minimal');await assertion
  expect(models.status(['asr'],['minimal']).ready).toBe(false)
 },30000)
 it('cancellation recognizer and publication winner preserve old behavior',()=>{
  expect([new Error('download cancelled: minimal'),Object.assign(new Error('other'),{name:'AbortError'}),'operation was aborted','other',null,42].map(isModelDownloadCancelled)).toEqual([true,true,true,false,false,false])
  const dir=root();const dest=join(dir,'model');const temporary=modelPartPath(dest)
  expect(temporary).toBe(`${dest}.part.${process.pid}`);writeFileSync(dest,'winner');writeFileSync(temporary,'loser');finalizeModelFile(temporary,dest)
  expect(readFileSync(dest,'utf8')).toBe('winner');expect(existsSync(temporary)).toBe(false)
  writeFileSync(`${dest}.part`,'old');writeFileSync(temporary,'own');writeFileSync(`${dest}.part.99999999`,'foreign');removeModelPartFiles(dest)
  expect(readdirSync(dir).sort()).toEqual(['model','model.part.99999999'])
  expect(()=>finalizeModelFile(join(dir,'missing'),join(dir,'new'))).toThrow()
 })
 it('pinned JSON directory members reject scalar roots, repair them and keep unknown object fields',async()=>{
  const dir=root();const payload='{"unknown":{"x":1}}';const member={name:'tokenizer.json',minBytes:2,sha256:hash(payload),json:true}
  const directorySpec:Spec={...spec,fileName:'tiny/tokenizer',directoryMembers:[member]}
  const calls:unknown[]=[]
  const models=manager(dir,{catalog:[directorySpec],fetchImpl:async(url,init)=>{calls.push({url,keys:Object.keys(init ?? {})});return new Response(payload)}})
  mkdirSync(join(dir,'tiny/tokenizer'),{recursive:true});writeFileSync(join(dir,'tiny/tokenizer/tokenizer.json'),'null')
  expect(models.incompleteModelIssue('minimal')).toContain('incomplete model')
  await models.ensureReady({tiers:['minimal']});expect(readFileSync(join(dir,'tiny/tokenizer/tokenizer.json'),'utf8')).toBe(payload);expect(calls).toMatchSnapshot()
 },30000)
 it('tar archive uses HEAD then GET, stale PID lock takeover and publication marker last',async()=>{
  const dir=root();const archiveRoot=root();mkdirSync(join(archiveRoot,'tiny'));writeFileSync(join(archiveRoot,'tiny/model.onnx'),'archive bytes')
  const tar=join(archiveRoot,'fixture.tar.bz2');execFileSync('tar',['-cjf',tar,'-C',archiveRoot,'tiny']);const bytes=readFileSync(tar)
  const archiveSpec={...spec,url:'https://fixture.invalid/fixture.tar.bz2'}
  mkdirSync(join(dir,'.downloads/fixture.tar.bz2.lock'),{recursive:true});writeFileSync(join(dir,'.downloads/fixture.tar.bz2.lock/pid'),'99999999\n');utimesSync(join(dir,'.downloads/fixture.tar.bz2.lock'),0,0)
  const calls:unknown[]=[];const models=manager(dir,{catalog:[archiveSpec],fetchImpl:async(url,init)=>{calls.push({url,keys:Object.keys(init ?? {}),method:init?.method});return init?.method==='HEAD'?new Response(null,{headers:{'content-length':String(bytes.length)}}):new Response(bytes)}})
  await models.ensureReady({tiers:['minimal']});expect(calls).toMatchSnapshot();expect(readFileSync(join(dir,spec.fileName),'utf8')).toBe('archive bytes')
  expect(readdirSync(join(dir,'.downloads')).sort()).toEqual(['fixture.tar.bz2','fixture.tar.bz2.extracted']);expect(readFileSync(join(dir,'.downloads/fixture.tar.bz2.extracted'),'utf8')).toBe('ok')
 },30000)
 it('minimal fill schedules exact backoff and stop does not suppress an in-flight success',async()=>{
  const models=manager(root());let resolve:((value:ReturnType<ModelManager['status']>)=>void)|undefined;const trace:unknown[]=[];const callbacks:Array<()=>void>=[]
  vi.spyOn(models,'ensureReady').mockImplementation(opts=>{trace.push(['ensure',opts]);return new Promise(done=>{resolve=done})})
  const fill=startMinimalModelFill({models,now:()=>{throw new Error('unused')},schedule:(callback,ms)=>{trace.push(['schedule',ms]);callbacks.push(callback);return setTimeout(()=>{},100000)},logger:{info:message=>trace.push(['info',message])},onReady:()=>trace.push('ready')})
  callbacks[0]?.();trace.push('immediate');fill.stop();resolve?.(models.status());await Promise.resolve();await Promise.resolve()
  expect(trace).toMatchSnapshot()
 },30000)
})

it('peer raw publication wins before current transfer checksum and removes only its own part',async()=>{
 let clock=1000;vi.spyOn(Date,'now').mockImplementation(()=>clock+=300)
 const dir=root();const models=manager(dir,{catalog:[{...spec,sha256:hash('expected different bytes')}],fetchImpl:async()=>new Response('bad bytes')})
 const remove=models.subscribe(status=>{if(status.downloads.some(download=>download.received>0)){mkdirSync(join(dir,'tiny'),{recursive:true});writeFileSync(join(dir,spec.fileName),'peer winner')}})
 try{const result=await models.ensureReady({tiers:['minimal']});expect(result.ready).toBe(true);expect(readFileSync(join(dir,spec.fileName),'utf8')).toBe('peer winner');expect(readdirSync(join(dir,'tiny'))).toEqual(['model.onnx'])}finally{remove()}
},30000)

it('archive live-lock timeout uses strict greater-than deadline and leaves foreign lock untouched',async()=>{
 const dir=root();const lock=join(dir,'.downloads/fixture.tar.bz2.lock');mkdirSync(lock,{recursive:true});writeFileSync(join(lock,'pid'),String(process.pid))
 const models=manager(dir,{catalog:[{...spec,url:'https://fixture.invalid/fixture.tar.bz2'}],fetchImpl:async()=>new Response(null,{headers:{'content-length':'1'}})})
 vi.useFakeTimers();vi.setSystemTime(0)
 const pending=models.ensureReady({tiers:['minimal']});const failure=expect(pending).rejects.toThrow('timed out waiting for model archive lock fixture.tar.bz2.lock')
 await vi.advanceTimersByTimeAsync(60000);expect(readFileSync(join(lock,'pid'),'utf8')).toBe(String(process.pid));expect(vi.getTimerCount()).toBeGreaterThan(0)
 await vi.advanceTimersByTimeAsync(25);await failure;expect(existsSync(lock)).toBe(true)
},30000)

it('minimal-fill retries with every default delay, saturates and stop suppresses later rejected continuation',async()=>{
 vi.useFakeTimers();const models=manager(root());const error=new Error('offline');vi.spyOn(models,'ensureReady').mockRejectedValue(error)
 const callbacks:Array<()=>void>=[];const delays:number[]=[];const warnings:unknown[]=[]
 const fill=startMinimalModelFill({models,schedule:(callback,ms)=>{callbacks.push(callback);delays.push(ms);return setTimeout(()=>{},10000000)},logger:{warn:(...args)=>warnings.push(args)}})
 for(let index=0;index<8;index++){callbacks[index]?.();await Promise.resolve();await Promise.resolve();await Promise.resolve()}
 expect(delays).toEqual([0,5000,15000,45000,120000,600000,600000,600000,600000]);expect(warnings.length).toBe(8)
 callbacks[8]?.();fill.stop();await Promise.resolve();await Promise.resolve();await Promise.resolve();expect(warnings.length).toBe(8);expect(delays.length).toBe(9)
},30000)
