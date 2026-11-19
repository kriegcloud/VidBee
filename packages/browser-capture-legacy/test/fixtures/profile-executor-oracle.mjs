import * as current from '../../src/onlyfans-profile.ts';
Date.now=()=>1000;
const runs=[];
for(const scenario of ['normal','invalid','download-error','download-throw','progress-throw','finish-throw','spawn-throw','cancel-before-start','fallback','totals']){
 for(const [name,api]of [['new',current]]){
  let turn=0,tick=true,finishes=0;const trace=[];const sentinel=new Error('sentinel');
  const mark=(event,value)=>trace.push([event,turn,...(value===undefined?[]:[value])]);
  const profiles={adapter:{name:'Fixture',isSite:()=>scenario!=='fallback'},download:(profile,id,destination,signal,progress)=>{
    mark('download',{profile,id,destination,aborted:signal.aborted});
    if(scenario==='download-throw')throw sentinel;
    const totals=scenario==='totals'?[Infinity,-1,-0,0,NaN]:[10];
    for(const total of totals)progress(1,total);
    return scenario==='download-error'?Promise.reject(sentinel):Promise.resolve({filePath:'/fixture/result.mp4',size:3});
  }};
  const fallback={run:()=>{mark('fallback');return{cancel:async()=>mark('fallback-cancel'),pause:async()=>mark('fallback-pause')}}};
  const events={onSpawn:e=>{mark('spawn',{...e,pid:42});if(scenario==='spawn-throw')throw sentinel},onStd:e=>mark('std',e),onProgress:e=>{mark('progress',e);if(scenario==='progress-throw')throw sentinel},onFinish:e=>{mark('finish',e);if(scenario==='finish-throw'&&finishes++===0)throw sentinel}};
  const executor=new api.OnlyFansBrowserExecutor(profiles,fallback,()=>'/fixture/downloads');
  const ctx={taskId:'task',attemptId:'attempt',attemptNumber:1,input:{kind:'video',url:'https://fixture.invalid/video',options:scenario==='invalid'?{}:{onlyFansProfile:'https://fixture.invalid/profile',onlyFansMediaId:'1'}}};
  const pump=()=>{if(tick){turn++;queueMicrotask(pump)}};queueMicrotask(pump);
  mark('run');const handle=executor.run(ctx,events);mark('returned');let error=null;
  try{
    if(scenario==='cancel-before-start'||scenario==='spawn-throw')await handle.cancel();
    else {for(let i=0;i<20;i++)await Promise.resolve();mark('pause');await handle.pause();}
    mark('settled');
  }catch(cause){error={message:cause.message,same:cause===sentinel};mark('rejected')}
  tick=false;runs.push({name,scenario,trace,error});
 }
}
console.log(JSON.stringify(runs.map(({name,...run})=>run),(_k,v)=>typeof v==='number'&&!Number.isFinite(v)?String(v):Object.is(v,-0)?'-0':v));
