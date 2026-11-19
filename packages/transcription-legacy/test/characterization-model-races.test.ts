import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { ModelManager, type ModelManagerOptions } from '@vidbee/transcription-legacy'
type Spec=NonNullable<ModelManagerOptions['catalog']>[number]
const roots:string[]=[]
const root=()=>{const dir=mkdtempSync(join(tmpdir(),'model-race-'));roots.push(dir);return dir}
const hash=(body:string)=>createHash('sha256').update(body).digest('hex')
const spec:Spec={id:'model',fileName:'tiny/model.onnx',url:'https://fixture.invalid/archive.tar.bz2',tier:'minimal',required:true,group:'asr',role:'asr-model'}
const deferred=()=>{let release=()=>{};const promise=new Promise<void>(resolve=>{release=resolve});return {promise,release}}
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();for(const dir of roots.splice(0))rmSync(dir,{recursive:true,force:true})})
const archive=()=>{const dir=root();mkdirSync(join(dir,'tiny'));writeFileSync(join(dir,'tiny/model.onnx'),'archive bytes');const path=join(dir,'fixture.tar.bz2');execFileSync('tar',['-cjf',path,'-C',dir,'tiny']);return readFileSync(path)}
it('two managers stage concurrently, publish one winner and leave no owned lock/staging', {timeout:30000},async()=>{
  const dir=root();const bytes=archive();const calls:string[]=[];const staged1=deferred();const staged2=deferred();const resume1=deferred();const resume2=deferred()
  const make=(label:string,staged:ReturnType<typeof deferred>,resume:ReturnType<typeof deferred>)=>new ModelManager({modelsDir:dir,catalog:[spec],resolveUrls:s=>[s.url],fetchImpl:async(_url,init)=>{calls.push(`${label}:${init?.method??'GET'}`);return init?.method==='HEAD'?new Response(null,{headers:{'content-length':String(bytes.length)}}):new Response(bytes)},afterArchiveStaged:async()=>{staged.release();await resume.promise}})
  const first=make('first',staged1,resume1);const second=make('second',staged2,resume2)
  const pending1=first.ensureReady({tiers:['minimal']});await staged1.promise
  const pending2=second.ensureReady({tiers:['minimal']});await staged2.promise
  try { expect(existsSync(join(dir,spec.fileName))).toBe(false);resume1.release();expect((await pending1).ready).toBe(true);resume2.release();expect((await pending2).ready).toBe(true)
    expect(readFileSync(join(dir,spec.fileName),'utf8')).toBe('archive bytes');expect(calls).toEqual(['first:HEAD','first:GET','second:HEAD']);expect(readdirSync(join(dir,'.downloads')).sort()).toEqual(['archive.tar.bz2','archive.tar.bz2.extracted'])
  } finally {resume1.release();resume2.release();await Promise.allSettled([pending1,pending2])}
})
it('live current-process archive lock survives until its owner explicitly releases it', {timeout:30000},async()=>{
  const dir=root();const bytes=archive();const lock=join(dir,'.downloads/archive.tar.bz2.lock');mkdirSync(lock,{recursive:true});writeFileSync(join(lock,'pid'),`${process.pid}\n`)
  let calls=0;const manager=new ModelManager({modelsDir:dir,catalog:[spec],resolveUrls:s=>[s.url],fetchImpl:async(_url,init)=>{calls++;return init?.method==='HEAD'?new Response(null,{headers:{'content-length':String(bytes.length)}}):new Response(bytes)}})
  vi.useFakeTimers()
  const pending=manager.ensureReady({tiers:['minimal']})
  for(let turn=0;turn<30 && vi.getTimerCount()===0;turn++) await Promise.resolve()
  expect(vi.getTimerCount()).toBeGreaterThan(0)
  expect(readFileSync(join(lock,'pid'),'utf8')).toBe(`${process.pid}\n`);expect(existsSync(join(dir,spec.fileName))).toBe(false)
  rmSync(lock,{recursive:true});await vi.advanceTimersByTimeAsync(25);vi.useRealTimers();expect((await pending).ready).toBe(true);expect(calls).toBe(2);expect(existsSync(lock)).toBe(false)
})
it('pinned publisher manifest failures happen before asset fetch; valid entry supplies required digest', {timeout:30000},async()=>{
  for(const body of ['null','{}','{"files":[{"path":"model.onnx","sha256":"BAD"}]}','{"files":[{"path":"other","sha256":"'+'a'.repeat(64)+'"}]}',JSON.stringify({files:[{path:'model.onnx',sha256:hash('asset')}]})]){
    const dir=root();const manifest:Spec={...spec,id:'manifest',fileName:'checksums.json',url:'https://fixture.invalid/checksums',sha256:hash(body)};const asset:Spec={...spec,url:'https://fixture.invalid/asset',checksumManifest:'checksums.json'};writeFileSync(join(dir,'checksums.json'),body)
    let calls=0;const manager=new ModelManager({modelsDir:dir,catalog:[manifest,asset],resolveUrls:s=>[s.url],fetchImpl:async()=>{calls++;return new Response('asset')}})
    if(body.includes(hash('asset'))){expect((await manager.ensureReady({tiers:['minimal']})).ready).toBe(true);expect(calls).toBe(1);expect(readFileSync(join(dir,spec.fileName),'utf8')).toBe('asset')}
    else {await expect(manager.ensureReady({tiers:['minimal']})).rejects.toThrow('missing SHA256 in checksums.json for model');expect(calls).toBe(0)}
  }
  const dir=root();const missing=new ModelManager({modelsDir:dir,catalog:[{...spec,url:'https://fixture.invalid/raw',checksumManifest:'absent'}]});await expect(missing.ensureReady({tiers:['minimal']})).rejects.toThrow('missing pinned checksum manifest for model')
})
it('directory assessment cache omits json flag and shares result between managers', {timeout:30000},()=>{
  const dir=root();mkdirSync(join(dir,'tokenizer'));writeFileSync(join(dir,'tokenizer/member.json'),'null')
  const member={name:'member.json',minBytes:2,sha256:hash('null')};const lax=new ModelManager({modelsDir:dir,catalog:[{...spec,url:'https://fixture.invalid/raw',fileName:'tokenizer',directoryMembers:[member]}]})
  expect(lax.status(['asr'],['minimal']).ready).toBe(true)
  const strict=new ModelManager({modelsDir:dir,catalog:[{...spec,url:'https://fixture.invalid/raw',fileName:'tokenizer',directoryMembers:[{...member,json:true}]}]})
  expect(strict.status(['asr'],['minimal']).ready).toBe(true);expect(strict.incompleteModelIssue('minimal')).toBeNull()
})
it('cancellation after archive staging rejects before publication and retains reusable archive', {timeout:30000},async()=>{
  const dir=root();const bytes=archive();const staged=deferred();const resume=deferred()
  const manager=new ModelManager({modelsDir:dir,catalog:[spec],resolveUrls:s=>[s.url],fetchImpl:async(_url,init)=>init?.method==='HEAD'?new Response(null,{headers:{'content-length':String(bytes.length)}}):new Response(bytes),afterArchiveStaged:async()=>{staged.release();await resume.promise}})
  const pending=manager.ensureReady({tiers:['minimal']});await staged.promise
  const failure=expect(pending).rejects.toMatchObject({name:'AbortError',message:'download cancelled: minimal'})
  manager.cancelDownload('minimal');expect(existsSync(join(dir,spec.fileName))).toBe(false);resume.release();await failure
  expect(existsSync(join(dir,spec.fileName))).toBe(false);expect(readdirSync(join(dir,'.downloads'))).toEqual(['archive.tar.bz2'])
})
it('pinned checksum manifest content hash is checked even when raw presence status accepts it', {timeout:30000},async()=>{
  const dir=root();writeFileSync(join(dir,'checksums.json'),'{}')
  const manifest:Spec={...spec,id:'manifest',fileName:'checksums.json',url:'https://fixture.invalid/checksums',sha256:hash('expected')}
  let calls=0;const manager=new ModelManager({modelsDir:dir,catalog:[manifest,{...spec,url:'https://fixture.invalid/raw',checksumManifest:'checksums.json'}],fetchImpl:async()=>{calls++;throw new Error('unexpected fetch')}})
  await expect(manager.ensureReady({tiers:['minimal']})).rejects.toThrow('model checksum mismatch for https://fixture.invalid/checksums');expect(calls).toBe(0)
})
it('caller group order creates overlapping tier controllers: later cancellation purges the surviving first transfer', {timeout:30000},async()=>{
  const dir=root();const entered=deferred();const resume=deferred();const signals:AbortSignal[]=[];let calls=0
  const manager=new ModelManager({modelsDir:dir,catalog:[{...spec,url:'https://fixture.invalid/raw'}],resolveUrls:s=>[s.url],fetchImpl:async(_url,init)=>{calls++;if(init?.signal)signals.push(init.signal);entered.release();await resume.promise;return new Response('raw')}})
  const first=manager.ensureReady({groups:['asr','vad'],tiers:['minimal']});await entered.promise
  const second=manager.ensureReady({groups:['vad','asr'],tiers:['minimal']});for(let turn=0;turn<20;turn++)await Promise.resolve()
  manager.cancelDownload('minimal');expect(signals.map(signal=>signal.aborted)).toEqual([false]);resume.release()
  const results=await Promise.allSettled([first,second]);expect(results.map(result=>result.status==='fulfilled'?{ready:result.value.ready}:{name:result.reason instanceof Error?result.reason.name:'non-error',message:result.reason instanceof Error?result.reason.message:String(result.reason)})).toMatchSnapshot();expect(calls).toBe(1);expect(existsSync(join(dir,spec.fileName))).toMatchSnapshot('file retained')
})
