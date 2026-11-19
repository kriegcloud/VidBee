// Record with an unchanged git-archive main bundle as argv[2]; default exercises the facade.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { pathToFileURL } from 'node:url';
const actualExists=fs.existsSync;
let trace=[], current, child;
Date.now=()=>1000; process.env.HOME='/fixture/home';
fs.existsSync=p=>String(p).startsWith('/fixture/')||p==='/usr/bin/brave'?true:String(p).startsWith('/tmp/.X')?false:actualExists(p);
cp.spawnSync=(_cmd,args)=>({stdout:`/fixture/${args[0]}\n`,status:0});
fsp.mkdir=async p=>{trace.push(['mkdir',p])};
fsp.mkdtemp=async()=>'/fixture/job';
fsp.writeFile=async(_p,text)=>{trace.push(['job',JSON.parse(text)])};
fsp.readdir=async()=>[];
fsp.stat=async p=>{if(p==='/fixture/result.mp4')return {size:3};throw new Error('absent')};
process.kill=()=>true;
const originalTimer=setTimeout;
globalThis.setTimeout=(fn,ms,...args)=>{trace.push(['timer',ms]);return originalTimer(fn,0,...args)};
cp.spawn=(command,argv,opts)=>{
 trace.push(['spawn',command,argv,opts.env?.FIXTURE]);
 child=new EventEmitter(); child.pid=42; child.stdout=new PassThrough(); child.stderr=new PassThrough(); child.stdin=new PassThrough(); child.kill=()=>true;
 queueMicrotask(()=>{
  if(current==='std-throw'||current==='progress-throw'){
   try{child.stdout.emit('data',Buffer.from(current==='std-throw'?'plain':'__VIDBEE_CAPTURE__'+JSON.stringify({type:'progress',percent:0.5,currentTime:1,duration:2})))}catch(e){trace.push(['emit-threw',e.message])}
   child.emit('close',1)
  }
  else if(current==='bom'){child.stdout.emit('data',Buffer.from('\ufeffhello'));child.stderr.emit('data',Buffer.from('first'));child.stderr.emit('data',Buffer.from('\ufeffwarn'));child.emit('close',1)}
  else {child.stdout.emit('data',Buffer.from('__VIDBEE_CAPTURE__'+JSON.stringify({type:'done',filePath:'/fixture/result.mp4',durationMs:2})));child.emit('close',0)}
 });return child;
};
syncBuiltinESMExports();
const api=await import(process.argv[2]?pathToFileURL(process.argv[2]).href:'../../src/index.ts');
const rows=[];
const ctx={taskId:'task',attemptId:'attempt',attemptNumber:1,input:{kind:'video',url:'https://fixture.invalid',title:''}};
const turns=async()=>{for(let i=0;i<200;i++)await Promise.resolve()};
const until=async predicate=>{for(let i=0;i<5000;i++){if(predicate())return;await new Promise(resolve=>originalTimer(resolve,2))}throw new Error('fixture not finished '+current+JSON.stringify(trace))};
async function run(name,input,configure,callback){
 current=name;trace=[];let finished=false;
 const opts={defaultDownloadDir:'/fixture/downloads',resolveSidecarScript(){return '/fixture/sidecar'},resolveFfmpegPath(){return '/fixture/ffmpeg'},execPath:'/fixture/node',execArgv:[],env:{FIXTURE:'old'},killGraceMs:100};
 const before=name==='receiver'||name==='prototype';
 if(before)configure?.(opts);
 const executor=new api.BrowserCaptureExecutor(opts);if(!before)configure?.(opts,executor);
 const events={onSpawn(){if(callback==='spawn')throw new Error('callback sentinel')},onStd:e=>{trace.push(['std',e.line]);if(callback==='std')throw new Error('callback sentinel')},onProgress(){if(callback==='progress')throw new Error('callback sentinel')},onFinish:e=>{trace.push(['finish',e.result.type,e.stdoutTail,e.stderrTail]);finished=true;if(callback==='finish')throw new Error('callback sentinel')}};
 const escapes=[];const uncaught=e=>{if(e.message!=='callback sentinel')throw e;escapes.push(['uncaughtException',e.message])};const rejected=e=>{if(e.message!=='callback sentinel')throw e;escapes.push(['unhandledRejection',e.message])};
 process.on('uncaughtException',uncaught);process.on('unhandledRejection',rejected);
 if(name==='unavailable')process.env.VIDBEE_BROWSER_CAPTURE='0';
 const handle=executor.run({...ctx,input:{...ctx.input,...input}},events);
 if(name==='cancel-throw')await handle.cancel(1);
 if(name==='mutated-grace')await handle.cancel();
 await until(()=>finished);await turns();await new Promise(setImmediate);await new Promise(setImmediate);
 process.removeListener('uncaughtException',uncaught);process.removeListener('unhandledRejection',rejected);delete process.env.VIDBEE_BROWSER_CAPTURE;
 rows.push({name,trace,escapes});
}
const values=[undefined,null,false,true,0,7,NaN,'',' title/x '];
for(const field of ['title','customDownloadPath','downloadPath','duration','settings.downloadPath','settings.cookiesPath','settings.browserForCookies'])for(const [i,value]of values.entries()){
 const options=field.startsWith('settings.')?{settings:{[field.slice(9)]:value}}:{[field]:value};
 await run(field+':'+i,{options});
}
for(const [i,title]of values.entries())await run('input.title:'+i,{title});
await run('mutated',{},opts=>{opts.defaultDownloadDir='/fixture/new';opts.execPath='/fixture/new-node';opts.execArgv=['new-arg'];opts.env={FIXTURE:'new'};opts.resolveFfmpegPath=()=>'/fixture/new-ffmpeg';opts.resolveSidecarScript=()=>'/fixture/new-sidecar'});
await run('mutated-grace',{},opts=>{opts.killGraceMs=7});
await run('receiver',{},opts=>{opts.path='/fixture/bound';opts.resolveFfmpegPath=function(){return this.path};opts.resolveSidecarScript=function(){return this.path}});
await run('prototype',{},opts=>{delete opts.defaultDownloadDir;Object.setPrototypeOf(opts,{get defaultDownloadDir(){return '/fixture/prototype'}})});
await run('bom',{});
await run('unavailable',{},undefined,'finish');
await run('error-throw',{},opts=>{opts.resolveFfmpegPath=()=>{throw new Error('fixture failure')}},'finish');
await run('cancel-throw',{},undefined,'finish');
await run('success-throw',{},undefined,'finish');
await run('spawn-throw',{},undefined,'spawn');
await run('std-throw',{},undefined,'std');
await run('progress-throw',{},undefined,'progress');
// A receiver-sensitive availability predicate is legal in the mutable old class.
trace=[];let wrapper;const primary={run(_ctx,e){e.onFinish({taskId:'task',attemptId:'attempt',result:{type:'error',error:{rawMessage:'DRM protected'}},stdoutTail:'',stderrTail:''});return {cancel:async()=>{},pause:async()=>{}}}};
wrapper=new api.DrmFallbackExecutor(primary,{run(){trace.push(['capture']);return {cancel:async()=>{},pause:async()=>{}}}},function(){trace.push(['receiver',this===wrapper]);return this===wrapper});
wrapper.run(ctx,{onStd(){},onSpawn(){},onProgress(){if(callback==='progress')throw new Error('callback sentinel')},onFinish(){trace.push(['primary-finish'])}});rows.push({name:'drm-receiver',trace});
// The old engine error text is outside the parity contract; the failed result is pinned.
console.log(JSON.stringify(rows));
