import {syncBuiltinESMExports} from 'node:module'
import fs from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {TaskQueueAPI,MemoryPersistAdapter} from '@vidbee/task-queue-legacy'
import type {Task,ExecutorFinishEvent,TaskQueueEvent} from '@vidbee/task-queue-legacy'
const api=await import(process.env.REVIEW_SUBJECT ?? '../../src/index.ts')
const mode=process.argv[2] ?? "stages"
const error=new Error('review sentinel')
const root=fs.mkdtempSync(join(tmpdir(),'review-escaped-'))
const deliveries:string[]=[]
process.on('uncaughtException',value=>{if(value!==error)throw value;deliveries.push('uncaughtException')})
process.on('unhandledRejection',value=>{if(value!==error)throw value;deliveries.push('unhandledRejection')})
const originalWrite=fs.writeFileSync
try{
 if(mode==='coordinator'){
  const source=join(root,'source');fs.writeFileSync(source,'media')
  const task={id:'download',kind:'video',status:'completed',input:{url:source,kind:'video'},createdAt:1,updatedAt:1} as Task
  let listener:((event:TaskQueueEvent)=>void)|undefined
  const queue=new TaskQueueAPI({persist:new MemoryPersistAdapter(),executor:{run:()=>({cancel:async()=>{},pause:async()=>{}})}})
  queue.get=()=>task
  queue.subscribe=fn=>{listener=fn;return()=>{}}
  const coordinator=new api.AutoTranscriptionCoordinator({queue,store:new api.MemoryTranscriptStore(),resolveSourceFile:()=>{throw error},isEnabled:()=>true})
  coordinator.start()
  listener?.({type:'transition',taskId:'download',from:'running',to:'completed',reason:null,attempt:1,at:1})
  await new Promise(resolve=>setTimeout(resolve,100))
  coordinator.stop()
  console.log(JSON.stringify({deliveries,continued:true}))
 }else{
  const source=join(root,'source');fs.writeFileSync(source,'media')
  const script=join(root,'worker.cjs')
  const result={resultKind:'no-speech',language:null,modelVersion:'fixture',asrTier:'minimal',speakers:[],segments:[]}
  fs.writeFileSync(script,`process.stdin.once('data',()=>{console.log(JSON.stringify({type:'progress',stage:'recognizing',percent:0}));setTimeout(()=>console.log(JSON.stringify({type:'result',result:${JSON.stringify(result)},durationMs:1})),100)});setInterval(()=>{},1000)`)
  if(mode==='stages'){
   fs.writeFileSync=((...args:Parameters<typeof fs.writeFileSync>)=>{if(String(args[0]).includes('stages.json'))throw error;return originalWrite(...args)})
   syncBuiltinESMExports()
  }
  const store=new api.MemoryTranscriptStore()
  if(mode==='stored-kind'){
   const record=store.commit({downloadTaskId:'download',transcriptionTaskId:'task',sourceFilePath:source,result});
   Reflect.set(record,'resultKind','future-kind');
  }
  const executor=new api.TranscriptionExecutor({store,workerScript:script,modelsDir:root,workDir:root,execPath:process.execPath,forceLayer:'electron',skipProbe:true,backend:'fake',...(['stored-kind','finish-success','finish-error'].includes(mode)?{runInProcess:async()=>{if(mode==='finish-error')throw new Error('execute');return {result,durationMs:1}}}:{}),resolveFfmpegPath:()=>'/ffmpeg',onStage:()=>{if(mode==='stage-hook')throw error}})
  const finish=await new Promise<unknown>((resolve)=>{executor.run({taskId:'task',attemptId:'attempt',attemptNumber:1,input:api.buildTranscriptionInput({downloadTaskId:'download',sourceFilePath:source})},{onSpawn:()=>{},onProgress:()=>{if(mode==='progress-hook')throw error},onStd:()=>{},onFinish:(event:ExecutorFinishEvent)=>{resolve(event.result);if(mode.startsWith('finish-'))throw error}})})
  await new Promise(resolve=>setTimeout(resolve,50))
  console.log(JSON.stringify({deliveries,finish}))
 }
}finally{fs.writeFileSync=originalWrite;syncBuiltinESMExports();fs.rmSync(root,{recursive:true,force:true})}
