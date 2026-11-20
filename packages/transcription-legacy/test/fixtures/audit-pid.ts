import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'

// File existence is not publication: writeFileSync creates the inode before its
// bytes reach it. In particular, Number('') is zero, which signals a process group.
export const readFixturePid = (path:string):number|null => {
 try{const text=readFileSync(path,'utf8');if(!/^[1-9]\d*\n$/.test(text))return null;const pid=Number(text);return Number.isSafeInteger(pid)&&pid>0?pid:null}catch{return null}
}
export const requireFixturePid = (path:string):number => {const pid=readFixturePid(path);assert(pid!==null,'fixture must publish a complete positive PID');return pid}
export const killFixtureProcess = (pid:number,markerPath:string):void => {
 assert(Number.isSafeInteger(pid)&&pid>0,'never signal a nonpositive fixture PID')
 if(process.platform!=='linux')return // Registered ChildProcess cleanup owns this platform.
 try{
  const argv=readFileSync(`/proc/${pid}/cmdline`,'utf8')
  if(!argv.includes(dirname(markerPath)+'/'))return // Already reaped or PID reused elsewhere.
  process.kill(pid,'SIGKILL')
 }catch(error){if(!(error instanceof Error&&'code' in error&&['ENOENT','ESRCH'].includes(String(error.code))))throw error}
}
