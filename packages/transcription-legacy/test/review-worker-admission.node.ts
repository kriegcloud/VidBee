import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname,join,resolve} from 'node:path'
import {test} from 'node:test'
import {fileURLToPath} from 'node:url'
import {NODE,workerArgs} from './fixtures/process-runtime'
export const admissionModes=['two-probes','overlap-seeds','overlap-seeds-cancel','prepare-rejection'] as const
export type AdmissionMode=typeof admissionModes[number]
const preload=fileURLToPath(new URL('./fixtures/review-worker-admission-preload.cjs',import.meta.url))
const repo=resolve(fileURLToPath(new URL('../../..',import.meta.url)))
const baselineFile=new URL('./fixtures/review-worker-admission.json',import.meta.url)
const running=(pid:number)=>{try{process.kill(pid,0);if(process.platform==='linux'){const stat=readFileSync(`/proc/${pid}/stat`,'utf8');if(stat.slice(stat.lastIndexOf(')')+2).startsWith('Z'))return false}return true}catch{return false}}
const reapOwned=async(pids:readonly number[],command:string)=>{for(const pid of pids){assert.ok(pid>1&&pid!==process.pid,'refusing non-descendant/root PID');if(running(pid)){if(process.platform==='linux')assert.ok(readFileSync(`/proc/${pid}/cmdline`,'utf8').split('\0').includes(command),'recorded PID no longer belongs to synthetic ffprobe');try{process.kill(pid,'SIGKILL')}catch{}}}for(let index=0;index<10000&&pids.some(running);index++)await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(pids.some(running),false,'an owned synthetic ffprobe descendant remained running')}
export async function observeWorkerAdmission(mode:AdmissionMode,args:readonly string[]=workerArgs,signal?:AbortSignal){
 const root=mkdtempSync(join(tmpdir(),'worker-admission-review-'));const traceFile=join(root,'trace');writeFileSync(traceFile,'');const models=join(root,'models');mkdirSync(models);const source=join(root,'source');writeFileSync(source,'media');const ffmpeg=join(root,'ffmpeg'),ffprobe=join(root,'ffprobe');writeFileSync(ffmpeg,'fixture')
 writeFileSync(ffprobe,`#!${NODE}\nprocess.stdout.write('REVIEW_READY\\n');setInterval(()=>{},1000)\n`,{mode:0o755})
 const request=(id:string)=>{const workDir=join(root,id);mkdirSync(workDir);const seed=join(root,`${id}.seed.json`);writeFileSync(seed,JSON.stringify({language:'en',modelVersion:'fixture-seed',asrTier:'minimal',sourceKind:'asr',speakers:[],segments:[{speakerKey:null,startMs:0,endMs:1000,text:id,confidence:null}]}));return{type:'start',taskId:id,attemptId:`attempt-${id}`,sourceFilePath:source,ffmpegPath:ffmpeg,workDir,modelsDir:models,skipVad:true,autoSkipAllowed:false,backend:mode==='prepare-rejection'?'sherpa':'fake',fingerprint:'fixture',modelVersion:'fixture',asrTier:'minimal',provider:'cpu',speakerCount:1,...(mode==='prepare-rejection'?{}:{existingTranscriptPath:seed})}}
 const messages=mode==='two-probes'?[{type:'probe'},{type:'probe'}]:mode==='prepare-rejection'?[request('first')]:[request('first'),request('second'),...(mode==='overlap-seeds-cancel'?[{type:'cancel'}]:[])]
 const children:number[]=[];let stdout='',stderr='',fetched=false,spawned=false,probeReady=false,rejected=false
 const child=spawn(NODE,['--require',preload,...args],{cwd:repo,env:{...process.env,NODE_PATH:join(repo,'node_modules'),VIDBEE_ADMISSION_TRACE:traceFile,VIDBEE_TRANSCRIPTION_BACKEND:mode==='prepare-rejection'?'sherpa':'fake',VIDBEE_DOWNLOAD_MIRROR:'global'},stdio:['pipe','pipe','pipe','ipc']})
 const abort=()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL')}
 signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort()
 const closed=new Promise<{code:number|null;signal:string|null}>((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}))})
 assert.ok(child.stdout);assert.ok(child.stderr);assert.ok(child.stdin)
 child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);child.stdin.on('error',()=>{})
 child.on('message',(message:unknown)=>{if(message===null||typeof message!=='object'||!('kind'in message))return;if(message.kind==='child'&&'pid'in message&&typeof message.pid==='number'){children.push(message.pid);spawned=true}if(message.kind==='fetch')fetched=true;if(message.kind==='probe-ready')probeReady=true;if(mode==='prepare-rejection'&&fetched&&spawned&&probeReady&&!rejected){rejected=true;child.send({kind:'reject-prepare'})}})
 try{
  child.stdin.end(messages.map(message=>JSON.stringify(message)+'\n').join(''));const outcome=await closed
  const wire=stdout.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line) as {type:string;message?:string});
  const trace=readFileSync(traceFile,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line) as unknown)
  const pids=children.length>0?children:trace.flatMap(event=>Array.isArray(event)&&event[0]==='child-spawn'&&typeof event[2]==='number'?[event[2]]:[])
  await reapOwned(pids,ffprobe)
  assert.equal(stderr,'','worker admission fixture must reach the public entry without startup errors')
  if(mode==='two-probes'){assert.equal(outcome.code,0);assert.deepEqual(wire,[{type:'probe-ok'},{type:'probe-ok'}])}
  else if(mode==='prepare-rejection'){assert.equal(outcome.code,1);assert.equal(rejected,true);assert.equal(spawned,true);assert.equal(fetched,true);assert.equal(trace.some(event=>Array.isArray(event)&&event[0]==='unhandledRejection'),true);assert.equal(wire.filter(event=>event.type==='error'&&event.message?.includes('fixture prepare failed')).length,1)}
  else{assert.equal(outcome.code,0);assert.equal(wire.filter(event=>event.type===(mode==='overlap-seeds'?'result':'error')).length,2);if(mode==='overlap-seeds-cancel')assert.equal(wire.filter(event=>event.type==='error'&&event.message==='cancelled').length,2)}
  const files=['first','second'].map(id=>({id,manifest:existsSync(join(root,id,'chunks.json'))?JSON.parse(readFileSync(join(root,id,'chunks.json'),'utf8')):null,result:existsSync(join(root,id,'pipeline-result.json'))?JSON.parse(readFileSync(join(root,id,'pipeline-result.json'),'utf8')):null}))
  const normalized=JSON.stringify({outcome,messages:wire,stderr,trace,files,gate:{fetched,spawned,probeReady,rejected},descendantsRunning:pids.some(running)}).split(root).join('<ROOT>').split(NODE).join('<NODE>');let id=0;const known=new Map<number,string>();return JSON.parse(normalized,(_key,value:unknown)=>{if(typeof value==='number'&&pids.includes(value)){let token=known.get(value);if(token===undefined){token=`CHILD-${++id}`;known.set(value,token)}return token}return value}) as unknown
 }finally{signal?.removeEventListener('abort',abort);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await closed.catch(()=>{});let pids=children;try{const trace=readFileSync(traceFile,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line) as unknown);pids=[...new Set([...children,...trace.flatMap(event=>Array.isArray(event)&&event[0]==='child-spawn'&&typeof event[2]==='number'?[event[2]]:[])])]}catch{}await reapOwned(pids,ffprobe);rmSync(root,{recursive:true,force:true})}
}
if(process.env.VIDBEE_REVIEW_WORKER_HELPER!=='1'){
 const baseline=JSON.parse(readFileSync(baselineFile,'utf8')) as Record<string,unknown>
 for(const mode of admissionModes)test(`public worker old admission/unhandled-rejection mechanism: ${mode}`,{timeout:30000},async context=>assert.deepEqual(await observeWorkerAdmission(mode,workerArgs,context.signal),baseline[mode]))
}
