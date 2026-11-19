import { readFixturePid, killFixtureProcess } from './fixtures/audit-pid'
import './fixtures/audit-isolation'
import { tarSkipReason } from './fixtures/audit-prerequisites'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { test } from 'node:test'
import { NODE, TSX } from './fixtures/process-runtime'
import { appendManifestChunk, ensureChunkManifest, ModelManager, writePipelineSeed, type ModelManagerOptions } from '@vidbee/transcription-legacy'
const seed={language:null,modelVersion:'v',asrTier:null,speakers:[],segments:[{startMs:0,endMs:1,text:'seed',speakerKey:null,confidence:null}]}
const chunk={index:0,startMs:0,endMs:1,text:'chunk',speakerKey:null,confidence:null}
for(const boundary of ['seed','ensure','append'] as const)for(const failure of ['write','rename'] as const)test(`atomic ${boundary} ${failure} failure: cleanup error replaces original error and leaves staging bytes`,{timeout:30000},t=>{
  const dir=fs.mkdtempSync(join(tmpdir(),'publication-cleanup-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}))
  const target=join(dir,boundary==='seed'?'seed.json':'chunks.json')
  if(boundary==='append')ensureChunkManifest({workDir:dir,taskId:'t',fingerprint:'f',modelVersion:'v'})
  const originalWrite=fs.writeFileSync;const originalRename=fs.renameSync;const originalRemove=fs.rmSync
  const originalError=new Error(`fixture ${failure} failure`);const cleanupError=new Error('fixture cleanup failure');const trace:string[]=[]
  fs.writeFileSync=(path,data,options)=>{if(String(path).startsWith(`${target}.tmp.`)){trace.push('write');if(failure==='write'){originalWrite(path,'partial staging bytes',options);throw originalError}}return originalWrite(path,data,options)}
  fs.renameSync=(from,to)=>{if(String(to)===target){trace.push('rename');if(failure==='rename')throw originalError}return originalRename(from,to)}
  fs.rmSync=(path,options)=>{if(String(path).startsWith(`${target}.tmp.`)){trace.push('cleanup');throw cleanupError}return originalRemove(path,options)}
  syncBuiltinESMExports()
  try {assert.throws(()=>{if(boundary==='seed')writePipelineSeed(target,seed);else if(boundary==='ensure')ensureChunkManifest({workDir:dir,taskId:'t',fingerprint:'f',modelVersion:'v'});else appendManifestChunk(target,chunk)},error=>error===cleanupError)}
  finally {fs.writeFileSync=originalWrite;fs.renameSync=originalRename;fs.rmSync=originalRemove;syncBuiltinESMExports()}
  assert.deepEqual(trace,failure==='write'?['write','cleanup']:['write','rename','cleanup'])
  const staging=fs.readdirSync(dir).filter(name=>name.startsWith(`${basename(target)}.tmp.`));assert.equal(staging.length,1);assert.match(staging[0]??'',new RegExp(`^${basename(target).replaceAll('.','\\.')}.tmp.\\d+.[0-9a-f]{12}$`))
  const body=fs.readFileSync(join(dir,staging[0]??''),'utf8')
  if(failure==='write')assert.equal(body,'partial staging bytes')
  else {const value=JSON.parse(body);if(boundary==='seed')assert.deepEqual(value,seed);else assert.deepEqual(value,{key:{taskId:'t',fingerprint:'f',modelVersion:'v'},durationMs:null,speakers:[],turns:[],chunks:boundary==='append'?[chunk]:[],stages:[]})}
  assert.equal(fs.existsSync(target),boundary==='append')
})
type Spec=NonNullable<ModelManagerOptions['catalog']>[number]
const archiveFixture=(dir:string)=>{const source=join(dir,'source');for(const name of ['root-a','root-b']){fs.mkdirSync(join(source,name),{recursive:true});fs.writeFileSync(join(source,name,'model.onnx'),`${name} published`)}const tar=join(dir,'fixture.tar.bz2');execFileSync('tar',['-cjf',tar,'-C',source,'root-a','root-b']);return fs.readFileSync(tar)}
for(const failure of ['remove-second','rename-second','after-first'] as const)test(`multi-root publication ${failure} retains earlier published root and exact partial residue`,{timeout:30000,skip:tarSkipReason},async t=>{
  const dir=fs.mkdtempSync(join(tmpdir(),'publication-roots-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const bytes=archiveFixture(dir);const modelsDir=join(dir,'models')
  for(const name of ['root-a','root-b']){fs.mkdirSync(join(modelsDir,name),{recursive:true});fs.writeFileSync(join(modelsDir,name,'stale'),'stale before publication')}
  const catalog:Spec[]=['root-a','root-b'].map((name,index)=>({id:name,fileName:`${name}/model.onnx`,url:'https://fixture.invalid/archive.tar.bz2',required:true,group:'asr',role:'asr-model',tier:'minimal',bytes:index}))
  const originalRemove=fs.rmSync;const originalRename=fs.renameSync;const trace:string[]=[];const injected=new Error('fixture publication interrupted');let instrumented=false
  const restore=()=>{fs.rmSync=originalRemove;fs.renameSync=originalRename;syncBuiltinESMExports()};t.after(restore)
  const manager=new ModelManager({modelsDir,catalog,resolveUrls:s=>[s.url],fetchImpl:async(_url,init)=>init?.method==='HEAD'?new Response(null,{headers:{'content-length':String(bytes.length)}}):new Response(bytes),afterArchiveStaged:()=>{
    instrumented=true
    fs.rmSync=(path,options)=>{const name=String(path);if(name===join(modelsDir,'root-a')||name===join(modelsDir,'root-b')){trace.push(`remove:${basename(name)}`);if(name===join(modelsDir,'root-b')&&failure==='remove-second')throw injected}return originalRemove(path,options)}
    fs.renameSync=(from,to)=>{const name=String(to);if(name===join(modelsDir,'root-a')||name===join(modelsDir,'root-b')){trace.push(`rename:${basename(name)}`);if(name===join(modelsDir,'root-b')&&failure==='rename-second')throw injected;originalRename(from,to);if(name===join(modelsDir,'root-a')&&failure==='after-first')throw injected;return}return originalRename(from,to)}
    syncBuiltinESMExports()
  }})
  try {await assert.rejects(manager.ensureReady({tiers:['minimal']}),{name:'Error',message:'incomplete model: extraction failed for archive.tar.bz2'})}finally{restore()}
  assert.equal(instrumented,true);assert.equal(fs.readFileSync(join(modelsDir,'root-a/model.onnx'),'utf8'),'root-a published');assert.deepEqual(fs.readdirSync(join(modelsDir,'root-a')),['model.onnx'])
  const oneAttempt=failure==='after-first'?['remove:root-a','rename:root-a']:failure==='remove-second'?['remove:root-a','rename:root-a','remove:root-b']:['remove:root-a','rename:root-a','remove:root-b','rename:root-b'];assert.deepEqual(trace,[...oneAttempt,...oneAttempt])
  if(failure==='rename-second')assert.equal(fs.existsSync(join(modelsDir,'root-b')),false)
  else {assert.deepEqual(fs.readdirSync(join(modelsDir,'root-b')),['stale']);assert.equal(fs.readFileSync(join(modelsDir,'root-b/stale'),'utf8'),'stale before publication')}
  assert.deepEqual(fs.readdirSync(join(modelsDir,'.downloads')),[])
})
for(const mode of ['stale-short','stale-malformed','download-truncated'] as const)test(`archive ${mode}: stale marker never bypasses validation and failed download leaves no archive residue`,{timeout:30000,skip:tarSkipReason},async t=>{
  const dir=fs.mkdtempSync(join(tmpdir(),'publication-malformed-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const bytes=archiveFixture(dir);const modelsDir=join(dir,'models');const downloads=join(modelsDir,'.downloads');fs.mkdirSync(downloads,{recursive:true})
  if(mode!=='download-truncated'){fs.writeFileSync(join(downloads,'archive.tar.bz2'),'invalid cache');fs.writeFileSync(join(downloads,'archive.tar.bz2.extracted'),'ok')}
  const calls:Array<{method:string;keys:string[]}>=[]
  const catalog:Spec[]=['root-a','root-b'].map(name=>({id:name,fileName:`${name}/model.onnx`,url:'https://fixture.invalid/archive.tar.bz2',required:true,group:'asr',role:'asr-model',tier:'minimal'}))
  const manager=new ModelManager({modelsDir,catalog,resolveUrls:s=>[s.url],fetchImpl:async(_url,init)=>{calls.push({method:init?.method??'GET',keys:Object.keys(init??{})});return init?.method==='HEAD'?new Response(null,{headers:mode==='stale-malformed'?{}:{'content-length':String(bytes.length)}}):new Response(mode==='download-truncated'?bytes.subarray(0,8):bytes)}})
  if(mode==='download-truncated'){await assert.rejects(manager.ensureReady({tiers:['minimal']}),{message:'incomplete model: extraction failed for archive.tar.bz2'});assert.deepEqual(fs.readdirSync(downloads),[]);assert.equal(fs.existsSync(join(modelsDir,'root-a')),false)}
  else {assert.equal((await manager.ensureReady({tiers:['minimal']})).ready,true);assert.equal(fs.readFileSync(join(modelsDir,'root-a/model.onnx'),'utf8'),'root-a published');assert.equal(fs.readFileSync(join(modelsDir,'root-b/model.onnx'),'utf8'),'root-b published');assert.deepEqual(fs.readdirSync(downloads).sort(),['archive.tar.bz2','archive.tar.bz2.extracted'])}
  assert.deepEqual(calls,[{method:'HEAD',keys:['method','signal']},{method:'GET',keys:['signal']}])
})
test('tar execFile abort captures stdout/stderr before legacy cancellation mapping and cleans staged extraction',{timeout:120000},async t=>{
  const dir=fs.mkdtempSync(join(tmpdir(),'publication-tar-abort-'));const bin=join(dir,'bin');fs.mkdirSync(bin)
  const marker=join(dir,'started');const stopped=join(dir,'stopped');const pidFile=join(dir,'tar-pid')
  t.after(()=>{if(fs.existsSync(pidFile)&&!fs.existsSync(stopped)){const pid=readFixturePid(pidFile);if(pid!==null)killFixtureProcess(pid,pidFile)}fs.rmSync(dir,{recursive:true,force:true})})
  fs.writeFileSync(join(bin,'tar'),`#!${NODE}\nconst fs=require('node:fs');fs.writeFileSync(${JSON.stringify(pidFile)},String(process.pid)+'\\n');process.on('SIGTERM',()=>{fs.writeFileSync(${JSON.stringify(stopped)},'SIGTERM');process.exit(0)});process.stdout.write('tar stdout before abort\\n',()=>process.stderr.write('tar stderr before abort\\n',()=>fs.writeFileSync(${JSON.stringify(marker)},JSON.stringify(process.argv.slice(2)))));setInterval(()=>{},1000)\n`,{mode:0o755})
  const script=`
import fs from 'node:fs';import util from 'node:util';import childProcess from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
const root=process.env.PUBLICATION_ROOT;const observed=[];let seenStdout=false;let seenStderr=false;const original=util.promisify;
util.promisify=function(fn){const run=original(fn);if(fn!==childProcess.execFile)return run;return async(...args)=>{const operation=run(...args);operation.child.stdout.on('data',()=>{seenStdout=true});operation.child.stderr.on('data',()=>{seenStderr=true});try{return await operation}catch(error){observed.push({name:error.name,code:error.code,message:error.message,stdout:error.stdout,stderr:error.stderr});throw error}}};syncBuiltinESMExports();
const {ModelManager}=await import('@vidbee/transcription-legacy');util.promisify=original;syncBuiltinESMExports();
const wait=async file=>{for(const deadline=Date.now()+100000;Date.now()<deadline;){if(fs.existsSync(file))return;await new Promise(resolve=>setTimeout(resolve,5))}throw new Error('missing tar fixture marker')};
const manager=new ModelManager({modelsDir:root+'/models',catalog:[{id:'model',fileName:'tiny/model.onnx',url:'https://fixture.invalid/archive.tar.bz2',required:true,tier:'minimal',role:'asr-model',group:'asr'}],resolveUrls:s=>[s.url],fetchImpl:async(_url,init)=>init?.method==='HEAD'?new Response(null):new Response('archive bytes')});
const pending=manager.ensureReady({tiers:['minimal']});const result=pending.then(()=>({success:true}),error=>({name:error.name,message:error.message}));await wait(root+'/started');while(!seenStdout||!seenStderr)await new Promise(resolve=>setTimeout(resolve,5));manager.cancelDownload('minimal');const failure=await result;await wait(root+'/stopped');
console.log(JSON.stringify({failure,observed,args:JSON.parse(fs.readFileSync(root+'/started','utf8')).map((arg,index)=>index===1?'<archive>':index===3?'<staging>':arg),signal:fs.readFileSync(root+'/stopped','utf8'),downloads:fs.readdirSync(root+'/models/.downloads').sort(),published:fs.existsSync(root+'/models/tiny')}));
`
  const child=spawn(NODE,['--import',TSX,'--input-type=module','-e',script],{env:{...process.env,PATH:`${bin}:${process.env.PATH??''}`,PUBLICATION_ROOT:dir},detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});t.after(()=>{if(child.exitCode===null){try{process.kill(-child.pid!,'SIGKILL')}catch{child.kill('SIGKILL')}}});let output='';let stderr='';child.stdout.on('data',bytes=>output+=bytes);child.stderr.on('data',bytes=>stderr+=bytes);const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve)});assert.equal(code,0,stderr)
  assert.deepEqual(JSON.parse(output),{failure:{name:'AbortError',message:'download cancelled: minimal'},observed:[{name:'AbortError',code:'ABORT_ERR',message:'The operation was aborted',stdout:'tar stdout before abort\n',stderr:'tar stderr before abort\n'}],args:['-xjf','<archive>','-C','<staging>'],signal:'SIGTERM',downloads:['archive.tar.bz2'],published:false})
})
