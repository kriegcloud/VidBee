import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  createFileProbeCache, formatRuntimeLog, isElectronBinary, nodeBinaryName,
  probeCacheKey, probeWorkerProvider, resolveBundledNodePath, resolveWorkerExecPath, resolveWorkerRuntime
} from '@vidbee/transcription-legacy'
import { executable, NODE } from './fixtures/process-runtime'

const temporary = (t: { after: (fn: () => void) => void }) => {
  const dir = mkdtempSync(join(tmpdir(), 'vidbee-runtime-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}
test('runtime oracle uses pinned Node and retains formatting and binary-name rules', () => {
  assert.equal(process.version, 'v22.23.4'); assert.equal(process.execPath, NODE)
  assert.deepEqual(['linux', 'darwin', 'win32'].map((platform) => nodeBinaryName(platform as NodeJS.Platform)), ['node', 'node', 'node.exe'])
  assert.deepEqual(['Electron', '/x/electron-helper', 'node'].map(isElectronBinary), [true, true, false])
  assert.deepEqual(formatRuntimeLog({execPath:'/fixture/node',version:'22.1',layer:'env',guarded:false},3), ['runtime.path=/fixture/node','runtime.version=22.1','runtime.layer=env','runtime.restarts=3'])
})
test('runtime computes all candidate versions before probing, caches each failed probe, and accepts last failure', {timeout:30000}, async (t) => {
  const dir = temporary(t); const versions = join(dir, 'versions')
  const runtime = (name: string, version: string) => executable(dir, name, `require('node:fs').appendFileSync(${JSON.stringify(versions)},${JSON.stringify(name+'\n')});console.log(${JSON.stringify(version)})`)
  const env = runtime('env','v22.1.0'); const bundled = runtime('bundled','v20.2.0'); const electron = runtime('Electron','not-a-version')
  const trace: unknown[] = []; const cache = {get:(key:string) => {trace.push(['get', key.split(':')[0]]);return undefined},set:(key:string,ok:boolean) => {trace.push(['set',key.split(':')[0],ok])}}
  const promise = resolveWorkerRuntime({envPath:env,bundledPath:bundled,lookUpSystem:false,electronPath:electron,cache,probe:async (value) => {trace.push(['probe',value.layer,readFileSync(versions,'utf8')]);throw new Error('fixture failure')}})
  trace.push('returned'); queueMicrotask(() => trace.push('microtask'))
  const result = await promise
  assert.deepEqual(result,{execPath:electron,layer:'electron',version:'not-a-version',guarded:true})
  assert.deepEqual(trace,[['get','env'],['probe','env','env\nbundled\nElectron\n'],'returned',['set','env',false],['get','bundled'],['probe','bundled','env\nbundled\nElectron\n'],'microtask',['set','bundled',false],['get','Electron'],['probe','electron','env\nbundled\nElectron\n'],['set','Electron',false]])
})
test('runtime cached false skips nonfinal candidate, never re-probes last, and forced missing layer falls back to electron', {timeout:30000}, async (t) => {
  const dir = temporary(t); const node = executable(dir,'node',"console.log('v22.23.4')")
  const calls: unknown[] = []
  const result = await resolveWorkerRuntime({envPath:node,electronPath:node,lookUpSystem:false,cache:{get:()=>false,set:()=>assert.fail('cache write')},probe:async () => {calls.push('probe');return true}})
  assert.equal(result.layer,'electron');assert.deepEqual(calls,[])
  assert.equal((await resolveWorkerRuntime({forceLayer:'bundled',bundledPath:join(dir,'missing'),electronPath:node,lookUpSystem:false})).layer,'electron')
  await assert.rejects(resolveWorkerRuntime({forceLayer:'env',envPath:join(dir,'missing'),electronPath:join(dir,'missing'),lookUpSystem:false}),{name:'Error',message:'no usable transcription worker runtime'})
})
test('probe cache preserves scalar spread, malformed recovery, null traversal failure, and nonboolean values', (t) => {
  const dir=temporary(t);const file=join(dir,'cache.json');const cache=createFileProbeCache(file)
  writeFileSync(file,'{broken');assert.equal(cache.get('a'),undefined);cache.set('a',true);assert.equal(readFileSync(file,'utf8'),'{"a":true}')
  writeFileSync(file,'"ab"');cache.set('ok',false);assert.deepEqual(JSON.parse(readFileSync(file,'utf8')),{'0':'a','1':'b',ok:false})
  writeFileSync(file,'{"ok":"yes"}');assert.equal(cache.get('ok'),'yes')
  writeFileSync(file,'null');assert.throws(()=>cache.get('ok'));cache.set('ok',true);assert.deepEqual(JSON.parse(readFileSync(file,'utf8')),{ok:true})
  assert.equal(probeCacheKey('/fixture/absent/node'),'/fixture/absent/node:missing')
})
for (const scenario of ['success','fallback','error','early','unterminated','noise'] as const) test(`isolated provider probe wire and complete outcome: ${scenario}`, {timeout:30000}, async (t) => {
  const dir=temporary(t);const capture=join(dir,'request.json')
  const response = scenario === 'success' ? `console.log(JSON.stringify({type:'probe-ok',provider:'ignored',durationMs:12.5}));` : scenario === 'fallback' ? `console.log(JSON.stringify({type:'probe-ok',durationMs:8}));process.stderr.write('CUDA execution provider is not available');` : scenario === 'error' ? `console.log(JSON.stringify({type:'error',message:'native failure'}));` : scenario === 'unterminated' ? `process.stdout.write('{"type":"probe-ok","durationMs":1}');` : scenario === 'noise' ? `console.log('unparsed diagnostic');console.log(JSON.stringify({type:'probe-ok',durationMs:null}));process.stderr.write(' extra ');` : ''
  const worker=executable(dir,'worker',`let b='';process.stdin.on('data',x=>b+=x);process.stdin.on('end',()=>{require('node:fs').writeFileSync(${JSON.stringify(capture)},b);${response}})`)
  const result=await probeWorkerProvider({execPath:NODE,workerScript:worker,modelsDir:'/fixture/models',provider:'cuda',asrTier:'minimal',benchmark:true,timeoutMs:1000})
  assert.equal(readFileSync(capture,'utf8'),'{"type":"probe","modelsDir":"/fixture/models","provider":"cuda","asrTier":"minimal","benchmark":true}\n')
  const expected = scenario === 'success' ? {durationMs:12.5,error:null,ok:true,provider:'cuda',stderr:''} : scenario === 'fallback' ? {durationMs:8,error:'cuda silently fell back to cpu',ok:false,provider:'cuda',stderr:'CUDA execution provider is not available'} : scenario === 'error' ? {durationMs:null,error:'native failure',ok:false,provider:'cuda',stderr:''} : scenario === 'noise' ? {durationMs:null,error:null,ok:true,provider:'cuda',stderr:'unparsed diagnostic\n extra'} : {durationMs:null,error:'provider probe process closed early',ok:false,provider:'cuda',stderr:scenario === 'unterminated' ? '{"type":"probe-ok","durationMs":1}' : ''}
  assert.deepEqual(result,expected)
})
for(const scenario of ['timeout','max-buffer'] as const)test(`runtime synchronous executable ${scenario} failure is swallowed with captured output before electron fallback`,{timeout:120000},async(t)=>{
  const root=temporary(t);const candidate=executable(root,'candidate',scenario==='timeout'?"process.stdout.write('partial-version');setInterval(()=>{},1000)":"process.stdout.write('v22.'.repeat(600000))")
  const childProcess=await import('node:child_process');const {syncBuiltinESMExports}=await import('node:module');const original=childProcess.default.execFileSync;const observations:unknown[]=[]
  t.mock.method(childProcess.default,'execFileSync',(file:string,args:readonly string[],options:{encoding:'utf8';timeout:number;env:NodeJS.ProcessEnv})=>{
    assert.deepEqual(args,['-v']);assert.deepEqual(Object.keys(options).sort(),['encoding','env','timeout']);assert.equal(options.encoding,'utf8');assert.equal(options.timeout,8000);assert.equal(options.env.ELECTRON_RUN_AS_NODE,'1')
    try{return original(file,args,options)}catch(error){assert.ok(error instanceof Error);assert.ok('code' in error);assert.equal(error.code,scenario==='timeout'?'ETIMEDOUT':'ENOBUFS');assert.ok('stdout' in error);assert.equal(typeof error.stdout,'string');const out=error.stdout;if(typeof out==='string'){if(scenario==='timeout')assert.equal(out,'partial-version');else{assert.ok(out.length>1024*1024);assert.equal(out,'v22.'.repeat(Math.ceil(out.length/4)).slice(0,out.length))}}observations.push({code:error.code,capturedOutputVerified:true});throw error}
  });syncBuiltinESMExports();t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports()})
  const runtime=await resolveWorkerRuntime({envPath:candidate,electronPath:NODE,lookUpSystem:false,bundledPath:join(root,'missing')});assert.deepEqual(runtime,{execPath:NODE,layer:'electron',version:'22.23.4',guarded:true});assert.deepEqual(observations,[{code:scenario==='timeout'?'ETIMEDOUT':'ENOBUFS',capturedOutputVerified:true}])
})

test('bundled and path-only runtime exports preserve explicit environment, resource and preferred ordering without baseline validation',(t)=>{
  const root=temporary(t);const savedNode=process.env.VIDBEE_TRANSCRIPTION_NODE;const savedBundled=process.env.VIDBEE_BUNDLED_NODE;t.after(()=>{if(savedNode===undefined)delete process.env.VIDBEE_TRANSCRIPTION_NODE;else process.env.VIDBEE_TRANSCRIPTION_NODE=savedNode;if(savedBundled===undefined)delete process.env.VIDBEE_BUNDLED_NODE;else process.env.VIDBEE_BUNDLED_NODE=savedBundled})
  const preferred=join(root,'preferred');const environment=join(root,'environment');const bundled=join(root,'Electron-bundled');const electron=join(root,'Electron-preferred');const resources=join(root,'resources');const resourceBinary=join(resources,'node',nodeBinaryName());mkdirSync(join(resources,'node'),{recursive:true});for(const file of [preferred,environment,bundled,electron,resourceBinary])writeFileSync(file,'not an executable')
  process.env.VIDBEE_TRANSCRIPTION_NODE=environment;process.env.VIDBEE_BUNDLED_NODE=bundled;assert.equal(resolveBundledNodePath([resources]),bundled);assert.equal(resolveWorkerExecPath(preferred),preferred);assert.equal(resolveWorkerExecPath(electron),environment);assert.equal(resolveWorkerExecPath(join(root,'missing')),environment)
  delete process.env.VIDBEE_TRANSCRIPTION_NODE;assert.equal(resolveWorkerExecPath(),bundled);delete process.env.VIDBEE_BUNDLED_NODE;assert.equal(resolveBundledNodePath([resources]),resourceBinary)
})
test('provider probe timeout reaps the owned TERM-ignoring process before resolving', {timeout:30000},async(t)=>{
  const root=temporary(t);const ready=join(root,'ready');const term=join(root,'term');const worker=executable(root,'worker',`const fs=require('node:fs');process.on('SIGTERM',()=>fs.writeFileSync(${JSON.stringify(term)},'term'));fs.writeFileSync(${JSON.stringify(ready)},String(process.pid));setInterval(()=>{},1000)`)
  const {setTimeout:delay}=await import('node:timers/promises');t.mock.timers.enable({apis:['setTimeout']});let settled=false;const pending=probeWorkerProvider({execPath:NODE,workerScript:worker,modelsDir:'/fixture/models',provider:'cuda',timeoutMs:10}).then(result=>{settled=true;return result})
  for(let index=0;index<2000&&!existsSync(ready);index++)await delay(5);assert.equal(existsSync(ready),true);const pid=Number(readFileSync(ready,'utf8'));t.after(()=>{try{process.kill(pid,'SIGKILL')}catch{}});t.mock.timers.tick(10)
  for(let index=0;index<2000&&!existsSync(term);index++)await delay(5);assert.equal(existsSync(term),true);assert.equal(settled,false);assert.doesNotThrow(()=>process.kill(pid,0));t.mock.timers.tick(1000)
  assert.deepEqual(await pending,{durationMs:null,error:'provider probe timed out',ok:false,provider:'cuda',stderr:''});assert.throws(()=>process.kill(pid,0))
})
test('provider probe missing executable failure resolves its exact public failure', {timeout:30000},async(t)=>{
  const root=temporary(t);assert.deepEqual(await probeWorkerProvider({execPath:join(root,'missing'),workerScript:'/fixture/worker',modelsDir:'/fixture/models',provider:'cpu',timeoutMs:1000}),{durationMs:null,error:'provider probe process failed',ok:false,provider:'cpu',stderr:''})
})
test('provider probe clips stderr to 12000 characters and waits its trailing 50ms flush before reaping', {timeout:30000},async(t)=>{
  const root=temporary(t);const ready=join(root,'ready');const later=join(root,'later');const marker='native-tail';const worker=executable(root,'worker',`const fs=require('node:fs');process.stdin.once('data',()=>{process.stderr.write('x'.repeat(13000));process.stdout.write(JSON.stringify({type:'probe-ok',durationMs:42})+'\\n');fs.writeFileSync(${JSON.stringify(ready)},String(process.pid));const timer=setInterval(()=>{if(fs.existsSync(${JSON.stringify(later)})){clearInterval(timer);process.stderr.write(${JSON.stringify(marker)})}},1)})`)
  const childProcess=await import('node:child_process');const {syncBuiltinESMExports}=await import('node:module');const originalSpawn=childProcess.default.spawn;let stdoutSeen:()=>void=()=>{};let stderrSeen:()=>void=()=>{};const stdoutReady=new Promise<void>(resolve=>stdoutSeen=resolve);const stderrReady=new Promise<void>(resolve=>stderrSeen=resolve)
  t.mock.method(childProcess.default,'spawn',(...args:Parameters<typeof childProcess.default.spawn>)=>{const child=originalSpawn(...args);child.stdout?.on('data',(chunk:Buffer)=>{if(chunk.toString().includes('probe-ok'))stdoutSeen()});let tail='';child.stderr?.on('data',(chunk:Buffer)=>{tail+=chunk.toString();if(tail.includes(marker))stderrSeen()});return child});syncBuiltinESMExports();t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports()})
  const {setTimeout:delay}=await import('node:timers/promises');t.mock.timers.enable({apis:['setTimeout']});let settled=false;const pending=probeWorkerProvider({execPath:NODE,workerScript:worker,modelsDir:'/fixture/models',provider:'cpu',timeoutMs:500}).then(result=>{settled=true;return result})
  for(let index=0;index<2000&&!existsSync(ready);index++)await delay(5);assert.equal(existsSync(ready),true);const pid=Number(readFileSync(ready,'utf8'));t.after(()=>{try{process.kill(pid,'SIGKILL')}catch{}})
  await stdoutReady;assert.equal(settled,false);writeFileSync(later,'release');await stderrReady;t.mock.timers.tick(49);assert.equal(settled,false);assert.doesNotThrow(()=>process.kill(pid,0));t.mock.timers.tick(1)
  assert.deepEqual(await pending,{durationMs:42,error:null,ok:true,provider:'cpu',stderr:'x'.repeat(12000-marker.length)+marker});assert.throws(()=>process.kill(pid,0))
})
