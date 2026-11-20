import childProcess from 'node:child_process'
import {syncBuiltinESMExports} from 'node:module'
import {EventEmitter} from 'node:events'
import {mkdtempSync,writeFileSync,mkdirSync,rmSync,existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import type {ChildProcess,SpawnOptions} from 'node:child_process'
export const audioModes=['normal','cached','truncated','no-audio','raw-error','null-close','abort','pre-abort','cleanup-failure'] as const
export type AudioMode=typeof audioModes[number]
type Extract=(input:{sourceFilePath:string;ffmpegPath:string;outputDir:string;signal?:AbortSignal})=>Promise<{wavPath:string;durationMs:number}>
export async function observeAudio(extract:Extract,mode:AudioMode){
 const root=mkdtempSync(join(tmpdir(),'audio-observation-')),source=join(root,'source'),ffmpeg=join(root,'ffmpeg'),output=join(root,'out'),wav=join(output,'audio-16k-mono.wav')
 writeFileSync(source,'source');writeFileSync(ffmpeg,'binary');writeFileSync(join(root,'ffprobe'),'binary')
 if(mode==='cached'){mkdirSync(output);writeFileSync(wav,'cached')}
 const trace:unknown[]=[];const abort=new AbortController();if(mode==='pre-abort')abort.abort()
 const original=childProcess.spawn
 const spawn=(command:string,args:readonly string[],options?:SpawnOptions):ChildProcess=>{
  trace.push(['spawn',command,args,options??null])
  const child=new EventEmitter() as EventEmitter&{stdout:EventEmitter;stderr:EventEmitter;stdin:{write:(bytes:unknown)=>boolean;end:()=>void};pid:undefined;killed:boolean;exitCode:number|null;signalCode:string|null;kill:(signal:string)=>boolean}
  child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin={write:bytes=>{trace.push(['stdin-write',String(bytes)]);return true},end:()=>{trace.push('stdin-end')}};child.pid=undefined;child.killed=false;child.exitCode=null;child.signalCode=null;child.kill=signal=>{child.killed=true;trace.push(['kill',signal]);return true}
  queueMicrotask(()=>{
   const probe=command.endsWith('ffprobe');let code:number|null=0
   if(probe){const audio=args.includes('stream=codec_type');const text=audio?(mode==='no-audio'?'':'audio'):(mode==='truncated'||mode==='cleanup-failure')&&args.at(-1)!==source?'1':'10';trace.push(['stdout',text]);child.stdout.emit('data',Buffer.from(text))}
   else{
    const target=args.at(-1)!
    if(mode==='raw-error'){const error=new Error('fixture child failure');trace.push(['error',error.message]);child.emit('error',error);return}
    if(mode==='cleanup-failure'&&target.endsWith('audio-copy.m4a')){mkdirSync(target);writeFileSync(join(target,'member'),'residue');code=7;child.stderr.emit('data',Buffer.from('remux failed'))}
    else if(mode==='null-close'){code=null;child.stderr.emit('data',Buffer.from([0xe4,0xb8]));child.stderr.emit('data',Buffer.from([0xad]))}
    else if(mode==='abort'){trace.push('abort-before');abort.abort();trace.push('abort-after');code=7;child.stderr.emit('data',Buffer.from('fixture aborted'))}
    else{writeFileSync(target,'wave')}
   }
   trace.push(['close',code]);child.exitCode=code;child.emit('close',code,null)
  })
  return child as unknown as ChildProcess
 }
 // Node's named builtin bindings must observe the same temporary host seam as CommonJS callers.
 Object.defineProperty(childProcess,'spawn',{value:spawn,writable:true,configurable:true});syncBuiltinESMExports()
 try{
  let settled=false,tick=0
  const pending=extract({sourceFilePath:source,ffmpegPath:ffmpeg,outputDir:output,signal:abort.signal})
  trace.push('call-return')
  const ticker=()=>{if(!settled&&tick<100){trace.push(['microtask',++tick]);queueMicrotask(ticker)}}
  queueMicrotask(ticker)
  let result:unknown
  try{result=await pending;trace.push('fulfilled')}catch(error){result=error instanceof Error?{name:error.name,message:error.message}:{thrown:String(error)};trace.push('rejected')}
  settled=true
  return JSON.parse(JSON.stringify({trace,result,wav:existsSync(wav),copy:existsSync(join(output,'audio-copy.m4a'))}).split(root).join('<ROOT>')) as unknown
 }finally{Object.defineProperty(childProcess,'spawn',{value:original,writable:true,configurable:true});syncBuiltinESMExports();rmSync(root,{recursive:true,force:true})}
}
