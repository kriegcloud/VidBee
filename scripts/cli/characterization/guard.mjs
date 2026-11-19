// Loaded before either executable. The network namespace additionally prevents host access.
import fs from 'node:fs';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = process.env.CLI_FIXTURE_ROOT;
const append = fs.appendFileSync.bind(fs);
const trace = row => append(`${root}/trace.jsonl`, JSON.stringify(row) + '\n');
function record(name,path,args) {
  const value = path instanceof URL ? fileURLToPath(path) : String(path);
  if (/\/(?:\.config|\.local\/opt)\/(?:vidbee|VidBee|VidBeep)(?:\/|$)/.test(value) && !value.startsWith(`${root}/`)) throw new Error('fixture refused owner profile access');
  if (value.startsWith(`${root}/`) && !value.endsWith('trace.jsonl')) trace({file:name,path:value,...(name==='writeFile'?{bytes:Buffer.from(args[0]).toString('base64')}:{})});
}
const operations = [['existsSync','access'],['readFileSync','readFile'],['writeFileSync','writeFile'],['mkdirSync','mkdir'],['rmSync','rm'],['mkdtempSync','mkdtemp']];
for (const [method,operation] of operations) {
  const original=fs[method].bind(fs);
  fs[method]=(path,...args)=>{record(operation,path,args);return original(path,...args);};
}
for (const operation of ['access','readFile','writeFile','mkdir','rm','mkdtemp']) {
  const callback=fs[operation].bind(fs);
  fs[operation]=(path,...args)=>{record(operation,path,args);return callback(path,...args);};
  const promise=fs.promises[operation].bind(fs.promises);
  fs.promises[operation]=(path,...args)=>{record(operation,path,args);return promise(path,...args);};
}
if(process.env.CLI_THROW_STDOUT==='1')process.stdout.write=()=>{throw Error('fixture stdout failure');};
const owned = new Set([Number(process.env.CLI_LIVE_PID)]);
const spawn = cp.spawn.bind(cp);
cp.spawn = (command,args,options) => {
  if (!(String(command).startsWith(`${root}/bin/`) || ['yt-dlp','vidbee-desktop','open','cmd'].includes(command))) throw new Error('fixture refused uncontrolled executable');
  trace({spawn:command,args,options});
  const child=spawn(command,args,options); if(child.pid)owned.add(child.pid);
  const unref=child.unref.bind(child);child.unref=()=>{trace({unref:true});return unref();};
  return child;
};
// These APIs can bypass the public spawn binding; refuse them rather than silently omit tracing.
for(const name of ['exec','execSync','execFile','execFileSync','spawnSync','fork'])cp[name]=()=>{throw Error('fixture refused unobserved process API: '+name);};
const fetchImpl = globalThis.fetch;
globalThis.fetch = (url,init) => {
  const value=String(url);
  if(value==='https://registry.npmjs.org/@vidbee/cli/latest') return fetchImpl(`${process.env.CLI_FAKE_BASE}/registry`,init);
  if(!value.startsWith(`${process.env.CLI_FAKE_BASE}/`)) throw new Error('fixture refused unexpected endpoint');
  return fetchImpl(url,init);
};
const kill=process.kill.bind(process);
process.kill=(pid,signal)=>{if(!Number.isInteger(pid)||pid<=0||!owned.has(pid)) throw new Error('fixture refused unknown PID');trace({signal:signal??'SIGTERM',target:pid===Number(process.env.CLI_LIVE_PID)?'live':'spawned'});return kill(pid,signal);};
syncBuiltinESMExports();
