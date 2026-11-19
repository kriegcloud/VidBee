import { readFixturePid, requireFixturePid, killFixtureProcess } from './fixtures/audit-pid'
import './fixtures/audit-isolation'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { extractEmbeddedCaptionTracks, extractMonoWav, readPcmWav } from '@vidbee/transcription'
import { executable, NODE, workerArgs } from './fixtures/process-runtime'

function temporary(t: {after:(fn:()=>void)=>void}) {const dir=mkdtempSync(join(tmpdir(),'vidbee-process-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir}
const waitFor = async (condition:()=>boolean):Promise<void> => {for(const deadline=Date.now()+25000;Date.now()<deadline;){if(condition())return;await delay(5)}throw new Error('fixture condition not reached')}
function compare(name:string,value:unknown,root:string) {
  const normalized=JSON.parse(JSON.stringify(value).split(root).join('<ROOT>'))
  const file=new URL(`./fixtures/process-${name}.json`,import.meta.url)
  if(process.env.VIDBEE_RECORD_CHARACTERIZATION==='1')writeFileSync(file,`${JSON.stringify(normalized,null,2)}\n`)
  assert.deepEqual(normalized,JSON.parse(readFileSync(file,'utf8')))
}
for(const mode of ['normal','cached','truncated','no-audio','conversion-error','empty','pre-abort'] as const) test(`audio extraction exact child protocol and residue: ${mode}`,{timeout:30000},async(t)=>{
  const dir=temporary(t);const calls=join(dir,'calls');const source=join(dir,'source.media');const output=join(dir,'out');writeFileSync(source,'source')
  executable(dir,'ffprobe',`const fs=require('node:fs');fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(['probe',process.argv.slice(2)])+'\\n');if(process.argv.includes('stream=codec_type'))console.log(${JSON.stringify(mode==='no-audio'?'':'audio')});else console.log(${mode==='truncated'?"process.argv.at(-1).endsWith('source.media')?'10':'1'":"'3.6'"})`)
  const ffmpeg=executable(dir,'ffmpeg',`const fs=require('node:fs');fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(['convert',process.argv.slice(2)])+'\\n');${mode==='conversion-error'?"process.stderr.write('x'.repeat(2100));process.exitCode=7":mode==='empty'?'':"fs.mkdirSync(require('node:path').dirname(process.argv.at(-1)),{recursive:true});fs.writeFileSync(process.argv.at(-1),'wave')"}`)
  if(mode==='cached'){const {mkdirSync}=await import('node:fs');mkdirSync(output);writeFileSync(join(output,'audio-16k-mono.wav'),'cached')}
  const abort=new AbortController();if(mode==='pre-abort')abort.abort()
  let result:unknown
  try{result=await extractMonoWav({sourceFilePath:source,ffmpegPath:ffmpeg,outputDir:output,signal:abort.signal})}catch(error){assert.ok(error instanceof Error);result={name:error.name,message:error.message}}
  const trace=existsSync(calls)?readFileSync(calls,'utf8').trim().split('\n').map(line=>JSON.parse(line)):[]
  compare(`audio-${mode}`,{trace,result,wav:existsSync(join(output,'audio-16k-mono.wav'))?readFileSync(join(output,'audio-16k-mono.wav'),'utf8'):null,copyExists:existsSync(join(output,'audio-copy.m4a'))},dir)
})
test('audio argument validation is a rejection with no child/output directory', {timeout:30000},async(t)=>{
  const dir=temporary(t);const promise=extractMonoWav({sourceFilePath:join(dir,'missing'),ffmpegPath:join(dir,'ffmpeg'),outputDir:join(dir,'out')})
  assert.ok(promise instanceof Promise);await assert.rejects(promise,{name:'Error',message:`source file missing: ${join(dir,'missing')}`});assert.equal(existsSync(join(dir,'out')),false)
  writeFileSync(join(dir,'source'),'x');await assert.rejects(extractMonoWav({sourceFilePath:join(dir,'source'),ffmpegPath:join(dir,'missing'),outputDir:join(dir,'out')}),{name:'Error',message:`ffmpeg not found: ${join(dir,'missing')}`})
})
test('caption extraction filters and orders tracks, keeps bytes and skips failed/blank streams', {timeout:30000},async(t)=>{
  const dir=temporary(t);const source=join(dir,'source');const calls=join(dir,'calls');writeFileSync(source,'media')
  const streams=[{index:0,codec_type:'video',codec_name:'h264'},{index:1,codec_type:'subtitle',codec_name:'hdmv_pgs_subtitle'},{index:2,codec_type:'subtitle',codec_name:'subrip',tags:{language:'eng',title:' English '}},{index:3,codec_type:'subtitle',codec_name:'ass',tags:{language:'zho',title:' Chinese '}},{index:4,codec_type:'subtitle',codec_name:'subrip',tags:{language:'eng',title:'AI generated'}},{index:5,codec_type:'subtitle',codec_name:'subrip',tags:{language:'fra'}},{index:6,codec_type:'subtitle',codec_name:'subrip',tags:{language:'deu'}}]
  executable(dir,'ffprobe',`require('node:fs').appendFileSync(${JSON.stringify(calls)},JSON.stringify(['probe',process.argv.slice(2)])+'\\n');console.log(${JSON.stringify(JSON.stringify({streams}))})`)
  const ffmpeg=executable(dir,'ffmpeg',`require('node:fs').appendFileSync(${JSON.stringify(calls)},JSON.stringify(['extract',process.argv.slice(2)])+'\\n');const map=process.argv[process.argv.indexOf('-map')+1];if(map==='0:5'){process.stderr.write('failure');process.exitCode=7}else if(map==='0:6')process.stdout.write('  ');else process.stdout.write('WEBVTT\\n\\n'+map+'\\n')`)
  const result=await extractEmbeddedCaptionTracks({ffmpegPath:ffmpeg,filePath:source,preferredLanguages:['zh','en']})
  compare('captions',{result,trace:readFileSync(calls,'utf8').trim().split('\n').map(line=>JSON.parse(line))},dir)
})
test('caption timeout sends TERM and settles before a TERM-ignoring child closes', {timeout:30000},async(t)=>{
  const dir=temporary(t);const pidFile=join(dir,'pid');const terminated=join(dir,'term');const source=join(dir,'source');writeFileSync(source,'media')
  executable(dir,'ffprobe',`const fs=require('node:fs');process.on('SIGTERM',()=>fs.writeFileSync(${JSON.stringify(terminated)},'term'));fs.writeFileSync(${JSON.stringify(pidFile)},String(process.pid)+'\\n');setInterval(()=>{},1000)`)
  const ffmpeg=executable(dir,'ffmpeg','')
  t.mock.timers.enable({apis:['setTimeout']})
  const pending=extractEmbeddedCaptionTracks({ffmpegPath:ffmpeg,filePath:source})
  await waitFor(()=>readFixturePid(pidFile)!==null);const pid=requireFixturePid(pidFile);t.after(()=>killFixtureProcess(pid,pidFile))
  t.mock.timers.tick(8000);assert.deepEqual(await pending,[])
  await waitFor(()=>existsSync(terminated));assert.equal(existsSync(terminated),true);assert.doesNotThrow(()=>process.kill(pid,0));killFixtureProcess(pid,pidFile)
})
for(const input of ['garbage\n{"type":"probe"}\n','{"type":"probe"}', '{"type":"probe","modelsDir":"/fixture/models"}\n'] as const) test(`exported worker entry input framing ${JSON.stringify(input)}`,{timeout:30000},async(t)=>{
  const child=spawn(NODE,workerArgs,{env:{...process.env,VIDBEE_TRANSCRIPTION_BACKEND:'fake'},detached:process.platform!=='win32',stdio:['pipe','pipe','pipe']});t.after(()=>child.kill('SIGKILL'))
  let stdout='';let stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk)
  if(input.endsWith('\n')){child.stdin.end(input);const code=await new Promise(resolve=>child.once('close',resolve));assert.equal(code,0);assert.equal(stdout,'{"type":"probe-ok"}\n');assert.equal(stderr,'')}
  else{child.stdin.end(input);const code=await new Promise(resolve=>child.once('close',resolve));assert.equal(code,0);assert.equal(stdout,'');assert.equal(stderr,'')}
})
test('PCM wav retains float32 nonfinite values, channel averaging and unsupported-depth error', (t)=>{
  const dir=temporary(t);const path=join(dir,'wave');const header=Buffer.alloc(44);header.write('RIFF');header.write('WAVE',8);header.write('fmt ',12);header.writeUInt32LE(16,16);header.writeUInt16LE(3,20);header.writeUInt16LE(2,22);header.writeUInt32LE(8000,24);header.writeUInt16LE(32,34);header.write('data',36);header.writeUInt32LE(16,40)
  const data=Buffer.alloc(16);data.writeFloatLE(1,0);data.writeFloatLE(-0.5,4);data.writeFloatLE(Infinity,8);data.writeFloatLE(-Infinity,12);writeFileSync(path,Buffer.concat([header,data]))
  const wave=readPcmWav(path);assert.equal(wave.sampleRate,8000);assert.equal(wave.samples[0],0.25);assert.equal(Number.isNaN(wave.samples[1]),true)
  header.writeUInt16LE(24,34);writeFileSync(path,Buffer.concat([header,data]));assert.throws(()=>readPcmWav(path),{name:'Error',message:'unsupported wav bit depth: 24'})
})
for(const cancelled of [false,true])test(`exported fake worker start full wire, checkpoint/result file and cooperative cancel=${cancelled}`,{timeout:30000},async(t)=>{
  const dir=temporary(t);const source=join(dir,'source');writeFileSync(source,'media');const ffmpeg=executable(dir,'ffmpeg',"require('node:fs').writeFileSync(process.argv.at(-1),'wave')")
  const child=spawn(NODE,workerArgs,{env:{...process.env,VIDBEE_TRANSCRIPTION_BACKEND:'fake'},detached:process.platform!=='win32',stdio:['pipe','pipe','pipe']});t.after(()=>child.kill('SIGKILL'));let stdout='';let stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk)
  const request={type:'start',taskId:'task',attemptId:'attempt',sourceFilePath:source,ffmpegPath:ffmpeg,workDir:dir,modelsDir:dir,skipVad:true,autoSkipAllowed:false,backend:'fake',fingerprint:'fixture-fingerprint',modelVersion:'fixture-model',asrTier:'minimal',provider:'cpu',speakerCount:1}
  child.stdin.end(`${cancelled?'{"type":"cancel"}\n':''}${JSON.stringify(request)}\n`);const code=await new Promise(resolve=>child.once('close',resolve));assert.equal(code,0);assert.equal(stderr,'');const resultFile=join(dir,'pipeline-result.json')
  compare(`worker-start-${cancelled}`,{messages:stdout.trim().split('\n').map(line=>JSON.parse(line)),result:existsSync(resultFile)?JSON.parse(readFileSync(resultFile,'utf8')):null,audio:existsSync(join(dir,'audio-16k-mono.wav')),manifest:existsSync(join(dir,'chunks.json'))},dir)
})
