import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs/promises'
import * as asar from '@electron/asar'
import { setTimeout as delay } from 'node:timers/promises'
import { mainInspector, captureFoundationMain } from './inspector.mjs'

/** Acquires the real document clients from an admitted renderer without adding a production debug global.
 * **Example** (Read preferences after a process restart)
 * ```js
 * import { captureRendererFoundation } from './packaged-services.mjs'
 * export async function readTheme(owned, cdp, command) {
 *   await captureRendererFoundation(owned, cdp, command)
 *   return cdp.evaluate('__services.clients.settings.getAll().then(value => value.theme)')
 * }
 * // The inspector command and cdp must target the admitted throwaway document.
 * ```
 * @category testing
 * @since 0.0.0
 */
export async function captureRendererFoundation(owned,cdp,command) {
 const view=async expression=>{const result=await cdp.evaluate(expression);assert(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));return result.result.value}
 const archive=path.join(owned.build,'resources/app.asar')
 const entry=asar.listPackage(archive).find(file=>file.includes('/renderer/assets/index-')&&file.endsWith('.js')&&asar.extractFile(archive,file.slice(1)).toString().includes('(0, import_client.createRoot)(rootElement)'))
 assert(entry,'Services adapter needs the renderer root binding')
 const code=asar.extractFile(archive,entry.slice(1)).toString()
 const line=code.slice(0,code.indexOf('(0, import_client.createRoot)(rootElement)')).split('\n').length-1
 await (async()=>{
  await command('Debugger.enable')
  const breakpoint=await command('Debugger.setBreakpointByUrl',{url:'vidbee://renderer/assets/'+path.basename(entry),lineNumber:line})
  const paused=command('$paused')
  await view('location.reload();true')
  const frame=await Promise.race([paused,delay(10000).then(()=>{throw Error('Services renderer capture deadline')})])
  const result=await command('Debugger.evaluateOnCallFrame',{callFrameId:frame.callFrames[0].callFrameId,expression:'globalThis.__services={document:getDesktopDocument(),clients:foundationClients};true',returnByValue:true})
  assert(!result.exceptionDetails,JSON.stringify(result.exceptionDetails))
  await command('Debugger.removeBreakpoint',{breakpointId:breakpoint.breakpointId});await command('Debugger.resume');await command('Debugger.disable');await delay(1500)
 })()
}

/** Runs the production clients inside an already verified throwaway worker and returns independent proof without changing the historical observations.
 * **Example** (Check native ownership after the packaged probes)
 * ```js
 * import assert from 'node:assert/strict'
 * import { packagedServices } from './packaged-services.mjs'
 * export async function verifyNativeWork(owned, cdp, command) {
 *   const proof = await packagedServices(owned, cdp, command)
 *   assert.equal(proof.nativeWork.afterDeparture.admission.appNative, 1)
 *   assert.equal(proof.nativeWork.released.admission.appNative, 0)
 * }
 * // owned comes from verifyWorker; cdp and command target only that admitted process.
 * ```
 * @category testing
 * @since 0.0.0
 */
