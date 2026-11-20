import type {Executor,ExecutorEvents} from '@vidbee/task-queue-legacy'
import type {TranscriptionExecutorOptions} from '../src/executor'
export const executorModes=['success','cloud','cloud-cleanup','cloud-cleanup-error','rejection','stage-error','cancel','invalid'] as const
export type ExecutorMode=typeof executorModes[number]
export type ExecutorFactory=(options:TranscriptionExecutorOptions)=>Executor
export async function observeExecutor(factory:ExecutorFactory,mode:ExecutorMode){
 const trace:unknown[]=[];const clock=Date.now;Date.now=()=>1000
 let tick=0,settled=false,finish:()=>void=()=>{};const done=new Promise<void>(resolve=>finish=resolve)
 const result={resultKind:'no-speech' as const,language:null,modelVersion:'fixture',asrTier:null,speakers:[],segments:[]}
 const store={commit:(input:unknown)=>{trace.push(['commit',input]);return{id:'record',resultKind:'no-speech'}},getLatestForDownload:()=>null,listForDownload:()=>[]} as unknown as TranscriptionExecutorOptions['store']
 const pipeline=async(input:{signal:AbortSignal;onProgress:(stage:'recognizing',percent:number)=>void})=>{
  trace.push(['pipeline',input.signal.aborted]);input.onProgress('recognizing',.5);trace.push('after-progress');queueMicrotask(()=>trace.push('pipeline-microtask'))
  if(mode==='rejection')throw new Error('fixture rejected')
  await Promise.resolve();trace.push('pipeline-resumed')
  return {result,durationMs:12,cleanup:mode.startsWith('cloud-cleanup')?async()=>{trace.push('cleanup');await Promise.resolve();trace.push('cleanup-resumed');if(mode==='cloud-cleanup-error')throw new Error('cleanup rejected')}:undefined}
 }
 const events:ExecutorEvents={onSpawn:event=>trace.push(['spawn',{...event,pid:'PID'}]),onProgress:event=>{trace.push(['progress',event]);if(mode==='stage-error')throw new Error('progress rejected')},onStd:event=>trace.push(['std',event]),onFinish:event=>{trace.push(['finish',event]);settled=true;finish()}}
 try{
  const executor=factory({store,workerScript:'/unused',modelsDir:'/unused',resolveFfmpegPath:()=>'/unused',onStage:event=>trace.push(['stage',event]),runInProcess:pipeline,runCloud:pipeline})
  const handle=executor.run({taskId:'task',attemptId:'attempt',attemptNumber:1,input:{kind:'transcription',url:mode==='invalid'?'':'/source',options:mode==='invalid'?{}:{downloadTaskId:'download',provider:mode.startsWith('cloud')?'cloud':'local'}}},events)
  trace.push('run-return');if(mode==='cancel'){const pending=handle.cancel();trace.push('cancel-return');void pending.then(()=>trace.push('cancel-resolved'))}
  const ticker=()=>{if(!settled&&tick<100){trace.push(['microtask',++tick]);queueMicrotask(ticker)}};queueMicrotask(ticker)
  await done;trace.push('finish-observed');return trace
 }finally{Date.now=clock}
}
