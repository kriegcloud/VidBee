import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, symlinkSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
import * as reference from '../../../fixtures/cli-pre-port/library.mjs';
const repo=fileURLToPath(new URL('../../../',import.meta.url));
const scratch=mkdtempSync(join(tmpdir(),'cli-edge-'));
const root=join(scratch,'run');
const node=process.execPath;
const referenceBytes=readFileSync(join(repo,'fixtures/cli-pre-port/index.mjs'));
let candidateBytes,candidate,server,base,live,requests=[],reply;
before(async()=>{
  const options={bundle:true,format:'esm',platform:'node',target:'node20',external:['better-sqlite3','electron','yt-dlp-wrap-plus','@opentelemetry/api'],write:false,absWorkingDir:repo};
  candidateBytes=(await build({...options,entryPoints:['apps/cli/src/bin.ts'],outfile:join(scratch,'candidate.mjs')})).outputFiles[0].contents;
  const bytes=(await build({...options,entryPoints:['apps/cli/test/candidate.ts'],outfile:join(scratch,'library.mjs')})).outputFiles[0].contents;
  writeFileSync(join(scratch,'library.mjs'),bytes);symlinkSync(join(repo,'node_modules'),join(scratch,'node_modules'));candidate=await import(pathToFileURL(join(scratch,'library.mjs')));
  live=spawn(node,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
  server=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;requests.push({method:req.method,url:req.url,headers:req.headers,body});res.setHeader('Content-Type','application/json');res.end(reply(req.url,body));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{live?.kill('SIGKILL');server?.closeAllConnections();await new Promise(r=>server.close(r));});
process.on('exit',code=>{if(code===0)rmSync(scratch,{recursive:true,force:true});else process.stderr.write(`CLI edge evidence: ${scratch}\n`);});
function prepare(bytes,packages){
  rmSync(root,{recursive:true,force:true});
  for(const dir of ['bundle/dist/bin','home/.config/VidBee','config','cache','data','state','runtime','tmp','cwd','bin'])mkdirSync(join(root,dir),{recursive:true});
  symlinkSync(join(repo,'node_modules'),join(root,'bundle/node_modules'));
  writeFileSync(join(root,'bundle/dist/index.mjs'),bytes);copyFileSync(join(repo,'fixtures/cli-pre-port/bin/vidbee.mjs'),join(root,'bundle/dist/bin/vidbee.mjs'));
  const paths=[join(root,'bundle/package.json'),join(root,'package.json'),join(scratch,'package.json')];
  for(const [index,path] of paths.entries())writeFileSync(path,packages?.[index]??(index===0?'{"name":"@vidbee/cli","version":"0.1.0"}':'{}'));
  const descriptor=JSON.stringify({version:1,host:'127.0.0.1',port:server.address().port,pid:live.pid,pidStartedAt:1});
  writeFileSync(join(root,'descriptor.json'),descriptor);writeFileSync(join(root,'home/.config/VidBee/automation.json'),descriptor);writeFileSync(join(root,'mcp.json'),'{}');
  writeFileSync(join(root,'passwd'),`root:x:0:0:Fixture:${join(root,'home')}:/bin/sh\n`);
  writeFileSync(join(root,'bin/yt-dlp'),`#!${node}\nprocess.stdout.write('fixture');\n`,{mode:0o755});
  requests=[];
  reply=url=>url.endsWith('/handshake')?'{"token":"renewed","expiresAt":8000000000000000}':url.endsWith('/stats')?'{"queued":0}':'{}';
}
function env(){return {HOME:join(root,'home'),TMPDIR:join(root,'tmp'),XDG_CONFIG_HOME:join(root,'config'),XDG_CACHE_HOME:join(root,'cache'),XDG_DATA_HOME:join(root,'data'),XDG_STATE_HOME:join(root,'state'),XDG_RUNTIME_DIR:join(root,'runtime'),APPDATA:join(root,'config'),LOCALAPPDATA:join(root,'data'),VIDBEE_AUTOMATION_DESCRIPTOR:join(root,'descriptor.json'),VIDBEE_MCP_CONFIG:join(root,'mcp.json'),PATH:join(root,'bin'),YTDLP_PATH:join(root,'bin/yt-dlp'),LANG:'C.UTF-8',LC_ALL:'C.UTF-8',TZ:'UTC',CLI_FIXTURE_ROOT:root,CLI_FAKE_BASE:base,CLI_LIVE_PID:String(live.pid)};}
function capture(command,args,environment){return new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd:join(root,'cwd'),env:environment});const stdout=[],stderr=[];const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('edge fixture deadline'));},30000);child.on('error',reject);child.stdout.on('data',b=>stdout.push(b));child.stderr.on('data',b=>stderr.push(b));child.on('close',(code,signal)=>{clearTimeout(timer);resolve({stdout:Buffer.concat(stdout),stderr:Buffer.concat(stderr),code,signal,requests:[...requests]});});});}
async function invoke(bytes,args,options={}){
  prepare(bytes,options.packages);const environment={...env(),...options.env};
  if(options.homeAbsent){for(const key of ['HOME','XDG_CONFIG_HOME','VIDBEE_AUTOMATION_DESCRIPTOR'])delete environment[key];return capture('/usr/bin/unshare',['-Urm','/bin/sh','-c','/usr/bin/mount --bind "$1" /etc/passwd && shift && exec "$@"','cli-account',join(root,'passwd'),node,'--import',join(repo,'apps/cli/test/guard.mjs'),join(root,'bundle/dist/index.mjs'),...args],environment);}
  return capture(node,['--import',join(repo,'apps/cli/test/guard.mjs'),join(root,options.shim?'bundle/dist/bin/vidbee.mjs':'bundle/dist/index.mjs'),...args.map(v=>v==='@BASE@'?base:v)],environment);
}
test('HOME absent uses isolated-account OS fallback and reads only its synthetic descriptor',{timeout:90000},async()=>{
  const old=await invoke(referenceBytes,['--vidbee-no-autostart',':status'],{homeAbsent:true});
  const actual=await invoke(candidateBytes,['--vidbee-no-autostart',':status'],{homeAbsent:true});
  assert.deepEqual(actual,old);assert.equal(actual.code,0);assert.equal(JSON.parse(actual.stdout).result.queued,0);
  const trace=readFileSync(join(root,'trace.jsonl'),'utf8');assert.ok(trace.includes(join(root,'home/.config/VidBee/automation.json')));
});
test('all three bundle-relative version candidates, malformed files and fallback are ordered',{timeout:120000},async()=>{
  const valid=version=>JSON.stringify({name:'@vidbee/cli',version});
  for(const packages of [[valid('first'),valid('second'),valid('third')],['{',valid('second'),valid('third')],['null','{}',valid('third')],['{}','null','{']]){
    const old=await invoke(referenceBytes,[':version'],{packages});const actual=await invoke(candidateBytes,[':version'],{packages});assert.deepEqual(actual,old);
    if (actual.stdout.length === 0) { assert.notEqual(actual.code,0); assert.ok(actual.stderr.length>0); continue; }
    assert.equal(JSON.parse(actual.stdout).result.cli,packages[0]===valid('first')?'first':packages[1]===valid('second')?'second':packages[2]===valid('third')?'third':'0.0.0-dev');
  }
});
test('platform cache defaults retain empty environment strings and injected homedir',{timeout:30000},()=>{
  const platform=os.platform,home=os.homedir;const original={XDG_CACHE_HOME:process.env.XDG_CACHE_HOME,LOCALAPPDATA:process.env.LOCALAPPDATA};
  try{
    os.homedir=()=>'/fixture/home';
    for(const current of ['linux','darwin','win32'])for(const value of [undefined,'','/fixture/cache']){
      os.platform=()=>current;syncBuiltinESMExports();
      for(const key of Object.keys(original)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
      assert.equal(candidate.defaultCachePath(),reference.defaultCachePath());
      assert.equal(reference.defaultCachePath(),current==='darwin'?'/fixture/home/Library/Caches/VidBee/cli-upgrade-check.json':current==='win32'?join(value??'/fixture/home/AppData/Local','VidBee/cli-upgrade-check.json'):join(value??'/fixture/home/.cache','vidbee/cli-upgrade-check.json'));
    }
  }finally{os.platform=platform;os.homedir=home;syncBuiltinESMExports();for(const [key,value]of Object.entries(original)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
test('external add null/malformed/scalar and loose get failures keep their separate failure locations',{timeout:30000},async()=>{
  const scenarios=[['add','null'],['add','{'],['add','false'],['add','0'],['add','"scalar"'],['get','null'],['get','false'],['get','0'],['get','"scalar"'],['get','{"task":null}']];
  for(const [op,body]of scenarios){
    const observe=async module=>{const client=new module.AutomationClient({baseUrl:'http://fixture.invalid',token:'fixture',skipHandshake:true,fetch:async url=>({ok:true,status:200,statusText:'OK',text:async()=>url.endsWith('/'+op)?body:'{"task":{"id":"fixed","status":"completed"}}'})});try{return {value:await client.add({input:{url:'https://example.invalid/v'}})};}catch(error){return {name:error.name,message:error.message,code:error.code,status:error.status};}};
    assert.deepEqual(await observe(candidate),await observe(reference));
  }
  for(const module of [reference,candidate]){const client=new module.AutomationClient({baseUrl:'http://fixture.invalid'});client.rawFetch=async()=>({ok:true,status:200,json:{token:'fixture',expiresAt:NaN},bodyText:'injected NaN'});const result=await client.handshake();assert.ok(Number.isNaN(result.expiresAt));} // section 9 deliberate finite-expiry change
});
test('invalid UTF-8 descriptor decoding and complete split UTF-8/BOM probe bytes',{timeout:30000},async()=>{
  prepare(candidateBytes);
  const path=join(root,'invalid-utf8.json');writeFileSync(path,Buffer.concat([Buffer.from('{"version":1,"host":"'),Buffer.from([255]),Buffer.from(`","port":1,"pid":${live.pid},"pidStartedAt":1}`)]));
  assert.deepEqual(candidate.readDescriptor({pathOverride:path}),reference.readDescriptor({pathOverride:path}));assert.equal(reference.readDescriptor({pathOverride:path}).descriptor.host,'�');
  const {EventEmitter}=await import('node:events');
  for(const module of [reference,candidate]){
    const result=await module.runProbe({argv:[],ytDlpPath:'/fixture/executable',stderrTailBytes:2,spawner:()=>{const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>{};queueMicrotask(()=>{child.stdout.emit('data',Buffer.from([239,187]));child.stdout.emit('data',Buffer.from([191,226,130]));child.stdout.emit('data',Buffer.from([172,255]));child.stderr.emit('data',Buffer.from([226,130,172]));child.emit('close',0);});return child;}});
    assert.equal(result.stdout,'﻿€�');assert.equal(result.stderr,'��');
  }
});
test('VIDBEE_API and VIDBEE_TOKEN remain unused ambient variables',{timeout:30000},async()=>{
  for(const bytes of [referenceBytes,candidateBytes]){const result=await invoke(bytes,[':status'],{env:{VIDBEE_API:'http://unreachable.invalid',VIDBEE_TOKEN:'unused-fixture-token'}});assert.equal(result.code,0);assert.ok(result.requests[0].url.endsWith('/handshake'));assert.equal(result.requests[0].headers.authorization,undefined);assert.equal(result.requests[1].headers.authorization,'Bearer renewed');}
});
test('old shim import-error bytes retain the emitted newline terminator',{timeout:30000},async()=>{
  prepare(Buffer.from("throw Error('fixture import failure');"));
  const result=await capture(node,[join(root,'bundle/dist/bin/vidbee.mjs')],env());assert.equal(result.code,2);assert.equal(result.stdout.length,0);assert.equal(result.stderr.toString(),'{"ok":false,"code":"UNKNOWN_ERROR","message":"fixture import failure"}\n');
});
test('ordinary detached local admissions retain their declared generated-field projection',{timeout:90000},async()=>{
  const projections=[];
  for(const bytes of [referenceBytes,candidateBytes]){const result=await invoke(bytes,['--vidbee-local','https://example.invalid/v']);assert.equal(result.code,0);assert.equal(result.stderr.length,0);const envelope=JSON.parse(result.stdout);assert.equal(typeof envelope.task.id,'string');assert.ok(envelope.task.id.length>0);delete envelope.task.id;projections.push(envelope);}
  assert.deepEqual(projections[0],projections[1]);assert.equal(projections[0].mode,'download');
});
