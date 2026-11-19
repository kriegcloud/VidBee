import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync, symlinkSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { reserved, probes, numbers } from './pure-vectors.mjs';
import * as old from '../../../fixtures/cli-pre-port/library.mjs';
const repo=fileURLToPath(new URL('../../../',import.meta.url));
const fixture=join(repo,'fixtures/cli-pre-port');
const scratch=mkdtempSync(join(tmpdir(),'cli-oracle-'));
const runRoot=join(scratch,'run');
const node=process.execPath;
let candidate, library, server, base, requests=[], script, live;
const hash=b=>createHash('sha256').update(b).digest('hex');
function task(...args){const id=args.length?args[0]:'fixed';const status=args[1]??'completed';return {...(id===undefined?{}:{id}),status,attempt:1,maxAttempts:3};}
before(async()=>{
  const manifest=JSON.parse(readFileSync(join(fixture,'manifest.json'),'utf8'));
  for(const [name,entry] of Object.entries(manifest.artifacts)){const bytes=readFileSync(join(fixture,name));assert.equal(bytes.length,entry.bytes);assert.equal(hash(bytes),entry.sha256);}
  const options={bundle:true,format:'esm',platform:'node',target:'node20',external:['better-sqlite3','electron','yt-dlp-wrap-plus','@opentelemetry/api'],legalComments:'inline',write:false,absWorkingDir:repo};
  candidate=(await build({...options,entryPoints:['apps/cli/src/bin.ts'],outfile:join(scratch,'candidate.mjs')})).outputFiles[0].contents;
  const lib=(await build({...options,entryPoints:['apps/cli/test/candidate.ts'],outfile:join(scratch,'candidate-library.mjs')})).outputFiles[0].contents;
  writeFileSync(join(scratch,'candidate-library.mjs'),lib);symlinkSync(join(repo,'node_modules'),join(scratch,'node_modules'));
  library=await import(pathToFileURL(join(scratch,'candidate-library.mjs')));
  live=spawn(node,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
  server=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;
    requests.push({method:req.method,target:req.url,headers:req.headers,body});
    const answer=script(req.url,requests.length,body);
    res.writeHead(answer.status??200,{'Content-Type':'application/json'});
    if(answer.hold){res.write('{"prefix":');answer.ready?.();return;}
    res.end(typeof answer.body==='string'?answer.body:JSON.stringify(answer.body));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{live?.kill('SIGKILL');server?.closeAllConnections();await new Promise(r=>server?server.close(r):r());});
process.on('exit',code=>{if(code===0)rmSync(scratch,{recursive:true,force:true});else process.stderr.write(`CLI failure evidence: ${scratch}\n`);});
function reset(vector,bytes){
  rmSync(runRoot,{recursive:true,force:true});
  for(const dir of ['bundle/dist/bin','home','config','cache','data','state','runtime','tmp','cwd','bin'])mkdirSync(join(runRoot,dir),{recursive:true});
  symlinkSync(join(repo,'node_modules'),join(runRoot,'bundle/node_modules'));
  writeFileSync(join(runRoot,'bundle/dist/index.mjs'),bytes);
  copyFileSync(join(fixture,'bin/vidbee.mjs'),join(runRoot,'bundle/dist/bin/vidbee.mjs'));
  writeFileSync(join(runRoot,'bundle/package.json'),JSON.stringify({name:'@vidbee/cli',version:'0.1.0'}));
  writeFileSync(join(runRoot,'descriptor.json'),vector.descriptor??JSON.stringify({version:1,host:'127.0.0.1',port:server.address().port,pid:live.pid,pidStartedAt:1}));
  writeFileSync(join(runRoot,'upgrade.json'),vector.cache??JSON.stringify({version:'1.2.3',fetchedAt:8000000000000000}));
  writeFileSync(join(runRoot,'mcp.json'),'{}');
  const fake=`#!${node}\nimport fs from 'node:fs';\nfs.writeFileSync(${JSON.stringify(join(runRoot,'child.json'))},JSON.stringify({argv:process.argv.slice(2),home:process.env.HOME,xdg:process.env.XDG_CONFIG_HOME}));\n${vector.child??"process.stdout.write('fixture stdout\\n');process.stderr.write('Authorization: secret\\n');process.exitCode=0;"}\n`;
  for(const name of ['yt-dlp','vidbee-desktop','open','cmd'])writeFileSync(join(runRoot,'bin',name),fake,{mode:0o755});
  // Extensionless controlled executables are ESM via the fixture-local package.
  writeFileSync(join(runRoot,'bin/package.json'),'{"type":"module"}');
  requests=[];
}
function environment(){return {HOME:join(runRoot,'home'),TMPDIR:join(runRoot,'tmp'),XDG_CONFIG_HOME:join(runRoot,'config'),XDG_CACHE_HOME:join(runRoot,'cache'),XDG_DATA_HOME:join(runRoot,'data'),XDG_STATE_HOME:join(runRoot,'state'),XDG_RUNTIME_DIR:join(runRoot,'runtime'),APPDATA:join(runRoot,'config'),LOCALAPPDATA:join(runRoot,'data'),VIDBEE_AUTOMATION_DESCRIPTOR:join(runRoot,'descriptor.json'),VIDBEE_MCP_CONFIG:join(runRoot,'mcp.json'),YTDLP_PATH:join(runRoot,'bin/yt-dlp'),FFMPEG_PATH:join(runRoot,'bin/ffmpeg'),PATH:join(runRoot,'bin'),LANG:'C.UTF-8',LC_ALL:'C.UTF-8',TZ:'UTC',CLI_FIXTURE_ROOT:runRoot,CLI_FAKE_BASE:base,CLI_LIVE_PID:String(live.pid)};}
function collect(child,{signal,ready,slow=false,closed=false,bothClosed=false,closeAfterFirst=false,deadlineMs=30000}={}){return new Promise((resolveResult,reject)=>{
  const stdout=[],stderr=[];let parentExit;
  const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('bounded fixture deadline exceeded'));},deadlineMs);
  child.on('error',reject);
  child.on('exit',(code,terminationSignal)=>{parentExit={code,signal:terminationSignal};});
  child.stdout.on('data',b=>{stdout.push(b);if(closeAfterFirst)child.stdout.destroy();if(slow){child.stdout.pause();setTimeout(()=>child.stdout.resume(),2);}});
  child.stderr.on('data',b=>stderr.push(b));
  if(closed)child.stdout.destroy();if(bothClosed)child.stderr.destroy();
  if(signal)ready.then(()=>child.kill(signal)).catch(reject);
  child.on('close',(code,terminationSignal)=>{clearTimeout(timer);resolveResult({stdout:Buffer.concat(stdout),stderr:Buffer.concat(stderr),code,signal:terminationSignal,parentExit});});
});}
function snapshot(){const files={};for(const name of ['child.json','upgrade.json'])if(existsSync(join(runRoot,name)))files[name]=readFileSync(join(runRoot,name)).toString('base64');return files;}
async function invoke(vector,bytes){
  reset(vector,bytes);
  const id=vector.id;
  let get=0;
  script=(url,count,body)=>{
    if(vector.respond)return vector.respond(url,count,body);
    if(url.endsWith('/handshake'))return {body:{token:'fixture-token',expiresAt:8000000000000000}};
    if(url.endsWith('/add'))return {body: id==='absent'?{}:{id:id===undefined?'fixed':id}};
    if(url.endsWith('/get')){get++;const returnedId=vector.pollId==='absent'?undefined:Object.hasOwn(vector,'pollId')?vector.pollId:(id==='absent'?undefined:id===undefined?'fixed':id);return {body:{task:task(returnedId,vector.wait && get===1?'queued':vector.status??'completed')}};}
    if(url.endsWith('/list'))return {body:{tasks:[{task:task()}],nextCursor:null}};
    if(url.endsWith('/stats'))return {body:{queued:0,running:0}};
    return {body:{ok:true}};
  };
  const argv=vector.args.map(v=>v==='@BASE@'?base:v==='@CACHE@'?join(runRoot,'upgrade.json'):v);
  const child=spawn(node,['--import',join(repo,'apps/cli/test/guard.mjs'),join(runRoot,vector.shim?'bundle/dist/bin/vidbee.mjs':'bundle/dist/index.mjs'),...argv],{cwd:join(runRoot,'cwd'),env:{...environment(),...(vector.throwStdout?{CLI_THROW_STDOUT:'1'}:{})}});
  const result=await collect(child,vector);
  return {...result,requests:[...requests],trace:existsSync(join(runRoot,'trace.jsonl'))?readFileSync(join(runRoot,'trace.jsonl'),'utf8'):'',files:snapshot()};
}
function equalBytes(a,b,label){if(!a.equals(b)){let i=0;while(i<Math.min(a.length,b.length)&&a[i]===b[i])i++;writeFileSync(join(scratch,'reference-output.bin'),a);writeFileSync(join(scratch,'candidate-output.bin'),b);assert.fail(`${label}: first differing byte ${i}; lengths ${a.length}/${b.length}; evidence ${scratch}`);}}
async function compare(vector){
 const reference=await invoke(vector,readFileSync(join(fixture,'index.mjs')));
 const actual=await invoke(vector,candidate);
 equalBytes(reference.stdout,actual.stdout,`stdout ${JSON.stringify(vector.args)}`);equalBytes(reference.stderr,actual.stderr,'stderr');
 for(const key of ['code','signal','requests','trace','files'])assert.deepEqual(actual[key],reference[key],`${key}: ${JSON.stringify(vector.args)}`);
 return actual;
}
const execVectors=[];
const add=(args,extra={})=>execVectors.push({args,...extra});
for(const [name,value] of reserved){const flag=`--vidbee-${name}`;add([`${flag}=false`]);if(value!==undefined){add([flag]);add([`${flag}=${value}`,':version']);add([flag,'--vidbee-pretty',':version']);}else add([flag,':version']);}
for(const n of numbers){add(['--vidbee-max-attempts',n,':version']);add(['--vidbee-timeout',n,':version']);}
for(const p of probes){add([p]);add([`${p}=x`]);}
for(const args of [['--vidb'],['--vidbe-wait'],['--vidbee-unknown'],['--vidbee-pretty','--vidbee-nope'],['--vidbee-api','broken','--vidbee-local',':version'],['--vidbee-api','broken','--version'],[':version'],[':version','ignored'],['--vidbee-pretty',':version'],[':upgrade','--cache','@CACHE@'],[':upgrade','--no-cache'],[':upgrade','--cache'],['-o','-'],['--','--version'],['--output','--version'],['--help']])add(args);
for(const family of ['status','rss','unknown','download','history'])add(['--vidbee-api','@BASE@',`:${family}`]);
for(const verb of ['list','status','logs','cancel','pause','resume','retry','unknown'])for(const slash of [false,true])for(const id of [undefined,'','--reason','fixed'])add(['--vidbee-api','@BASE@',slash?`:download/${verb}/ignored`:':download',...(slash?[]:[verb]),...(id===undefined?[]:[id]),...(verb==='pause'?['--reason=first','--reason','second']:[])]);
for(const command of [[':history','list','--status','running'],[':history/remove','','--flag','fixed'],[':download/list','--group','g','--group-key=h','--parent','p','--cursor=','--limit','2junk'],[':download/list','--status','wrong'],[':status','--vidbee-local']])add(['--vidbee-api','@BASE@',...command]);
for(const id of [42,false,null,'','absent'])for(const wait of [false,true])add(['--vidbee-api','@BASE@',...(wait?['--vidbee-wait']:[]),'https://example.invalid/v'],{id:wait?'admission':id,wait,pollId:id,looseId:id});
for(const status of ['failed','cancelled','paused','retry-scheduled'])add(['--vidbee-api','@BASE@','--vidbee-wait','https://example.invalid/v'],{status});
for(const args of [['--vidbee-no-retry','--vidbee-max-attempts','3'],['--vidbee-wait','--vidbee-detach'],['--password','secret','https://example.invalid/v?token=secret'],['','秘密','a b',"a'b"]])add(['--vidbee-api','@BASE@',...args]);
for(const descriptor of ['{','\ufeff{}','null','[]','{"version":2}','{"version":1}','{"version":1,"host":"localhost","port":1}'])add(['--vidbee-no-autostart',':status'],{descriptor});
for(const shim of [false,true])add(['--vidbee-api','@BASE@',':status'],{shim});
test(`permanent executable oracle (${execVectors.length} vectors, sequential same visible paths)`,{timeout:1_200_000},async()=>{
  for(const [index,vector] of execVectors.entries()){if(process.env.CLI_ORACLE_DEBUG)process.stderr.write(`${index}: ${JSON.stringify(vector.args)}\n`);const result=await compare(vector);assert.equal(result.signal,null);if(Object.hasOwn(vector,'looseId')){const gets=result.requests.filter(r=>r.target.endsWith('/get'));assert.equal(gets[0].body,JSON.stringify(vector.wait?{id:'admission'}:vector.looseId==='absent'?{}:{id:vector.looseId}));if(vector.wait)assert.equal(gets[1].body,JSON.stringify(vector.looseId==='absent'?{}:{id:vector.looseId}));assert.equal(result.code,0);}}
});
// Additional Node-boundary tests below use injected capabilities, never ambient HTTP/files/processes.
test('raw probe chunks, byte caps, UTF-8, null close and error/close races',{timeout:120000},async()=>{
  const { EventEmitter }=await import('node:events');
  const scenarios=[
    [['out',[0xef,0xbb,0xbf,0xe2]],['out',[0x82,0xac]],['err',[0xe2,0x82]],['err',[0xac,65,66]],['close',0]],
    [['out',[65,66,67]],['close',0]],
    [['out',[65,66,67,68]],['out',[69]],['close',0]],
    [['out',[65,66]],['out',[67,68]],['error','first'],['close',1]],
    [['close',null],['error','late']],
    [['error','first'],['close',0]],
    [['close',7]],
    [['throw','sync spawn']],
  ];
  async function observation(module,events){const signals=[];const result=await module.runProbe({argv:['--version'],ytDlpPath:'/fixture/yt-dlp',stdoutMaxBytes:3,stderrTailBytes:3,spawner:(binary,args)=>{
    assert.equal(binary,'/fixture/yt-dlp');assert.deepEqual(args,['--version']);
    if(events[0][0]==='throw')throw Error(events[0][1]);
    const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=s=>signals.push(s);
    queueMicrotask(()=>{for(const [kind,value]of events){if(kind==='out'||kind==='err')child[kind==='out'?'stdout':'stderr'].emit('data',Buffer.from(value));else child.emit(kind,kind==='error'?Error(value):value);}});
    return child;
  }});return {result,signals};}
  for(const events of scenarios)assert.deepEqual(await observation(library,events),await observation(old,events));
  const overflow=await observation(old,scenarios[2]);assert.deepEqual(overflow.signals,['SIGTERM']);assert.equal(overflow.result.envelope.code,'PROBE_OUTPUT_TOO_LARGE');
});
test('automation expiry, concurrent renewal, wire failures, one 401 retry and body rejection',{timeout:120000},async()=>{
  async function observation(module,scenario){let now=1000,index=0;const calls=[];
    const client=new module.AutomationClient({baseUrl:'http://fixture.invalid//',clock:()=>now,expiresAtSlackMs:10,...scenario.options,fetch:async(url,init)=>{
      calls.push({url,method:init.method,headers:init.headers,body:init.body});
      const response=scenario.responses[Math.min(index++,scenario.responses.length-1)];
      if(response.reject)throw Error(response.reject);
      return {ok:(response.status??200)<400,status:response.status??200,statusText:'Fixture',text:async()=>{if(response.readReject)throw Error(response.readReject);return response.body;}};
    }});
    const results=[];
    for(const operation of scenario.ops){try{if(operation==='concurrent')results.push(await Promise.all([client.ensureToken(),client.ensureToken()]));else if(operation==='advance'){now=1010;results.push(null);}else results.push(await client[operation](...(operation==='list'?[{}]:operation==='get'?['fixed']:[])));}catch(error){results.push({name:error.name,message:error.message,code:error.code,status:error.status,body:error.body});}}
    return {calls,results};
  }
  const hs={body:'{"token":"renewed","expiresAt":1020}'};
  const cases=[
    {ops:['ensureToken','advance','ensureToken'],responses:[hs,hs]},
    {ops:['concurrent'],responses:[hs,hs]},
    {ops:['ensureToken'],options:{token:'supplied'},responses:[hs]},
    {ops:['ensureToken'],options:{token:'',skipHandshake:true},responses:[hs]},
    {ops:['stats'],options:{token:'supplied',skipHandshake:true},responses:[{status:401,body:'no'}]},
    ...[401,403,500].map(status=>({ops:['stats'],responses:[hs,{status,body:'error'},hs,{status:401,body:'retry error'}]})),
    ...['','{','null','false','0','"scalar"','{}','{"tasks":null}','{"tasks":[{"task":null}],"nextCursor":false}'].flatMap(body=>['list','get','stats'].map(op=>({ops:[op],responses:[hs,{body}]}))),
    {ops:['stats'],responses:[hs,{readReject:'body failed'}]},
    {ops:['stats'],responses:[{reject:'fetch failed'}]},
    ...['1e999','-1e999'].map(expiry=>({ops:['handshake'],responses:[{body:`{"token":"overflow","expiresAt":${expiry}}`}],deliberateChange:'finite-handshake-expiry'})),
  ];
  for(const scenario of cases)assert.deepEqual(await observation(library,scenario),await observation(old,scenario));
  assert.equal((await observation(old,cases[0])).calls.length,2);
  assert.equal((await observation(old,cases[1])).calls.length,2);
});
test('descriptor paths, deliberate nonfinite fields, syntax exceptions and liveness seam',{timeout:120000},async()=>{
  for(const module of [old,library]){
    for(const platform of ['linux','darwin','win32','freebsd']){
      const opts={platform,homedir:()=>'/fixture/home',env:{XDG_CONFIG_HOME:'/fixture/config',APPDATA:'/fixture/appdata'}};
      assert.equal(module.resolveDescriptorPath(opts),old.resolveDescriptorPath(opts));
      assert.equal(module.resolveDescriptorPath({...opts,pathOverride:'/fixture/explicit',envOverride:'/fixture/env'}),'/fixture/explicit');
      assert.equal(module.resolveDescriptorPath({...opts,envOverride:' /literal '}),' /literal ');
    }
    assert.equal(module.isPidAlive(123,()=>false),true);
    assert.equal(module.isPidAlive(123,()=>{throw Error('EPERM');}),false);
  }
  const valid={version:1,host:'localhost',port:27100,pid:123,pidStartedAt:1,tokenIssuedAt:2,tokenExpiresAt:3,updatedAt:4};
  const fields=['port','pid','pidStartedAt','tokenIssuedAt','tokenExpiresAt','updatedAt'];
  for(const field of fields)for(const number of ['1e999','-1e999']){
    const raw=JSON.stringify({...valid,[field]:'NUMBER'}).replace('"NUMBER"',number);
    const options={pathOverride:'/fixture/descriptor.json',exists:()=>true,readFile:()=>raw};
    const reference=old.readDescriptor(options);assert.equal(reference.ok,true);assert.equal(reference.descriptor[field],Number(number));
    assert.deepEqual(library.readDescriptor(options),reference); // section 9: rewrite this assertion only at port
  }
  for(const raw of ['{','\ufeff{}','{\n"x":}','null','false','42','[]',JSON.stringify(valid)]){
    const opts={pathOverride:'/fixture/descriptor.json',exists:()=>true,readFile:()=>raw};assert.deepEqual(library.readDescriptor(opts),old.readDescriptor(opts));
  }
  const readFailure={pathOverride:'/fixture/d',exists:()=>true,readFile:()=>{throw Error('fixture read failure');}};
  assert.deepEqual(library.readDescriptor(readFailure),old.readDescriptor(readFailure));
});
test('autostart platform argv, synchronous launch failure and exact injected deadline',{timeout:120000},async()=>{
  async function observe(module,platform,enabled=true,throws=false){const calls=[];let now=0;const result=await module.ensureDesktopReady(enabled,{platform,timeoutMs:5,pollIntervalMs:2,clock:()=>now,delay:async ms=>{calls.push(['delay',ms]);now+=ms;},descriptorOptions:{pathOverride:'/fixture/missing',exists:()=>false},spawnLauncher:(cmd,args)=>{calls.push([cmd,args]);if(throws)throw Error('launch failed');}});return {result,calls};}
  for(const platform of ['linux','darwin','win32','freebsd'])for(const enabled of [false,true])for(const throws of [false,true])assert.deepEqual(await observe(library,platform,enabled,throws),await observe(old,platform,enabled,throws));
  assert.deepEqual((await observe(old,'linux')).result,{kind:'timeout',waitedMs:6});
});
test('runtime catch regions, capability absence, sequential history removal, teardown swallowing',{timeout:120000},async()=>{
  async function observation(module,argv,failure){const calls=[];const client={};
    for(const name of ['list','get','stats','removeFromHistory','add','cancel','pause','resume','retry'])if(failure!==`missing-${name}`)client[name]=async(...args)=>{calls.push([name,...args]);if(failure===name)throw Error(`${name} failed`);return name==='add'?{id:'fixed',task:task()}:name==='list'?{items:[],nextCursor:null}:name==='get'?{...task(),lastError:{stderrTail:'Authorization: secret'}}:{fixed:true};};
    const io={stdout:line=>calls.push(['stdout',line]),stderr:line=>calls.push(['stderr',line]),readVersion:()=>({cli:'1',contract:'1',changelog:'fixture'}),checkUpgrade:async()=>{throw Error('registry failed');},probe:async()=>{if(failure==='probe')throw Error('probe failed');return {kind:'success',stdout:'secret',stderr:'Authorization: secret',exitCode:7};},connect:async()=>{calls.push(['connect']);if(failure==='connect')throw Error('connect failed');if(failure==='connection-envelope')return {kind:'error',envelope:{ok:false,code:'DESKTOP_NOT_READY',message:'not ready'}};return {kind:'connected',client,teardown:async()=>{calls.push(['teardown']);throw Error('teardown failed');}};}};
    try{return {result:await module.run(argv,io),calls};}catch(error){return {error:error.message,calls};}
  }
  for(const argv of [['--vidbee-pretty','--vidbee-nope'],['--vidbee-api','bad',':version'],[':version'],[':upgrade'],[':upgrade','--no-cache'],['--version'],['https://example.invalid'],['--vidbee-wait','https://example.invalid'],[':unknown'],[':download','list','--unknown'],[':download/pause','fixed','--reason=a','--reason=b'],[':history/remove','','fixed','third'],...['cancel','pause','resume','retry'].map(v=>[':download',v,'fixed'])])for(const failure of ['none','connect','connection-envelope','stats','list','add','probe','removeFromHistory','missing-add','missing-cancel','missing-pause','missing-resume','missing-retry'])assert.deepEqual(await observation(library,argv,failure),await observation(old,argv,failure));
});
test('upgrade TTL, future cache, syntax, write failure, ISO range and version candidates',{timeout:120000},async()=>{
  reset({},candidate);
  async function observation(module,raw,force=false,badPath=false){const path=join(runRoot,'upgrade.json');writeFileSync(path,raw);let fetched=0;try {return {value:await module.checkUpgrade({current:'1.0',cachePath:badPath?join(path,'impossible'):path,force,now:()=>3000000000,fetchLatest:async()=>{fetched++;return {version:'2.0',fetchedAt:1000};}}),fetched,bytes:readFileSync(path,'utf8')};}catch(error){return {error:{name:error.name,message:error.message},fetched};}}
  for(const raw of ['{','null','{}',...[-Infinity,NaN,0,3000000000-2592000000,3000000000-2592000000+1,8000000000000000,8640000000000001].map(fetchedAt=>JSON.stringify({version:'2.0',fetchedAt})),'{"version":"2.0","fetchedAt":1e999}'])for(const force of [false,true])for(const bad of [false,true])assert.deepEqual(await observation(library,raw,force,bad),await observation(old,raw,force,bad));
  const paths=[join(runRoot,'one.json'),join(runRoot,'two.json')];
  for(const raw of ['{','null','{}','{"name":"other","version":"4"}','{"name":"@vidbee/cli","version":""}','{"name":"@vidbee/cli","version":42}']){writeFileSync(paths[0],raw);writeFileSync(paths[1],'{"name":"@vidbee/cli","version":"2.3.4"}');assert.deepEqual(library.readCliVersion(paths),old.readCliVersion(paths));}
  assert.equal(old.readCliVersion([]).cli,'0.0.0-dev');
});
async function until(predicate){const deadline=setTimeout(()=>{},90000);try{for(let i=0;i<9000;i++){const value=predicate();if(value)return value;await new Promise(r=>setTimeout(r,10));}throw Error('readiness condition not reached');}finally{clearTimeout(deadline);}}
async function signalObservation(bytes,point,signal,shell=false){
  const childCode=`fs.writeFileSync(${JSON.stringify(join(runRoot,'owned-child.pid'))},String(process.pid));process.on('SIGTERM',()=>fs.appendFileSync(${JSON.stringify(join(runRoot,'child-signals'))},'SIGTERM\\n'));process.on('SIGINT',()=>fs.appendFileSync(${JSON.stringify(join(runRoot,'child-signals'))},'SIGINT\\n'));setInterval(()=>{},1000);`;
  reset({child:childCode},bytes);
  let bodyReady=false;
  script=url=>{if(url.endsWith('/handshake'))return {body:{token:'fixture',expiresAt:8000000000000000}};if(url.endsWith('/stats'))return {hold:true,ready:()=>{bodyReady=true;}};return {body:{}};};
  if(point==='autostart')rmSync(join(runRoot,'descriptor.json'));
  const args=point==='http'?['--vidbee-api',base,':status']:point==='probe'?['--version']:point==='local'?['--vidbee-local','--vidbee-wait','https://example.invalid/v']:['--vidbee-timeout','60000',':status'];
  const command=[node,'--import',join(repo,'apps/cli/test/guard.mjs'),join(runRoot,'bundle/dist/index.mjs'),...args];
  const cli=spawn(shell?'/bin/sh':command[0],shell?['-c','"$@" & child=$!; printf "%s" "$child" > "$CLI_FIXTURE_ROOT/shell-child.pid"; wait "$child"; code=$?; exit "$code"','cli-shell',...command]:command.slice(1),{cwd:join(runRoot,'cwd'),env:environment()});
  let owned;
  const readiness=until(()=>point==='http'?bodyReady:existsSync(join(runRoot,'owned-child.pid')));
  const collecting=collect(cli,{deadlineMs:90000});
  await readiness;
  if(point!=='http')owned=Number(readFileSync(join(runRoot,'owned-child.pid'),'utf8'));
  const target=shell?Number(await until(()=>existsSync(join(runRoot,'shell-child.pid'))&&readFileSync(join(runRoot,'shell-child.pid'),'utf8'))):cli.pid;
  const exited=new Promise(r=>cli.once('exit',r));
  process.kill(target,signal);
  await exited;
  let childSurvived=null;
  if(owned){try{process.kill(owned,0);childSurvived=true;}catch{childSurvived=false;}}
  const childSignals=existsSync(join(runRoot,'child-signals'))?readFileSync(join(runRoot,'child-signals'),'utf8'):'';
  // Harness-only cleanup after parent exit and survival observation; never attributed to production.
  if(owned){try{process.kill(owned,'SIGKILL');}catch{}}
  const result=await collecting;
  server.closeAllConnections();
  return {stdout:result.stdout,stderr:shell?undefined:result.stderr,code:result.code,signal:result.signal,childSurvived,childSignals};
}
test('SIGINT/SIGTERM preserve default termination at HTTP body, probe and detached autostart readiness',{timeout:90000},async()=>{
  for(const point of ['http','probe','autostart'])for(const signal of ['SIGINT','SIGTERM']){
    const reference=await signalObservation(readFileSync(join(fixture,'index.mjs')),point,signal);
    const actual=await signalObservation(candidate,point,signal);
    assert.deepEqual(actual,reference);assert.equal(actual.code,null);assert.equal(actual.signal,signal);
    assert.equal(actual.childSignals,'');if(point!=='http')assert.equal(actual.childSurvived,true);
  }
  for(const signal of ['SIGINT','SIGTERM']){
    const reference=await signalObservation(readFileSync(join(fixture,'index.mjs')),'http',signal,true);
    const actual=await signalObservation(candidate,'http',signal,true);
    assert.deepEqual(actual,reference);assert.equal(actual.code,signal==='SIGINT'?130:143);assert.equal(actual.signal,null);
  }
});
test('local memory/SQLite startup, injected executor and idempotent shutdown',{timeout:120000},async()=>{
  for(const module of [old,library])for(const persist of ['memory','sqlite']){
    const path=join(scratch,`local-${module===old?'old':'candidate'}.db`);
    const calls=[];
    const handle=await module.createLocalClient({persist,sqlitePath:path,defaultDownloadDir:join(scratch,'downloads'),executor:{run:()=>{calls.push('run');return {cancel:async()=>calls.push('cancel'),pause:async()=>calls.push('pause')};}}});
    assert.deepEqual(await handle.list({}),{items:[],nextCursor:null});
    await assert.rejects(handle.get('missing'),{message:'task missing not found'});
    const originalStop=handle.api.stop.bind(handle.api);let stopped=0;
    handle.api.stop=async()=>{stopped++;await originalStop();throw Error('fixture stop failure');};
    await handle.shutdown();await handle.shutdown();assert.equal(stopped,1);
    if(persist==='sqlite')assert.equal(existsSync(path),true);
    assert.deepEqual(calls,[]);
  }
});
test('local queue SIGINT/SIGTERM leave the owned extractor alive',{timeout:90000},async()=>{
  for(const signal of ['SIGINT','SIGTERM']){
    const reference=await signalObservation(readFileSync(join(fixture,'index.mjs')),'local',signal);
    const actual=await signalObservation(candidate,'local',signal);
    assert.deepEqual(actual,reference);assert.equal(actual.code,null);assert.equal(actual.signal,signal);assert.equal(actual.childSurvived,true);assert.equal(actual.childSignals,'');
  }
});
test('output lifetime baseline: large pretty output with slow/closed readers, direct and shim',{timeout:90000},async()=>{
  const payload={text:'x'.repeat(512*1024)};
  for(const shim of [false,true]){
    const vector={args:['--vidbee-api','@BASE@','--vidbee-pretty',':status'],shim,slow:true,respond:url=>({body:url.endsWith('/handshake')?{token:'fixture',expiresAt:8000000000000000}:payload})};
    // Section 9 deliberate change: legacy immediate exit may emit only a prefix.
    // Preserve its observed bytes as evidence; the port must replace this with complete-output assertions.
    const expected=Buffer.from(JSON.stringify({ok:true,mode:'subcommand',subcommand:'status',result:payload},null,2)+'\n');
    for(const bytes of [readFileSync(join(fixture,'index.mjs')),candidate]){
      const result=await invoke(vector,bytes);assert.equal(result.code,0);assert.equal(result.stderr.length,0);assert.ok(result.stdout.length>0);assert.ok(expected.subarray(0,result.stdout.length).equals(result.stdout));
      for(const [closedPipe,bothClosed,closeAfterFirst] of [[true,false,false],[true,true,false],[false,false,true]]){const closed=await invoke({...vector,slow:false,closed:closedPipe,bothClosed,closeAfterFirst},bytes);assert.ok(Number.isInteger(closed.code)||closed.signal!==null);}
    }
  }
});
test('wire error executable envelopes, registry BOM/syntax/status and ambient-token nonuse',{timeout:120000},async()=>{
  const handshake={token:'fixture',expiresAt:8000000000000000};
  for(const body of ['','{','null','false','0','"scalar"','{"task":null}']){
    const vector={args:['--vidbee-api','@BASE@','https://example.invalid/v'],respond:url=>({body:url.endsWith('/handshake')?handshake:url.endsWith('/add')?{id:42}:body})};
    const result=await compare(vector);assert.equal(result.code,2);assert.equal(JSON.parse(result.stdout).code,'UNKNOWN_ERROR');
  }
  for(const status of [401,403,500]){
    let count=0;
    const vector={args:['--vidbee-api','@BASE@',':status'],respond:url=>url.endsWith('/handshake')?{body:handshake}:{status,body:'failure'}};
    const result=await compare(vector);assert.equal(result.code,2);
    assert.equal(result.requests.filter(r=>r.target.endsWith('/stats')).length,status===401?2:1);
  }
  for(const raw of ['{','{\n"x":}','','\ufeff{}','null','false','{"version":42}']){
    const vector={args:[':upgrade','--force','--cache','@CACHE@'],respond:()=>({body:raw})};
    const reference=await invoke(vector,readFileSync(join(fixture,'index.mjs')));const actual=await invoke(vector,candidate);
    equalBytes(reference.stdout,actual.stdout,'registry failure stdout');assert.equal(actual.code,3);
    assert.equal(actual.requests[0].target,'/registry');assert.equal(actual.requests[0].headers.accept,'application/json');
  }
  const result=await compare({args:['--vidbee-token','supplied','--vidbee-api','@BASE@',':status'],respond:()=>({status:401,body:'denied'})});
  assert.equal(JSON.parse(result.stdout).message,'skipHandshake set but no token provided');assert.equal(result.requests.length,1);
});
test('override descriptor failures never fall back to a default port or path',{timeout:30000},async()=>{
  const vector={args:['--vidbee-no-autostart',':status'],descriptor:'{'};
  const result=await compare(vector);assert.equal(result.code,3);assert.deepEqual(result.requests,[]);
  const reads=result.trace.split('\n').filter(Boolean).map(v=>JSON.parse(v));
  assert.ok(reads.some(v=>v.path===join(runRoot,'descriptor.json')));
  assert.ok(reads.every(v=>!v.path?.endsWith('/VidBee/automation.json')));
});
test('registry BOM success strips BOM and writes the directly serialized cache',{timeout:30000},async()=>{
  for(const bytes of [readFileSync(join(fixture,'index.mjs')),candidate]){
    const result=await invoke({args:[':upgrade','--force','--cache','@CACHE@'],respond:()=>({body:'\ufeff{"version":"2.0.0"}'})},bytes);
    assert.equal(result.code,0);const envelope=JSON.parse(result.stdout);assert.equal(envelope.result.latest,'2.0.0');assert.equal(envelope.result.cached,false);
    const cached=JSON.parse(Buffer.from(result.files['upgrade.json'],'base64').toString('utf8'));
    assert.equal(cached.version,'2.0.0');assert.equal(cached.fetchedAt,Date.parse(envelope.result.cachedAt));assert.ok(Number.isFinite(cached.fetchedAt));
  }
});
test('missing probe executable and asynchronous launcher failure retain their failure boundaries',{timeout:90000},async()=>{
  for(const bytes of [readFileSync(join(fixture,'index.mjs')),candidate]){
    reset({},bytes);rmSync(join(runRoot,'bin/yt-dlp'));script=()=>({body:{}});
    const child=spawn(node,['--import',join(repo,'apps/cli/test/guard.mjs'),join(runRoot,'bundle/dist/index.mjs'),'--version'],{cwd:join(runRoot,'cwd'),env:environment()});
    const result=await collect(child);assert.equal(result.code,5);const env=JSON.parse(result.stdout);assert.equal(env.code,'NOT_IMPLEMENTED');assert.equal(env.message,`yt-dlp spawn error: spawn ${join(runRoot,'bin/yt-dlp')} ENOENT`);
    reset({},bytes);rmSync(join(runRoot,'descriptor.json'));rmSync(join(runRoot,'bin/vidbee-desktop'));
    const launcher=spawn(node,['--import',join(repo,'apps/cli/test/guard.mjs'),join(runRoot,'bundle/dist/index.mjs'),':status'],{cwd:join(runRoot,'cwd'),env:environment()});
    const failed=await collect(launcher,{deadlineMs:90000});assert.notEqual(failed.code,0);assert.ok(failed.stderr.length>0);
  }
});
test('probe overflow requests TERM without escalation; harness reaps only its ignored-TERM child',{timeout:90000},async()=>{
  const observations=[];
  for(const bytes of [readFileSync(join(fixture,'index.mjs')),candidate]){
    const code=`fs.writeFileSync(${JSON.stringify(join(runRoot,'owned-child.pid'))},String(process.pid));process.on('SIGTERM',()=>fs.writeFileSync(${JSON.stringify(join(runRoot,'term-observed'))},'SIGTERM'));process.stdout.write(Buffer.alloc(33*1024*1024,65));setInterval(()=>{},1000);`;
    reset({child:code},bytes);script=()=>({body:{}});
    const child=spawn(node,['--import',join(repo,'apps/cli/test/guard.mjs'),join(runRoot,'bundle/dist/index.mjs'),'--version'],{cwd:join(runRoot,'cwd'),env:environment()});
    const collecting=collect(child,{deadlineMs:90000});
    await until(()=>existsSync(join(runRoot,'term-observed')));
    const owned=Number(readFileSync(join(runRoot,'owned-child.pid'),'utf8'));
    assert.equal(readFileSync(join(runRoot,'term-observed'),'utf8'),'SIGTERM');process.kill(owned,0);
    // Production has no escalation or close; this SIGKILL is solely the fixture cleanup.
    process.kill(owned,'SIGKILL');const result=await collecting;
    assert.equal(result.code,1);assert.equal(JSON.parse(result.stdout).code,'PROBE_OUTPUT_TOO_LARGE');observations.push(result);
  }
  equalBytes(observations[0].stdout,observations[1].stdout,'overflow stdout');equalBytes(observations[0].stderr,observations[1].stderr,'overflow stderr');
});
test('local optional-addon/start failures retain their error and temporary-directory leak',{timeout:120000},async()=>{
  for(const mode of ['missing','ddl']){
    const observations=[];
    for(const [name,path] of [['reference',join(fixture,'library.mjs')],['candidate',join(scratch,'candidate-library.mjs')]]){
      const temp=join(scratch,`${mode}-${name}`);mkdirSync(temp);
      const source=`import Module from 'node:module';import fs from 'node:fs';const load=Module._load;Module._load=function(id,...rest){if(id==='better-sqlite3'){if(${JSON.stringify(mode)}==='missing')throw Error('fixture missing addon');return class{exec(){throw Error('fixture DDL failed')}};}return load.call(this,id,...rest);};const module=await import(${JSON.stringify(pathToFileURL(path).href)});try{await module.createLocalClient({persist:'sqlite',defaultDownloadDir:${JSON.stringify(join(scratch,'downloads'))}});}catch(error){process.stdout.write(JSON.stringify({message:error.message,temporaryDirectories:fs.readdirSync(process.env.TMPDIR).filter(name=>name.startsWith('vidbee-cli-')).length}));}`;
      const child=spawn(node,['--input-type=module','-e',source],{env:{...environment(),TMPDIR:temp},cwd:scratch});
      const result=await collect(child);assert.equal(result.code,0);observations.push(JSON.parse(result.stdout));
    }
    assert.deepEqual(observations[0],observations[1]);assert.equal(observations[0].temporaryDirectories,1);assert.equal(observations[0].message,mode==='missing'?'fixture missing addon':'fixture DDL failed');
  }
});
test('local SQLite supplied-path reopen preserves queued input and shutdown removes owned temp dirs',{timeout:120000},async()=>{
  for(const [index,module] of [old,library].entries()){
    const initial=readdirSync(process.env.TMPDIR).filter(name=>name.startsWith('vidbee-cli-'));
    const path=join(scratch,`reopen-${index}.db`);
    const options={persist:'sqlite',sqlitePath:path,maxConcurrency:0,defaultDownloadDir:join(scratch,'downloads'),executor:{run:()=>{throw Error('must remain queued');}}};
    const first=await module.createLocalClient(options);
    const created=await first.add({input:{url:'https://example.invalid/v',kind:'yt-dlp-forward',rawArgs:['--unknown','秘密'],options:{nested:{unknown:true}}}});
    assert.equal(created.task.status,'queued');
    await first.shutdown();assert.deepEqual(readdirSync(process.env.TMPDIR).filter(name=>name.startsWith('vidbee-cli-')),initial);
    const second=await module.createLocalClient(options);const saved=await second.get(created.id);assert.deepEqual(saved.input,created.task.input);assert.equal(saved.status,'queued');await second.shutdown();assert.ok(existsSync(path));
  }
});
test('injected HTTP deadline lasts through body consumption without elapsed-time assertions',{timeout:30000},async()=>{
  for(const module of [old,library]){
    const originalSet=globalThis.setTimeout;const originalClear=globalThis.clearTimeout;const scheduled=[];const cleared=[];
    try{
      globalThis.setTimeout=(callback,ms)=>{scheduled.push({callback,ms});return scheduled.length;};
      globalThis.clearTimeout=id=>cleared.push(id);
      const client=new module.AutomationClient({baseUrl:'http://fixture.invalid',token:'fixture',skipHandshake:true,requestTimeoutMs:123,fetch:async(_url,init)=>({ok:true,status:200,statusText:'OK',text:()=>new Promise((_resolve,reject)=>{init.signal.addEventListener('abort',()=>reject(Error('fixture body aborted')));queueMicrotask(()=>scheduled[0].callback());})})});
      await assert.rejects(client.stats(),{message:'automation request failed: fixture body aborted'});
      assert.deepEqual(scheduled.map(v=>v.ms),[123]);assert.deepEqual(cleared,[1]);
    }finally{globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;}
  }
});
test('autostart exact final deadline check and live PID ignore recorded start time',{timeout:30000},async()=>{
  for(const module of [old,library]){
    let now=0,reads=0,launches=0;
    const descriptorOptions={pathOverride:'/fixture/d',exists:()=>{reads++;return now>=4;},readFile:()=>JSON.stringify({version:1,host:'localhost',port:1,pid:live.pid,pidStartedAt:-100})};
    const result=await module.ensureDesktopReady(true,{timeoutMs:4,pollIntervalMs:2,clock:()=>now,delay:async ms=>{now+=ms;},descriptorOptions,spawnLauncher:()=>{launches++;}});
    assert.deepEqual(result,{kind:'timeout',waitedMs:4});assert.equal(reads,3);assert.equal(launches,1);
    const ready=await module.ensureDesktopReady(false,{descriptorOptions});assert.deepEqual(ready,{kind:'ready'});
  }
});
test('shell statuses 130/143 also hold at probe, autostart and local readiness',{timeout:90000},async()=>{
  for(const point of ['probe','autostart','local'])for(const signal of ['SIGINT','SIGTERM']){
    const reference=await signalObservation(readFileSync(join(fixture,'index.mjs')),point,signal,true);
    const actual=await signalObservation(candidate,point,signal,true);assert.deepEqual(actual,reference);assert.equal(actual.code,signal==='SIGINT'?130:143);assert.equal(actual.childSurvived,true);assert.equal(actual.childSignals,'');
  }
});
test('unhandled raw stream/listener failures remain nonzero stderr failures',{timeout:90000},async()=>{
  for(const mode of ['stream','listener'])for(const path of [join(fixture,'library.mjs'),join(scratch,'candidate-library.mjs')]){
    const source=`import{EventEmitter}from'node:events';import{runProbe}from${JSON.stringify(pathToFileURL(path).href)};await runProbe({argv:[],ytDlpPath:'/fixture/executable',stdoutMaxBytes:0,spawner:()=>{const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>{throw Error('fixture listener failure');};queueMicrotask(()=>{if(${JSON.stringify(mode)}==='stream')child.stdout.emit('error',Error('fixture stream error'));else child.stdout.emit('data',Buffer.from('x'));});return child;}});`;
    const child=spawn(node,['--input-type=module','-e',source],{env:environment(),cwd:scratch});const result=await collect(child,{deadlineMs:90000});assert.notEqual(result.code,0);assert.ok(result.stderr.length>0);
  }
});
test('deliberate terminal fallback JSON uses stderr and exit two',{timeout:30000},async()=>{
  const result=await compare({args:[':version'],throwStdout:true});assert.equal(result.code,2);assert.equal(result.stdout.length,0);assert.equal(result.stderr.toString(),'{"ok":false,"code":"UNKNOWN_ERROR","message":"fixture stdout failure"}\n');
});
