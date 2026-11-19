// Frozen scenario interface. Port implementations adapt strict Effect services here;
// no production Promise facade or deep source import is required by the assertions.
import { EventEmitter } from 'node:events';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync, readFileSync } from 'node:fs';
function task(...args){const id=args.length?args[0]:'fixed';const status=args[1]??'completed';return {...(id===undefined?{}:{id}),status,attempt:1,maxAttempts:3};}
export async function observeProbe(module,events){const signals=[];const result=await module.runProbe({argv:['--version'],ytDlpPath:'/fixture/yt-dlp',stdoutMaxBytes:3,stderrTailBytes:3,spawner:(binary,args)=>{
    assert.equal(binary,'/fixture/yt-dlp');assert.deepEqual(args,['--version']);
    if(events[0][0]==='throw')throw Error(events[0][1]);
    const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=s=>signals.push(s);
    queueMicrotask(()=>{for(const [kind,value]of events){if(kind==='out'||kind==='err')child[kind==='out'?'stdout':'stderr'].emit('data',Buffer.from(value));else child.emit(kind,kind==='error'?Error(value):value);}});
    return child;
  }});return {result,signals};}

export async function observeAutomation(module,scenario){let now=1000,index=0;const calls=[];
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

export async function observeAutostart(module,platform,enabled=true,throws=false){const calls=[];let now=0;const result=await module.ensureDesktopReady(enabled,{platform,timeoutMs:5,pollIntervalMs:2,clock:()=>now,delay:async ms=>{calls.push(['delay',ms]);now+=ms;},descriptorOptions:{pathOverride:'/fixture/missing',exists:()=>false},spawnLauncher:(cmd,args)=>{calls.push([cmd,args]);if(throws)throw Error('launch failed');}});return {result,calls};}

export async function observeRuntime(module,argv,failure){const calls=[];const client={};
    for(const name of ['list','get','stats','removeFromHistory','add','cancel','pause','resume','retry'])if(failure!==`missing-${name}`)client[name]=async(...args)=>{calls.push([name,...args]);if(failure===name)throw Error(`${name} failed`);return name==='add'?{id:'fixed',task:task()}:name==='list'?{items:[],nextCursor:null}:name==='get'?{...task(),lastError:{stderrTail:'Authorization: secret'}}:{fixed:true};};
    const io={stdout:line=>calls.push(['stdout',line]),stderr:line=>calls.push(['stderr',line]),readVersion:()=>({cli:'1',contract:'1',changelog:'fixture'}),checkUpgrade:async()=>{throw Error('registry failed');},probe:async()=>{if(failure==='probe')throw Error('probe failed');return {kind:'success',stdout:'secret',stderr:'Authorization: secret',exitCode:7};},connect:async()=>{calls.push(['connect']);if(failure==='connect')throw Error('connect failed');if(failure==='connection-envelope')return {kind:'error',envelope:{ok:false,code:'DESKTOP_NOT_READY',message:'not ready'}};return {kind:'connected',client,teardown:async()=>{calls.push(['teardown']);throw Error('teardown failed');}};}};
    try{return {result:await module.run(argv,io),calls};}catch(error){return {error:error.message,calls};}
  }

export async function observeUpgrade(module,runRoot,raw,force=false,badPath=false){const path=join(runRoot,'upgrade.json');writeFileSync(path,raw);let fetched=0;try {return {value:await module.checkUpgrade({current:'1.0',cachePath:badPath?join(path,'impossible'):path,force,now:()=>3000000000,fetchLatest:async()=>{fetched++;return {version:'2.0',fetchedAt:1000};}}),fetched,bytes:readFileSync(path,'utf8')};}catch(error){return {error:{name:error.name,message:error.message},fetched};}}

export async function observeConnect(module,result,dead){
      const calls=[];
      const value=await module.connect({flags:{local:false,noAutostart:false,timeoutMs:5},readDescriptorImpl:()=>{calls.push(['read']);return dead?{ok:true,path:'/fixture/d',descriptor:{host:'localhost',port:1,pid:2147483647,pidStartedAt:0}}:{ok:false,path:'/fixture/d',envelope:{ok:false,code:'DESKTOP_NOT_READY',message:'fixture missing'}};},ensureDesktopReadyImpl:async(...args)=>{calls.push(['ensure',...args]);return result;},buildAutomationClient:()=>{throw Error('must not connect');}});
      return {value,calls};
    }
