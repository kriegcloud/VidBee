// Synthetic worker boundary only: never load a native model or use external network.
const fs=require('node:fs')
const childProcess=require('node:child_process')
const {syncBuiltinESMExports}=require('node:module')
const Module=require('node:module')
const path=require('node:path')
const trace=value=>fs.appendFileSync(process.env.VIDBEE_ADMISSION_TRACE,JSON.stringify(value)+'\n')
const notify=value=>{if(process.send)process.send(value)}
const children=[]
let fetched=false,probeReady=false,notifiedReady=false
const ready=()=>{if(fetched&&probeReady&&!notifiedReady){notifiedReady=true;trace('audio-prepare-gate');notify({kind:'probe-ready'})}}
const spawn=childProcess.spawn
childProcess.spawn=function(command,args,options){const child=spawn.call(this,command,args,options);children.push(child);trace(['child-spawn',path.basename(command),child.pid]);notify({kind:'child',pid:child.pid});child.stdout?.on('data',bytes=>{if(String(bytes).includes('REVIEW_READY')){probeReady=true;ready()}});return child}
syncBuiltinESMExports()
const load=Module._load
Module._load=function(request,parent,main){if(request==='sherpa-onnx-node')throw new Error('unexpected native addon load');return load.call(this,request,parent,main)}
let rejectNow=false,fetches=0
const pending=[]
globalThis.fetch=()=>{trace(['fetch',++fetches]);notify({kind:'fetch'});fetched=true;ready();if(rejectNow)return Promise.reject(new Error('fixture prepare failed'));return new Promise((_resolve,reject)=>pending.push(reject))}
process.on('message',message=>{if(message&&message.kind==='reject-prepare'){trace('reject-prepare');rejectNow=true;for(const reject of pending.splice(0))reject(new Error('fixture prepare failed'))}})
process.on('unhandledRejection',error=>trace(['unhandledRejection',error instanceof Error?error.message:String(error)]))
process.on('exit',code=>{trace(['exit',code]);for(const child of children){if(child.exitCode===null&&child.signalCode===null){trace(['cleanup-child',child.pid]);try{child.kill('SIGKILL')}catch{}}}})