export async function packagedServices(owned,cdp,command) {
 const main=await mainInspector(owned)
 const run=async expression=>{const result=await main.evaluate(`globalThis.__servicesInspectorPending=(0,eval)(${JSON.stringify(expression)})`,{awaitPromise:false}).catch(error=>{throw new Error('Owned main expression failed: '+expression,{cause:error})});assert(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));return result.result.value}
 const view=async expression=>{const result=await cdp.evaluate(expression);assert(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));return result.result.value}
 const phase=name=>fs.writeFile(path.join(owned.run,'services-phase.txt'),name)
 const capture=()=>captureRendererFoundation(owned,cdp,command)
 const counters=()=>run('({admission:__foundationNative.admission.stats(),settings:__foundationNative.events.settings.size(),kernel:__foundationNative.events.kernel.size(),home:__foundationNative.events.home.size(),retention:__foundationNative.admission.ledger.stats(),memory:process.memoryUsage()})')
 try {
  await phase('initial acquisition')
  await captureFoundationMain(main,()=>view("window.electron.ipcRenderer.invoke('app.getVersion')"))
  await capture()
  const before=await counters()
  const bridgeKeys=await view('Object.keys(window.vidbeeRpc).sort()');assert.deepEqual(bridgeKeys,['connect','disconnect','send','subscribe'])
  const reads=await view(`(async()=>{const c=__services.clients;const settings=await c.settings.getAll();const version=await c.app.getVersion();const os=await c.app.getOsVersion();const platform=await c.app.getPlatform();const kernel=await c.app.getYtDlpKernelStatus();const decorated=await window.electron.ipcRenderer.invoke('fs.getDefaultDownloadPath');return {settings,version,os,platform,kernel,decorated,stats:__services.document.retentionStats(),storage:__services.document.storage.stats()}})()`)
  assert.equal(reads.platform,'linux');assert(reads.version);assert(reads.os.startsWith('Linux '));assert.equal(reads.decorated,path.join(owned.run,'home'))
  // Avoid native picker UI: the decorated capability below uses a read-only API.
  const measurement=await view(`(async()=>{await window.electron.ipcRenderer.invoke('settings.set','foundationMeasurement','x'.repeat(459*1024));const snapshot=await __services.clients.settings.getAll();return {bytes:snapshot.foundationMeasurement.length,renderer:__services.document.retentionStats()}})()`)
  assert.equal(measurement.bytes,459*1024)
  const structuredMeasurement=await view(`(async()=>{const records=Array.from({length:2850},(_,i)=>({future:{a:1,b:0,c:1,d:0,e:1,f:0,g:1,h:0},browser:'chrome',id:'p'+i}));await window.electron.ipcRenderer.invoke('settings.set','foundationStructured',records);const snapshot=await __services.clients.settings.getAll();return {records:snapshot.foundationStructured.length,bytes:new TextEncoder().encode(JSON.stringify(snapshot,null,'\\t')).length,keys:Object.keys(snapshot.foundationStructured[0]),renderer:__services.document.retentionStats()}})()`)
  assert.equal(structuredMeasurement.records,2850);assert(structuredMeasurement.bytes>=2*459*1024);assert.deepEqual(structuredMeasurement.keys,['future','browser','id'])
  const depthMeasurement=await view(`(async()=>{const value=Array.from({length:63}).reduce(child=>({next:child}),'depth-leaf');await window.electron.ipcRenderer.invoke('settings.set','foundationDepth',value);const snapshot=await __services.clients.settings.getAll();let leaf=snapshot.foundationDepth;for(let i=0;i<63;i++)leaf=leaf.next;return {nativeDepth:64,leaf,renderer:__services.document.retentionStats()}})()`)
  assert.equal(depthMeasurement.nativeDepth,64);assert.equal(depthMeasurement.leaf,'depth-leaf')
  const original=reads.settings.theme,next=original==='dark'?'light':'dark'
  await view(`__services.clients.settings.set('theme',${JSON.stringify(next)})`)
  await capture()
  const persisted=await view(`__services.clients.settings.getAll()`)
  assert.equal(persisted.theme,next)
  await view(`__services.clients.settings.set('theme',${JSON.stringify(original)})`)
  await phase('capture')
  const image=await view(`(async()=>{const c=__services.clients;const png=await c.window.captureShareCard({kind:'caption',quote:{before:'',after:'',quote:'New RPC capture.',startMs:0,endMs:1000},tagline:'Synthetic fixture',sourceTitle:'Foundation'});await c.window.writeShareImage(png.buffer);return {bytes:png.byteLength,signature:Array.from(png.slice(0,8)),stats:__services.document.retentionStats()}})()`)
  assert.deepEqual(image.signature,[137,80,78,71,13,10,26,10])
  const settled=await counters();assert.equal(settled.admission.appNative,0)
  await run(`globalThis.__servicesDialog=process.mainModule.require('electron').dialog.showMessageBox;process.mainModule.require('electron').dialog.showMessageBox=()=>new Promise(resolve=>{globalThis.__servicesDialogResolve=resolve});true`)
  await view(`globalThis.__servicesPending=__services.clients.app.showMessageBox({message:'Owned pending native host'}).catch(()=>{});true`)
  for(let i=0;i<100;i++){if((await counters()).admission.appNative===1)break;await delay(20)}
  const nativeHeld=await counters();assert.equal(nativeHeld.admission.appNative,1)
  await capture()
  const afterDeparture=await counters();assert.equal(afterDeparture.admission.appNative,1)
  await run(`__servicesDialogResolve({response:0,checkboxChecked:false});process.mainModule.require('electron').dialog.showMessageBox=__servicesDialog;true`)
  for(let i=0;i<100;i++){if((await counters()).admission.appNative===0)break;await delay(20)}
  const nativeReleased=await counters();assert.equal(nativeReleased.admission.appNative,0)

  const single=await counters()
  await phase('second window')
  const second=await run(`(()=>{const e=process.mainModule.require('electron');const window=new e.BrowserWindow({show:false,webPreferences:{preload:process.resourcesPath+'/app.asar/out/preload/index.js',sandbox:false,contextIsolation:true,webSecurity:false}});globalThis.__servicesSecond=window;__foundationNative.registerWindow(window.webContents,'visible');globalThis.__servicesSecondLoad=window.loadURL('vidbee://renderer/index.html#/settings');__servicesSecondLoad.catch(error=>{globalThis.__servicesSecondLoadError=error.message});return window.webContents.id})()`)
  for(let i=0;i<100;i++){if((await counters()).settings>single.settings)break;await delay(50)}
  const two=await counters();assert(two.settings>single.settings,'Second owned window did not subscribe: '+JSON.stringify({single,two}))
  await run('__servicesSecond.destroy();true')
  for(let i=0;i<100;i++){if((await counters()).settings===single.settings)break;await delay(50)}
  const isolated=await counters();assert.equal(isolated.settings,single.settings);assert.equal(isolated.kernel,single.kernel)
  assert.equal(await view('__services.clients.app.getVersion()'),reads.version)
  await view("location.hash='/about';true");await delay(500)
  const about=await view('document.body.innerText');assert(about.includes(reads.version))
  await phase('injected panels')
  const panels=[]
  for(const [tab,label] of [['providers','AI'],['prompts','Skills'],['transcribe','Transcription'],['cookies','Cookies'],['account','Account'],['advanced','MCP']]){
    await view(`location.hash='/settings?tab=${tab}';true`);await delay(400)
    const text=await view('document.body.innerText')
    assert(text.includes(label),`Missing injected ${tab} panel`)
    panels.push({tab,label,text,controls:await view('document.querySelectorAll("button,input,select").length')})
  }

  await phase('transport failure')
  await run(`process.mainModule.require('electron').BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('vidbee://renderer')).webContents.send('vidbee:rpc:message:v1','{malformed');true`);await delay(50)
  assert(await view('Boolean(document.querySelector("[data-foundation-failure][role=alert]"))'))
  const failedCall=await view(`__services.clients.app.getVersion().then(()=>({rejected:false}),error=>({rejected:true,message:error.message}))`);assert(failedCall.rejected)
  await capture()
  const after=await counters()
  const finalRenderer=await view('({retention:__services.document.retentionStats(),storage:__services.document.storage.stats()})')
  assert(after.settings>0&&after.kernel>0,'Quit probe must retain active streams')
  return {panels,bridgeKeys,reads,measurement,structuredMeasurement,depthMeasurement,persistence:{original,written:next,afterReload:persisted.theme},image,secondWindow:{id:second,before:single,opened:two,closed:isolated},before,after,finalRenderer,nativeWork:{held:nativeHeld,afterDeparture,released:nativeReleased},failurePresented:true,failedCall,activeStreamsAtQuit:true}
 }finally{main.close()}
}
