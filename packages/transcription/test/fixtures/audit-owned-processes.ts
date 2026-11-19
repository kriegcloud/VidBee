import assert from 'node:assert/strict'
import childProcess, { type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { afterEach } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
const roots:string[]=[]
const children:Array<{child:ChildProcess;group:boolean;closed:()=>boolean}>=[]
const temporary=fs.mkdtempSync
fs.mkdtempSync=new Proxy(temporary,{apply(target,thisArg,args){const root:unknown=Reflect.apply(target,thisArg,args);roots.push(String(root));return root}})
const spawn=childProcess.spawn
childProcess.spawn=new Proxy(spawn,{apply(target,thisArg,args){
 const child:ChildProcess=Reflect.apply(target,thisArg,args);const options:unknown=args[2]??args[1]
 const group=typeof options==='object'&&options!==null&&!Array.isArray(options)&&'detached' in options&&options.detached===true
 let closed=false;child.once('close',()=>{closed=true});children.push({child,group,closed:()=>closed});return child
}})
syncBuiltinESMExports()
// Cleanup is limited to handles acquired here and descendants whose argv names a
// temporary root allocated here. No process is selected by executable name.
afterEach(async()=>{
 const owned=children.splice(0)
 if(process.platform==='linux')for(const entry of fs.readdirSync('/proc')){
  if(!/^\d+$/.test(entry)||Number(entry)===process.pid)continue
  try{
   const argv=fs.readFileSync(`/proc/${entry}/cmdline`,'utf8')
   if(roots.some(root=>argv.includes(root+'/')||argv.includes(root+'\0'))){
    process.kill(Number(entry),'SIGKILL')
   }
  }catch(error){if(!(error instanceof Error&&'code' in error&&['ENOENT','ESRCH','EACCES'].includes(String(error.code))))throw error}
 }
 for(const {child,group} of owned){
  if(!child.pid)continue
  try{
   const alive=child.exitCode===null&&child.signalCode===null
   if(group&&process.platform!=='win32')process.kill(-child.pid,'SIGKILL')
   else if(alive)child.kill('SIGKILL')
  }catch(error){if(!(error instanceof Error&&'code' in error&&error.code==='ESRCH'))throw error}
 }
 const deadline=Date.now()+5000
 while(owned.some(item=>!item.closed())&&Date.now()<deadline)await delay(5)
 assert(owned.every(item=>item.closed()),'owned process close must precede temporary-root removal')
 for(const root of roots.splice(0))fs.rmSync(root,{recursive:true,force:true})
})
