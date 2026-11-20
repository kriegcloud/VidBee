import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {test} from 'node:test'
const entry=fileURLToPath(new URL('../../transcription/src/worker/entry.ts',import.meta.url))
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)))
const launch=(message:unknown,env:NodeJS.ProcessEnv={})=>new Promise<{code:number|null;stdout:string;stderr:string}>((resolve,reject)=>{
 const child=spawn(process.execPath,['--import','tsx',entry],{cwd:root,env:{...process.env,...env},stdio:['pipe','pipe','pipe']})
 let stdout='',stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);child.once('error',reject);child.once('close',code=>resolve({code,stdout,stderr}));child.stdin.end(JSON.stringify(message)+'\n')
})
test('native worker entry composes fake probe with awaited Stdio output and clean scope close',{timeout:30000},async()=>{
 const result=await launch({type:'probe'},{VIDBEE_TRANSCRIPTION_BACKEND:'fake'})
 assert.equal(result.code,0);assert.equal(result.stderr,'');assert.deepEqual(JSON.parse(result.stdout),{type:'probe-ok'})
})
test('native worker entry shares seed, checkpoint, fake pipeline and atomic result services',{timeout:30000},async t=>{
 const dir=mkdtempSync(join(tmpdir(),'vidbee-native-worker-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const seedPath=join(dir,'seed.json');const seed={language:'en',modelVersion:'fixture',asrTier:'minimal',speakers:[],segments:[{speakerKey:null,startMs:0,endMs:1000,text:'fixture speech',confidence:null}]};const raw=JSON.stringify(seed);writeFileSync(seedPath,raw)
 const result=await launch({type:'start',taskId:'fixture',attemptId:'attempt',sourceFilePath:join(dir,'unused-source'),ffmpegPath:'/unused',workDir:dir,modelsDir:join(dir,'models'),skipVad:true,autoSkipAllowed:false,backend:'fake',fingerprint:'fixture',modelVersion:'fixture',asrTier:'minimal',provider:'cpu',speakerCount:1,existingTranscriptPath:seedPath})
 assert.equal(result.code,0,result.stderr);assert.equal(result.stderr,'');const messages=result.stdout.trim().split('\n').map(line=>JSON.parse(line));assert.equal(messages[0].line,'compute.provider=cpu');assert(messages.some(message=>message.type==='partial'));assert.deepEqual(messages.at(-1),{type:'result',resultPath:'pipeline-result.json',durationMs:1000});const payload=JSON.parse(readFileSync(join(dir,'pipeline-result.json'),'utf8'));assert.equal(payload.resultKind,'transcript');assert.equal(payload.segments[0].text,'fixture speech');assert.equal(readFileSync(seedPath,'utf8'),raw)
})
