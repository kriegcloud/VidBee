import { chromium } from 'playwright-core';
import * as current from '../../src/player.ts';
const runs=[];
for (const scenario of ['normal','persistent','persistent-newPage','cookies','storage','launch','newContext','init1','init2','newPage','goto','evaluate','selector','style','close-reject','close-throw']) {
for (const [name, api] of [['new',current]]) {
  let turn=0, tick=true, init=0; const trace=[]; const sentinel = Object.assign(new Error('sentinel'), {original: new Error('wrong original'), legacyMessage: 'wrong legacy', cause: new Error('wrong cause')});
  const operation=(name,result)=>{ trace.push([name,turn]); if (name===scenario || scenario==='close-reject' && name==='contextClose') return Promise.reject(sentinel); if (scenario==='close-throw' && name==='contextClose') throw sentinel; return Promise.resolve(result); };
  const page={goto:()=>operation('goto',null),evaluate:()=>operation('evaluate',undefined),waitForSelector:()=>operation('selector',null),addStyleTag:()=>operation('style',null),url:()=> 'about:blank'};
  const context={addInitScript:()=>operation(`init${++init}`),pages:()=>scenario==='persistent-newPage'?[]:[page],newPage:()=>operation('newPage',page),close:()=>operation('contextClose'),addCookies:()=>operation('cookies')};
  const browser={newContext:()=>operation('newContext',context),close:()=>operation('browserClose')};
  chromium.launch=()=>operation('launch',browser);
  chromium.launchPersistentContext=()=>operation('persistentLaunch',context);
  const pump=()=>{if(tick){turn++;queueMicrotask(pump)}}; queueMicrotask(pump);
  let error = null;
  try {
    const session=await api.startPlayback({url:'https://fixture.invalid/watch',executablePath:'/fixture/chrome',display:':99',width:1000,height:1000,cookies:scenario==='cookies'?[{domain:'fixture.invalid',path:'/',name:'fixture',value:'value',expires:-1,httpOnly:false,secure:false,sameSite:'Lax'}]:[],...(scenario.startsWith('persistent')?{userDataDir:'/fixture/profile'}:{}),...(scenario==='storage'?{localStorage:{fixture:'value'}}:{}),ffmpegPath:'/fixture/ffmpeg',signal:new AbortController().signal});
    trace.push(['returned',turn]); await session.close();trace.push(['closed',turn]);
  } catch (cause) { error = {message:cause.message, same:cause===sentinel}; trace.push(['failed',turn]); }
  tick=false;const origin=trace[0][1];runs.push({scenario,name,trace:trace.map(([event,turn])=>[event,turn-origin]),error});
}
}
console.log(JSON.stringify(runs.map(({name,...run})=>run)));
