import './fixtures/audit-isolation'
import { tarSkipReason } from './fixtures/audit-prerequisites'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { NODE, TSX } from './fixtures/process-runtime'
const child = `
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ModelManager } from '@vidbee/transcription';
const root=process.env.MODEL_FIXTURE_ROOT;const role=process.env.MODEL_FIXTURE_ROLE;
const wait=async name=>{while(!existsSync(join(root,name)))await new Promise(resolve=>setTimeout(resolve,5))};
const modelsDir=join(root,'models');const lock=join(modelsDir,'.downloads/archive.tar.bz2.lock');
if(role==='first'){mkdirSync(lock,{recursive:true});writeFileSync(join(lock,'pid'),String(process.pid));writeFileSync(join(root,'first.locked'),'');await wait('unlock');rmSync(lock,{recursive:true})}
const requests=[];
const manager=new ModelManager({modelsDir,catalog:[{id:'fixture',fileName:'tiny/model.onnx',url:'https://fixture.invalid/archive.tar.bz2',tier:'minimal',required:true,group:'asr',role:'asr-model'}],resolveUrls:s=>[s.url],fetchImpl:async(url,init)=>{if(role==='second')await wait('first.staged');requests.push({url,method:init?.method??'GET',keys:Object.keys(init??{}),aborted:init?.signal?.aborted??null});const bytes=readFileSync(join(root,'fixture.tar.bz2'));return init?.method==='HEAD'?new Response(null,{headers:{'content-length':String(bytes.length)}}):new Response(bytes)},afterArchiveStaged:async()=>{writeFileSync(join(root,role+'.staged'),'');await wait(role+'.publish')}});
const pending=manager.ensureReady({tiers:['minimal']});writeFileSync(join(root,role+'.began'),'');const result=await pending;console.log(JSON.stringify({ready:result.ready,requests}));
`
const waitFor = async (path:string):Promise<void> => { for(const deadline=Date.now()+50000;Date.now()<deadline;){if(existsSync(path))return;await new Promise(resolve=>setTimeout(resolve,5))}throw new Error('fixture marker did not arrive') }
test('two pinned Node processes respect live PID lock, stage concurrently and retain publication winner', {timeout:60000,skip:tarSkipReason},async t=>{
  const dir=mkdtempSync(join(tmpdir(),'model-process-'));mkdirSync(join(dir,'tiny'));writeFileSync(join(dir,'tiny/model.onnx'),'shared archive bytes');execFileSync('tar',['-cjf',join(dir,'fixture.tar.bz2'),'-C',dir,'tiny'])
  const children:ReturnType<typeof spawn>[]=[];t.after(()=>{for(const process of children)if(process.exitCode===null)process.kill('SIGKILL');rmSync(dir,{recursive:true,force:true})})
  const launch=(role:string)=>{const process=spawn(NODE,['--import',TSX,'--input-type=module','-e',child],{env:{...globalThis.process.env,MODEL_FIXTURE_ROOT:dir,MODEL_FIXTURE_ROLE:role},detached:globalThis.process.platform!=='win32',stdio:['ignore','pipe','pipe']});children.push(process);let stdout='';let stderr='';process.stdout?.on('data',value=>{stdout+=String(value)});process.stderr?.on('data',value=>{stderr+=String(value)});const done=new Promise<string>((resolve,reject)=>{process.on('error',reject);process.on('close',code=>code===0?resolve(stdout):reject(new Error(`child code ${code}: ${stderr}`)))});void done.catch(()=>{});return {process,done}}
  const first=launch('first');await waitFor(join(dir,'first.locked'));const second=launch('second');await waitFor(join(dir,'second.began'))
  assert.equal(readFileSync(join(dir,'models/.downloads/archive.tar.bz2.lock/pid'),'utf8'),String(first.process.pid));assert.equal(existsSync(join(dir,'models/tiny/model.onnx')),false)
  writeFileSync(join(dir,'unlock'),'');await Promise.all([waitFor(join(dir,'first.staged')),waitFor(join(dir,'second.staged'))]);writeFileSync(join(dir,'first.publish'),'');const firstResult=JSON.parse(await first.done);writeFileSync(join(dir,'second.publish'),'');const secondResult=JSON.parse(await second.done)
  assert.deepEqual(firstResult,{ready:true,requests:[{url:'https://fixture.invalid/archive.tar.bz2',method:'HEAD',keys:['method','signal'],aborted:false},{url:'https://fixture.invalid/archive.tar.bz2',method:'GET',keys:['signal'],aborted:false}]})
  assert.deepEqual(secondResult,{ready:true,requests:[{url:'https://fixture.invalid/archive.tar.bz2',method:'HEAD',keys:['method','signal'],aborted:false}]})
  assert.equal(readFileSync(join(dir,'models/tiny/model.onnx'),'utf8'),'shared archive bytes');assert.deepEqual(readdirSync(join(dir,'models/.downloads')).sort(),['archive.tar.bz2','archive.tar.bz2.extracted'])
})
