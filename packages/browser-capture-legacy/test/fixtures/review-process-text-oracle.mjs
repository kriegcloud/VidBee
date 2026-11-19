import fs from 'node:fs';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { pathToFileURL } from 'node:url';
const actualExists=fs.existsSync;
fs.existsSync=p=>String(p).startsWith('/fixture/')?true:String(p).startsWith('/tmp/.X')?false:actualExists(p);
cp.spawnSync=(cmd,args)=>({stdout:cmd==='which'?`/fixture/${args[0]}\n`:'',status:0});
process.kill=()=>true;
const trace=[];
cp.spawn=(command,argv)=>{
 trace.push(['spawn',command,argv]);
 const child=new EventEmitter();child.pid=42;child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.kill=()=>true;
 if(command==='/fixture/pactl')queueMicrotask(()=>{child.stdout.emit('data',Buffer.from('first'));child.stdout.emit('data',Buffer.from('\ufeffsecond'));child.emit('close',0)});
 if(command==='/fixture/ffmpeg')queueMicrotask(()=>{child.stderr.emit('data',Buffer.from('\ufefffirst'));child.stderr.emit('data',Buffer.from('\ufeffsecond'));child.emit('close',1)});
 return child;
};
syncBuiltinESMExports();
const display=await import(process.argv[2]?pathToFileURL(process.argv[2]).href:'../../src/display.ts');
const recorder=await import(process.argv[2]?pathToFileURL(process.argv[2]).href:'../../src/recorder.ts');
const handle=await display.startVirtualDisplay({width:4,height:4});await handle.stop();
try{await recorder.measureGrabOrigin({ffmpegPath:'/fixture/ffmpeg',display:':90',scanWidth:4,scanHeight:4})}catch(e){trace.push(['error',e.message])}
console.log(JSON.stringify(trace));
