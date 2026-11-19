import childProcess from 'node:child_process'
import {syncBuiltinESMExports} from 'node:module'
import {EventEmitter} from 'node:events'
import {mkdtempSync,writeFileSync,mkdirSync,rmSync,existsSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import type {ChildProcess,SpawnOptions} from 'node:child_process'
export const audioAwaitModes=['abort-source-close','abort-stream-close','abort-convert-close','cached-probe-error','converted-probe-error','remux-second-error','remux-success','remux-probe-error','remux-abort-copy-close'] as const
export type AudioAwaitMode=typeof audioAwaitModes[number]
type Extract=(input:{sourceFilePath:string;ffmpegPath:string;outputDir:string;signal?:AbortSignal})=>Promise<{wavPath:string;durationMs:number}>
export async function observeAudioAwaits(extract:Extract,mode:AudioAwaitMode){
 const root=mkdtempSync(join(tmpdir(),'audio-await-review-')),source=join(root,'source'),ffmpeg=join(root,'ffmpeg'),output=join(root,'out'),wav=join(output,'audio-16k-mono.wav'),copy=join(output,'audio-copy.m4a');writeFileSync(source,'source');writeFileSync(ffmpeg,'binary');writeFileSync(join(root,'ffprobe'),'binary');if(mode==='cached-probe-error'){mkdirSync(output);writeFileSync(wav,'cached')}
 const trace:unknown[]=[];const abort=new AbortController();let wavProbes=0,conversions=0;const original=childProcess.spawn;const state=()=>({aborted:abort.signal.aborted,wav:existsSync(wav)?readFileSync(wav,'utf8'):null,copy:existsSync(copy)?readFileSync(copy,'utf8'):null})
 const spawn=(command:string,args:readonly string[],options?:SpawnOptions):ChildProcess=>{
  trace.push(['spawn',command,args,options??null,state()]);const child=new EventEmitter() as EventEmitter&{stdout:EventEmitter;stderr:EventEmitter;stdin:{write:(bytes:unknown)=>boolean;end:()=>void};pid:undefined;killed:boolean;exitCode:number|null;signalCode:string|null;kill:(signal:string)=>boolean};child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin={write:bytes=>{trace.push(['stdin-write',String(bytes)]);return true},end:()=>trace.push('stdin-end')};child.pid=undefined;child.killed=false;child.exitCode=null;child.signalCode=null;child.kill=signal=>{child.killed=true;trace.push(['kill',signal,state()]);return true}
  queueMicrotask(()=>{
   const probe=command.endsWith('ffprobe'),stream=probe&&args.includes('stream=codec_type'),file=args.at(-1)!;let code=0;let abortPoint=false
   if(probe){
    if(file===wav&&!stream)wavProbes++
    const fail=file===wav&&!stream&&((mode==='cached-probe-error'&&wavProbes===1)||(mode==='converted-probe-error'&&wavProbes===1)||(mode==='remux-probe-error'&&wavProbes===2))
    if(fail){trace.push(['probe-error',wavProbes,state()]);child.emit('error',new Error('probe fixture'));trace.push(['after-error',state()]);return}
    const text=stream?'audio':file===wav&&wavProbes===1&&mode.startsWith('remux-')?'1':'10';trace.push(['stdout',text]);child.stdout.emit('data',Buffer.from(text));abortPoint=mode==='abort-source-close'&&file===source&&!stream||mode==='abort-stream-close'&&stream
   }else{
    conversions++;if(mode==='remux-second-error'&&args.includes(copy)&&file===wav){code=9;child.stderr.emit('data',Buffer.from('second decode fixture'))}else writeFileSync(file,file===copy?'copied':'decoded')
    abortPoint=mode==='abort-convert-close'&&conversions===1||mode==='remux-abort-copy-close'&&file===copy
   }
   trace.push(['close-before',code,state()]);child.exitCode=code;child.emit('close',code,null);trace.push(['close-after',state()]);if(abortPoint){trace.push(['abort-before',state()]);abort.abort();trace.push(['abort-after',state()])}
  });return child as unknown as ChildProcess
 }
 Object.defineProperty(childProcess,'spawn',{value:spawn,writable:true,configurable:true});syncBuiltinESMExports()
 try{let settled=false,tick=0;const pending=extract({sourceFilePath:source,ffmpegPath:ffmpeg,outputDir:output,signal:abort.signal});trace.push(['call-return',state()]);const pulse=()=>{if(!settled&&tick<100){trace.push(['microtask',++tick,state()]);queueMicrotask(pulse)}};queueMicrotask(pulse);let value:unknown;try{value={result:await pending};trace.push(['fulfilled',state()])}catch(error){value={error:error instanceof Error?{name:error.name,message:error.message}:{thrown:String(error)}};trace.push(['rejected',state()])}settled=true;return JSON.parse(JSON.stringify({trace,value,state:state()}).split(root).join('<ROOT>')) as unknown}
 finally{Object.defineProperty(childProcess,'spawn',{value:original,writable:true,configurable:true});syncBuiltinESMExports();rmSync(root,{recursive:true,force:true})}
}
