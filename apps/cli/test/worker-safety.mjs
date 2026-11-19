// Defense in depth for library evaluation; namespaces remain the primary boundary.
import cp from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { resolve } from 'node:path';
const spawned=new Set();
export function ownPid(pid){if(!Number.isInteger(pid)||pid<=1)throw Error('invalid owned fixture PID');spawned.add(pid);return pid;}
const kill=process.kill.bind(process);
process.kill=(pid,signal)=>{if(!spawned.has(pid)||pid<=1)throw Error('fixture refused unknown PID');return kill(pid,signal);};
function executable(command){
  const value=String(command);
  if(value===process.execPath||value==='/bin/sh'||value==='/usr/bin/unshare'||value.startsWith(process.env.TMPDIR+'/')||value.includes('/node_modules/@esbuild/')||['yt-dlp','vidbee-desktop','open','cmd'].includes(value))return;
  throw Error('fixture refused uncontrolled worker executable: '+value);
}
for(const method of ['spawn','spawnSync','execFile','execFileSync','fork']){
  const original=cp[method].bind(cp);
  cp[method]=(command,...args)=>{executable(command);const child=original(command,...args);if(child?.pid)ownPid(child.pid);return child;};
}
for(const method of ['exec','execSync'])cp[method]=()=>{throw Error('fixture refused shell-string execution');};
function profile(path){
  if(typeof path==='number')return;
  const value=path instanceof URL?path.pathname:String(path);
  if(/\/(?:\.config|\.local\/opt)\/(?:vidbee|VidBee|VidBeep)(?:\/|$)/.test(resolve(value))&&!resolve(value).startsWith(process.env.TMPDIR+'/'))throw Error('fixture refused owner profile');
}
for(const method of ['open','openSync','stat','statSync','lstat','lstatSync','readdir','readdirSync','readFile','readFileSync','writeFile','writeFileSync','createReadStream','createWriteStream','access','accessSync']){
  const original=fs[method].bind(fs);fs[method]=(path,...args)=>{profile(path);return original(path,...args);};
}
for(const method of ['open','stat','lstat','readdir','readFile','writeFile','access']){const original=fs.promises[method].bind(fs.promises);fs.promises[method]=(path,...args)=>{profile(path);return original(path,...args);};}
syncBuiltinESMExports();
