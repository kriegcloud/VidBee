import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { chromium } from 'playwright-core';
import * as current from '../../src/player.ts';
const runs=[];
for (const scenario of ['normal','poll','clock','quality','seek','place','scan-error','removeMarker','progress-error']) {
for (const [name, api] of [['new',current]]) {
  let now=1000;Date.now=()=>now;
  globalThis.setTimeout=(callback,ms,...args)=>{queueMicrotask(()=>{now+=ms;callback(...args)});return {unref(){}}};globalThis.clearTimeout=()=>{};
  let turn=0, tick=true, init=0, reads=0; const trace=[]; const sentinel = Object.assign(new Error('sentinel'), {original: new Error('wrong original'), legacyMessage: 'wrong legacy', cause: new Error('wrong cause')});
  const operation=(name,result)=>{ trace.push([name,turn]); if (name===scenario || scenario==='close-reject' && name==='contextClose') return Promise.reject(sentinel); if (scenario==='close-throw' && name==='contextClose') throw sentinel; return Promise.resolve(result); };
  const page={goto:()=>operation('goto',null),evaluate:(fn)=>{const source=String(fn);return source.includes('currentTime:')?operation('clock',scenario==='poll'&&reads++===0?null:{currentTime:1,duration:1,paused:false,ended:true}):source.includes('appendChild')?operation('place',{x:0,y:0,width:4,height:4}):source.includes('getVideoPlaybackQuality')?operation('quality',{fps:30,width:4,height:4,method:'fixture'}):operation(source.includes('0.4')?'seek':source.includes('remove()')?'removeMarker':'evaluate',undefined)},waitForSelector:()=>operation('selector',null),addStyleTag:()=>operation('style',null),url:()=> 'about:blank'};
  const context={addInitScript:()=>operation(`init${++init}`),pages:()=>scenario==='persistent-newPage'?[]:[page],newPage:()=>operation('newPage',page),close:()=>operation('contextClose'),addCookies:()=>operation('cookies')};
  const browser={newContext:()=>operation('newContext',context),close:()=>operation('browserClose')};
  chromium.launch=()=>operation('launch',browser);
  chromium.launchPersistentContext=()=>operation('persistentLaunch',context);
  childProcess.spawn=()=>{trace.push(['scan',turn]);const child=new EventEmitter();child.pid=42;child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.kill=()=>true;queueMicrotask(()=>{child.stdout.emit('data',Buffer.from([255,0,255]));child.emit('close',scenario==='scan-error'?1:0)});return child};syncBuiltinESMExports();
  const pump=()=>{if(tick){turn++;queueMicrotask(pump)}}; queueMicrotask(pump);
  let error = null;
  try {
    const session=await api.startPlayback({url:'https://fixture.invalid/watch',executablePath:'/fixture/chrome',display:':99',width:1000,height:1000,cookies:scenario==='cookies'?[{domain:'fixture.invalid',path:'/',name:'fixture',value:'value',expires:-1,httpOnly:false,secure:false,sameSite:'Lax'}]:[],...(scenario.startsWith('persistent')?{userDataDir:'/fixture/profile'}:{}),...(scenario==='storage'?{localStorage:{fixture:'value'}}:{}),ffmpegPath:'/fixture/ffmpeg',signal:new AbortController().signal});
    trace.push(['returned',turn]);const quality=await session.waitUntilPlaying();trace.push(['playing',turn,quality]);await session.waitUntilEnded(state=>{trace.push(['progress',turn,state]);if(scenario==='progress-error')throw sentinel});trace.push(['ended',turn]);await session.close();trace.push(['closed',turn]);
  } catch (cause) { error = {message:cause.message, same:cause===sentinel}; trace.push(['failed',turn]); }
  tick=false;const origin=trace[0][1];runs.push({scenario,name,trace:trace.map(([event,turn,value])=>value===undefined?[event,turn-origin]:[event,turn-origin,value]),error});
}
}
console.log(JSON.stringify(runs.map(({name,...run})=>run),(_k,v)=>typeof v==='number'&&!Number.isFinite(v)?String(v):Object.is(v,-0)?'-0':v));
