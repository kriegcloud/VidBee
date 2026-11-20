import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Test-only observation boundary. The rewrite replaces this adapter with Effect service
// provisioning; the scenario names and committed observations remain unchanged.
export async function observeApproved(module, scenario) {
  if(scenario.kind==='deadline-clear') {
    const originalSet=globalThis.setTimeout, originalClear=globalThis.clearTimeout;
    const scheduled=[], cleared=[];
    try {
      globalThis.setTimeout=(callback,ms)=>{scheduled.push({callback,ms});return scheduled.length;};
      globalThis.clearTimeout=id=>cleared.push(id);
      const client=new module.AutomationClient({baseUrl:'http://fixture.invalid',token:'fixture',skipHandshake:true,requestTimeoutMs:123,fetch:async(_url,init)=>({ok:true,status:200,statusText:'OK',text:()=>scenario.finished?Promise.resolve('{}'):new Promise((_resolve,reject)=>{init.signal.addEventListener('abort',()=>reject(Error('fixture body aborted')));queueMicrotask(()=>scheduled[0].callback());})})});
      try { await client.stats(); } catch(error) { if(error.message!=='automation request failed: fixture body aborted') throw error; }
      return {cleared};
    } finally { globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear; }
  }
  if(scenario.kind==='descriptor')return module.readDescriptor({pathOverride:'/fixture/descriptor.json',exists:()=>true,readFile:()=>scenario.raw});
  if(scenario.kind==='handshake'){
    const client=new module.AutomationClient({baseUrl:'http://fixture.invalid'});
    client.rawFetch=async()=>({ok:true,status:200,json:{token:'fixture',expiresAt:Number(scenario.number)},bodyText:scenario.number});
    try{return {value:await client.handshake()};}catch(error){return {error:{message:error.message,code:error.code,status:error.status,body:error.body}};}
  }
  if(scenario.kind==='cache'){
    const dir=mkdtempSync(join(tmpdir(),'approved-cache-'));const path=join(dir,'cache.json');writeFileSync(path,scenario.raw);let fetched=0;
    try{const value=await module.checkUpgrade({current:'1.0',cachePath:path,now:()=>3000000000,fetchLatest:async()=>{fetched++;return {version:'2.0',fetchedAt:1000};}});return {value,fetched,bytes:readFileSync(path,'utf8')};}
    catch(error){return {error:{name:error.name,message:error.message},fetched};}finally{rmSync(dir,{recursive:true,force:true});}
  }
  throw Error('unknown approved scenario');
}
