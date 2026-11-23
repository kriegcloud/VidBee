import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import * as asar from '@electron/asar'
import { setTimeout as delay } from 'node:timers/promises'
import { mainInspector } from './inspector.mjs'
// verifyWorker and mainInspector authenticate this owned process before any connection.
export async function packagedLogging(owned,cdp,command) {
 const main=await mainInspector(owned)
 const run=async code=>{const result=await main.evaluate(code);assert(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));return result.result.value}
 let restored=false
 try {
  await run(`(()=>{
   const electron=process.mainModule.require('electron'); const log=process.mainModule.require(process.resourcesPath+'/app.asar/node_modules/electron-log/main.js');
   const original=electron.ipcMain.listeners('vidbee:log'); if(original.length!==1)throw Error('Expected one logging ingress');
   const processMessage=log.processMessage; let active=false;
   globalThis.__fix1Messages=[];globalThis.__fix1Ingress=0;
   log.processMessage=function(...args){if(active)globalThis.__fix1Messages.push(args[0]);return processMessage.apply(this,args)};
   const wrapped=(event,input)=>{globalThis.__fix1Ingress++;active=true;try{return original[0](event,input)}finally{active=false}};
   electron.ipcMain.removeListener('vidbee:log',original[0]);electron.ipcMain.on('vidbee:log',wrapped);
   globalThis.__fix1Restore=()=>{electron.ipcMain.removeListener('vidbee:log',wrapped);electron.ipcMain.on('vidbee:log',original[0]);log.processMessage=processMessage};return true;
  })()`)
  // Capture the actual compiled encoder at the mounted renderer entrypoint.
  // This is an adapter seam, not a product API or a copied implementation.
  const archive=path.join(owned.build,'resources/app.asar')
  const entry=asar.listPackage(archive).find(file=>file.includes('/renderer/assets/')&&file.endsWith('.js')&&asar.extractFile(archive,file.slice(1)).toString().includes('var encodeDesktopLog ='))
  assert(entry,'Logging adapter needs updating: compiled encoder missing')
  const code=asar.extractFile(archive,entry.slice(1)).toString()
  const factory=code.indexOf('var makeDesktopDocument =');
  const offset=factory>=0?factory:code.indexOf('(0, import_client.createRoot)(rootElement)')
  assert(offset>=0,'Logging adapter needs updating: renderer root missing')
  await command('Debugger.enable')
  const breakpoint=await command('Debugger.setBreakpointByUrl',{url:'vidbee://renderer/assets/'+path.basename(entry),lineNumber:code.slice(0,offset).split('\n').length-1})
  const paused=command('$paused')
  await cdp.evaluate('location.reload();true')
  const frame=await Promise.race([paused,delay(10000).then(()=>{throw Error('Logging encoder capture deadline')})])
  const captured=await command('Debugger.evaluateOnCallFrame',{callFrameId:frame.callFrames[0].callFrameId,expression:'globalThis.__fix1Encode=encodeDesktopLog;true',returnByValue:true})
  assert(!captured.exceptionDetails,JSON.stringify(captured.exceptionDetails))
  await command('Debugger.removeBreakpoint',{breakpointId:breakpoint.breakpointId})
  await command('Debugger.resume');await command('Debugger.disable');await delay(1000)
  const send=await cdp.evaluate(`(()=>{
   const circle={label:'cycle'};circle.self=circle;
   const error=new TypeError('outer',{cause:new RangeError('inner')});error.stack='OUTER_COMPLETE_STACK';error.cause.stack='INNER_COMPLETE_STACK';
   const corpus=[[{nested:{error}}],[circle],[undefined],[42n],[],['unscoped']];
   for(let i=0;i<corpus.length;i++)window.electron.ipcRenderer.send('vidbee:log',__fix1Encode({level:'info',scope:i===5?'':'fix1-boundary',args:corpus[i]}));
   for(const level of ['error','warn','info','verbose','debug','silly'])window.electron.ipcRenderer.send('vidbee:log',__fix1Encode({level,scope:'fix1-boundary',args:['level:'+level]}));return true;
  })()`)
  assert(!send.exceptionDetails,JSON.stringify(send.exceptionDetails))
  let receipt
  for(let i=0;i<100;i++){receipt=await run(`(()=>{const rows=globalThis.__fix1Messages;return {ingress:globalThis.__fix1Ingress,count:rows.length}})()`);if(receipt.ingress>=12)break;await delay(20)}
  const result=await run(`(()=>{
   const r=globalThis.__fix1Messages;
   return {ingress:globalThis.__fix1Ingress,count:r.length,object:r[0]?.data[0]?.nested?.error?.message,nestedCause:r[0]?.data[0]?.nested?.error?.cause?.message,errorName:r[0]?.data[0]?.nested?.error?.name,errorStack:r[0]?.data[0]?.nested?.error?.stack,causeName:r[0]?.data[0]?.nested?.error?.cause?.name,causeStack:r[0]?.data[0]?.nested?.error?.cause?.stack,
    circular:r[1]?.data[0]?.self===r[1]?.data[0],undefinedKept:r[2]?.data.length===1&&r[2]?.data[0]===undefined,
    bigintKept:typeof r[3]?.data[0]==='bigint'&&r[3]?.data[0]===42n,empty:r[4]?.data.length===0,
    unscoped:!r[5]?.scope,levels:r.slice(6).map(row=>row.level)};
  })()`)
  assert.deepEqual(result,{ingress:12,count:12,object:'outer',nestedCause:'inner',errorName:'TypeError',errorStack:'OUTER_COMPLETE_STACK',causeName:'RangeError',causeStack:'INNER_COMPLETE_STACK',circular:true,undefinedKept:true,bigintKept:true,empty:true,unscoped:true,levels:['error','warn','info','verbose','debug','silly']})
  let requests
  for(let i=0;i<100;i++){try{requests=JSON.parse(await fs.readFile(path.join(owned.run,'otlp.json'),'utf8'));break}catch{await delay(20)}}
  assert(requests,'Enabled packaged SDK did not export')
  const resources=requests.flatMap(request=>request.decoded.resourceSpans)
  const spans=resources.flatMap(resource=>resource.scopeSpans.flatMap(scope=>scope.spans))
  assert.equal(spans.length,1);assert.equal(spans[0].name,'desktop.logging.ready')
  assert.equal(spans[0].traceId.length,24);assert.equal(spans[0].spanId.length,12)
  assert(BigInt(spans[0].endTimeUnixNano)>=BigInt(spans[0].startTimeUnixNano));assert(BigInt(spans[0].startTimeUnixNano)>0n)
  assert(resources[0].resource.attributes.some(a=>a.key==='service.name'&&a.value.stringValue==='vidbee-desktop'))
  assert(resources[0].resource.attributes.some(a=>a.key==='service.version'&&a.value.stringValue==='2.4.0'))
  assert(requests.every(request=>request.url==='/v1/traces'&&request.contentType==='application/x-protobuf'))
  await run('globalThis.__fix1Restore(); true');restored=true
  await run(`(()=>{const app=process.mainModule.require('electron').app;const fs=process.mainModule.require('node:fs');let before=0,will=0,second=0;app.on('before-quit',()=>{before++});app.on('will-quit',()=>{will++});app.on('will-quit',()=>{second++;fs.writeFileSync(${JSON.stringify(path.join(owned.run,'quit-proof.json'))},JSON.stringify({before,will,second}))});return true})()`)
  // Node waits for inspector clients at exit; release our owned observer first.
  main.close()
  const scheduled=await cdp.evaluate("setTimeout(()=>{void window.electron.ipcRenderer.invoke('app.quit')},25);true")
  assert(!scheduled.exceptionDetails)
  let exited=false
  for(let i=0;i<300;i++){try{await fs.access(`/proc/${owned.appPid}`)}catch{exited=true;break}await delay(50)}
  assert(exited,'Enabled logging prevented the owned app from quitting')
  const quit=JSON.parse(await fs.readFile(path.join(owned.run,'quit-proof.json'),'utf8'))
  assert.deepEqual(quit,{before:2,will:1,second:1})
  return {electronBoundary:result,quit,telemetry:{requests:requests.length,spans:spans.length,resource:'vidbee-desktop',version:'2.4.0',name:spans[0].name}}
 }finally{if(!restored)await run('globalThis.__fix1Restore?.(); true');main.close()}
}
