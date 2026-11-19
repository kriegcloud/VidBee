import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { chromium } from 'playwright-core';
import * as current from '../../src/player.ts';
const runs=[];
for (const scenario of ['carousel','cover','gallery','locked','no-video','fallback-first','duration-mismatch','chat-timeout','log-throw']) {
for (const [name, api] of [['new',current]]) {
  let now=1000;Date.now=()=>now;
  globalThis.setTimeout=(callback,ms,...args)=>{if(ms===30000){chatTimeout=callback;return {unref(){}}}queueMicrotask(()=>{now+=ms;callback(...args)});return {unref(){}}};globalThis.clearTimeout=()=>{};
  let turn=0, tick=true, init=0;let chatTimeout;const emitter=new EventEmitter(); const trace=[]; const sentinel = Object.assign(new Error('sentinel'), {original: new Error('wrong original'), legacyMessage: 'wrong legacy', cause: new Error('wrong cause')});
  const operation=(name,result)=>{ trace.push([name,turn]); if (name===scenario || scenario==='close-reject' && name==='contextClose') return Promise.reject(sentinel); if (scenario==='close-throw' && name==='contextClose') throw sentinel; return Promise.resolve(result); };
  const page={goto:()=>{emitter.emit('response',{url:()=>scenario==='chat-timeout'?'https://onlyfans.com/api2/v2/other':'https://onlyfans.com/api2/v2/chats/7/messages?firstId=100',ok:()=>true,json:()=>operation('json',{list:[{id:scenario==='fallback-first'?101:100,media:scenario==='no-video'?[]:[{id:22,type:'video',duration:8,files:scenario==='locked'?{}:{drm:{manifest:true}}}]}]})});if(['fallback-first','chat-timeout'].includes(scenario)){let ticks=0;const expire=()=>{if(++ticks===10)chatTimeout();else queueMicrotask(expire)};queueMicrotask(expire)}return operation('goto',null)},evaluate:(fn)=>{const source=String(fn);return source.includes('slideNext')?operation('step',['cover','gallery'].includes(scenario)?null:{active:1,index:1}):source.includes('swiper-slide-active')?operation('swiperPoint',{x:1,y:2}):source.includes('needles')?operation('attachmentPoint',scenario==='gallery'?null:{x:1,y:2}):source.includes('currentTime:')?operation('clock',{currentTime:1,duration:scenario==='duration-mismatch'?11:8,paused:false,ended:true}):source.includes('appendChild')?operation('place',{x:0,y:0,width:4,height:4}):source.includes('getVideoPlaybackQuality')?operation('quality',{fps:30,width:4,height:4,method:'fixture'}):operation('evaluate',undefined)},waitForSelector:()=>operation('selector',null),addStyleTag:()=>operation('style',null),url:()=> 'about:blank',on:emitter.on.bind(emitter),off:emitter.off.bind(emitter),mouse:{click:()=>operation('click')}};
  const context={addInitScript:()=>operation(`init${++init}`),pages:()=>scenario==='persistent-newPage'?[]:[page],newPage:()=>operation('newPage',page),close:()=>operation('contextClose'),addCookies:()=>operation('cookies')};
  const browser={newContext:()=>operation('newContext',context),close:()=>operation('browserClose')};
  chromium.launch=()=>operation('launch',browser);
  chromium.launchPersistentContext=()=>operation('persistentLaunch',context);
  childProcess.spawn=()=>{trace.push(['scan',turn]);const child=new EventEmitter();child.pid=42;child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.kill=()=>true;queueMicrotask(()=>{child.stdout.emit('data',Buffer.from([255,0,255]));child.emit('close',0)});return child};syncBuiltinESMExports();
  const pump=()=>{if(tick){turn++;queueMicrotask(pump)}}; queueMicrotask(pump);
  let error = null;
  try {
    const session=await api.startPlayback({url:'https://onlyfans.com/my/chats/chat/7?firstId=100',videoOrdinal:1,onLog:()=>{if(scenario==='log-throw')throw sentinel},executablePath:'/fixture/chrome',display:':99',width:1000,height:1000,cookies:scenario==='cookies'?[{domain:'fixture.invalid',path:'/',name:'fixture',value:'value',expires:-1,httpOnly:false,secure:false,sameSite:'Lax'}]:[],...(scenario.startsWith('persistent')?{userDataDir:'/fixture/profile'}:{}),...(scenario==='storage'?{localStorage:{fixture:'value'}}:{}),ffmpegPath:'/fixture/ffmpeg',signal:new AbortController().signal});
    trace.push(['returned',turn,session.mediaId]);await session.close();trace.push(['closed',turn]);
  } catch (cause) { error = {message:cause.message, same:cause===sentinel}; trace.push(['failed',turn]); }
  tick=false;const origin=trace[0][1];runs.push({scenario,name,trace:trace.map(([event,turn,value])=>value===undefined?[event,turn-origin]:[event,turn-origin,value]),error});
}
}
console.log(JSON.stringify(runs.map(({name,...run})=>run)));
