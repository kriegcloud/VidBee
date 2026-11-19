import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { buildTranscriptionInput, extractMonoWav, MemoryTranscriptStore, modelVersion, TranscriptionExecutor } from '@vidbee/transcription-legacy'
import { executable, NODE } from './fixtures/process-runtime'
import childProcess from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
const waitFor=async(condition:()=>boolean)=>{for(let index=0;index<2000;index++){if(condition())return;await delay(5)}throw new Error('owned pipe fixture condition not reached')}
for(const descriptor of [1,2] as const)test(`audio ${descriptor===1?'conversion stdout':'duration-probe stderr'} remains unread until test drains owned pipe`,{timeout:60000,skip:process.platform!=='linux'},async(t)=>{
  const root=mkdtempSync(join(tmpdir(),'vidbee-audio-pipe-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const source=join(root,'source');writeFileSync(source,'media');const pidFile=join(root,'pid');const blocked=join(root,'blocked');const flushed=join(root,'flushed');const payloadSize=8*1024*1024
  const fill=`const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(pidFile)},String(process.pid));const accepted=process.${descriptor===1?'stdout':'stderr'}.write(Buffer.alloc(${payloadSize},120),()=>{fs.writeFileSync(${JSON.stringify(flushed)},'flushed');finish()});fs.writeFileSync(${JSON.stringify(blocked)},JSON.stringify(accepted));`
  executable(root,'ffprobe',descriptor===2?`if(process.argv.at(-1).endsWith('source')&&process.argv.includes('format=duration')){const finish=()=>process.stdout.write('3.6\\n');${fill}}else console.log('3.6')`:"console.log(process.argv.includes('stream=codec_type')?'audio':'3.6')")
  const ffmpeg=executable(root,'ffmpeg',descriptor===1?`const finish=()=>require('node:fs').writeFileSync(process.argv.at(-1),'wave');${fill}`:"require('node:fs').writeFileSync(process.argv.at(-1),'wave')")
  const owned:ChildProcess[]=[];const originalSpawn=childProcess.spawn
  t.mock.method(childProcess,'spawn',(...args:Parameters<typeof childProcess.spawn>)=>{const child=originalSpawn(...args);owned.push(child);return child});syncBuiltinESMExports();t.after(()=>{for(const child of owned)child.kill('SIGKILL');t.mock.restoreAll();syncBuiltinESMExports()})
  let settled=false;const pending=extractMonoWav({sourceFilePath:source,ffmpegPath:ffmpeg,outputDir:join(root,'out')}).finally(()=>{settled=true});void pending.catch(()=>{})
  await waitFor(()=>existsSync(blocked));assert.equal(readFileSync(blocked,'utf8'),'false');assert.equal(existsSync(flushed),false);assert.equal(settled,false)
  const pid=Number(readFileSync(pidFile,'utf8'));t.after(()=>{try{process.kill(pid,'SIGKILL')}catch{}});assert.doesNotThrow(()=>process.kill(pid,0))
  const child=owned.find(child=>child.pid===pid);assert.ok(child);const stream=descriptor===1?child.stdout:child.stderr;assert.ok(stream);assert.equal(stream.listenerCount('data'),0)
  let bytes=0;stream.on('data',(chunk:Buffer)=>{bytes+=chunk.length});const result=await pending;assert.equal(settled,true);assert.equal(bytes,payloadSize);assert.equal(existsSync(flushed),true);assert.deepEqual(result,{wavPath:join(root,'out','audio-16k-mono.wav'),durationMs:3600});assert.throws(()=>process.kill(pid,0))
})
test('active extraction cancellation requests TERM and waits for a TERM-ignoring conversion to close', {timeout:60000},async(t)=>{
  const root=mkdtempSync(join(tmpdir(),'vidbee-audio-cancel-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const source=join(root,'source');writeFileSync(source,'media');const ready=join(root,'ready');const term=join(root,'term');const release=join(root,'release')
  const ffmpeg=executable(root,'ffmpeg',`const fs=require('node:fs');process.on('SIGTERM',()=>fs.writeFileSync(${JSON.stringify(term)},'term'));fs.writeFileSync(${JSON.stringify(ready)},String(process.pid));const timer=setInterval(()=>{if(fs.existsSync(${JSON.stringify(release)})){clearInterval(timer);process.stderr.write('fixture aborted');process.exitCode=7}},5)`)
  const abort=new AbortController();let settled=false;const pending=extractMonoWav({sourceFilePath:source,ffmpegPath:ffmpeg,outputDir:join(root,'out'),signal:abort.signal}).finally(()=>{settled=true});void pending.catch(()=>{})
  await waitFor(()=>existsSync(ready));const pid=Number(readFileSync(ready,'utf8'));t.after(()=>{try{process.kill(pid,'SIGKILL')}catch{}});abort.abort();assert.equal(settled,false);await waitFor(()=>existsSync(term));assert.equal(settled,false);assert.doesNotThrow(()=>process.kill(pid,0));writeFileSync(release,'release')
  await assert.rejects(pending,{name:'Error',message:'ffmpeg conversion failed (exit 7): fixture aborted'});assert.equal(settled,true);assert.throws(()=>process.kill(pid,0))
})
test('audio duration probe keeps stdin open and unwritten until test-owned EOF release', {timeout:60000},async(t)=>{
  const root=mkdtempSync(join(tmpdir(),'vidbee-audio-stdin-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const source=join(root,'source');writeFileSync(source,'media');const ready=join(root,'ready');const input=join(root,'input');const ended=join(root,'ended')
  executable(root,'ffprobe',`const fs=require('node:fs');if(process.argv.includes('format=duration')&&process.argv.at(-1).endsWith('source')){process.stdin.on('data',x=>fs.writeFileSync(${JSON.stringify(input)},x));process.stdin.on('end',()=>{fs.writeFileSync(${JSON.stringify(ended)},'ended');process.exit(0)});fs.writeFileSync(${JSON.stringify(ready)},String(process.pid));process.stdout.write('3.6\\n')}else console.log(process.argv.includes('stream=codec_type')?'audio':'3.6')`)
  const ffmpeg=executable(root,'ffmpeg',"require('node:fs').writeFileSync(process.argv.at(-1),'wave')");const owned:ChildProcess[]=[];const originalSpawn=childProcess.spawn
  t.mock.method(childProcess,'spawn',(...args:Parameters<typeof childProcess.spawn>)=>{const child=originalSpawn(...args);owned.push(child);return child});syncBuiltinESMExports();t.after(()=>{for(const child of owned)child.kill('SIGKILL');t.mock.restoreAll();syncBuiltinESMExports()})
  let settled=false;const pending=extractMonoWav({sourceFilePath:source,ffmpegPath:ffmpeg,outputDir:join(root,'out')}).finally(()=>{settled=true});void pending.catch(()=>{});await waitFor(()=>existsSync(ready));const pid=Number(readFileSync(ready,'utf8'));const child=owned.find(child=>child.pid===pid);assert.ok(child?.stdin);assert.equal(child.stdin.writableEnded,false);assert.equal(existsSync(input),false);assert.equal(existsSync(ended),false);assert.equal(settled,false);child.stdin.end();assert.deepEqual(await pending,{wavPath:join(root,'out','audio-16k-mono.wav'),durationMs:3600});assert.equal(existsSync(input),false);assert.equal(existsSync(ended),true)
})

test('worker result waits for descendant-held pipes after leader exit before committing', {timeout:60000},async(t)=>{
  const root=mkdtempSync(join(tmpdir(),'vidbee-descendant-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const source=join(root,'source');writeFileSync(source,'media');const ready=join(root,'descendant-ready');const release=join(root,'release');const result={resultKind:'no-speech',language:null,modelVersion,asrTier:'minimal',speakers:[],segments:[]}
  const descendant=executable(root,'descendant',`const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(ready)},String(process.pid));const timer=setInterval(()=>{if(fs.existsSync(${JSON.stringify(release)}))clearInterval(timer)},5)`)
  const worker=executable(root,'worker',`process.on('SIGTERM',()=>process.exit(0));process.stdin.once('data',()=>{require('node:child_process').spawn(${JSON.stringify(NODE)},[${JSON.stringify(descendant)}],{stdio:['ignore','inherit','inherit']});const timer=setInterval(()=>{if(require('node:fs').existsSync(${JSON.stringify(ready)})){clearInterval(timer);process.stdout.write(JSON.stringify({type:'result',result:${JSON.stringify(result)},durationMs:3600})+'\\n')}},5)})`)
  const owned:ChildProcess[]=[];const originalSpawn=childProcess.spawn;t.mock.method(childProcess,'spawn',(...args:Parameters<typeof childProcess.spawn>)=>{const child=originalSpawn(...args);owned.push(child);return child});syncBuiltinESMExports();t.after(()=>{for(const child of owned)child.kill('SIGKILL');t.mock.restoreAll();syncBuiltinESMExports()})
  let settled=false;let finish:()=>void=()=>{};const pending=new Promise<void>(resolve=>finish=resolve);const store=new MemoryTranscriptStore();const executor=new TranscriptionExecutor({store,workerScript:worker,modelsDir:root,workDir:root,resolveFfmpegPath:()=>'/unused',execPath:NODE,forceLayer:'electron',skipProbe:true,backend:'fake'})
  executor.run({taskId:'descendant',attemptId:'attempt',attemptNumber:1,input:buildTranscriptionInput({downloadTaskId:'download',sourceFilePath:source,trigger:'manual'})},{onSpawn(){},onProgress(){},onStd(){},onFinish:event=>{assert.equal(event.result.type,'success');settled=true;finish()}})
  await waitFor(()=>existsSync(ready));const pid=Number(readFileSync(ready,'utf8'));t.after(()=>{try{process.kill(pid,'SIGKILL')}catch{}});const leader=owned[0];assert.ok(leader);if(leader.exitCode===null&&leader.signalCode===null)await new Promise(resolve=>leader.once('exit',resolve));assert.equal(settled,false);assert.equal(store.getByTranscriptionTaskId('descendant'),null);assert.doesNotThrow(()=>process.kill(pid,0));writeFileSync(release,'release');await pending;assert.ok(store.getByTranscriptionTaskId('descendant'))
})
