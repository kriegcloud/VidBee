import assert from 'node:assert/strict'
import path from 'node:path'
import * as asar from '@electron/asar'
import { mainInspector } from './inspector.mjs'
import { setTimeout as delay } from 'node:timers/promises'
// All implementation-dependent adapter knowledge lives here. Locator failures are
// setup failures, never evidence that the characterized behavior changed.
function showHomeLocator(archive) {
  const missing = detail => {throw new Error(`Show Home adapter needs updating: ${detail}`)}
  const rootBinding='(0, import_client.createRoot)(rootElement)'
  const effectText='ipcEvents.on(APP_ICON_SHOW_HOME_CHANNEL'
  for(const file of asar.listPackage(archive).filter(file=>file.includes('/renderer/assets/index-')&&file.endsWith('.js'))) {
    const code=asar.extractFile(archive,file.slice(1)).toString(),offset=code.indexOf(rootBinding)
    if(offset<0)continue
    if(!code.includes(effectText))missing('consumer effect locator missing')
    return {entry:file,line:code.slice(0,offset).split('\n').length-1,effectText,capture:'globalThis.__foundationClient=import_client;true',pause:pending=>Promise.race([pending,delay(10000).then(()=>missing('renderer breakpoint not reached'))]),missing}
  }
  return missing('renderer root binding missing')
}
export async function packagedEvents(owned,cdp,command) {
  const main=await mainInspector(owned)
  const run=async expression=>{const result=await main.evaluate(expression);assert(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));return result.result.value}
  const renderer=async expression=>{const result=await cdp.evaluate(expression);assert(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));return result.result.value}
  const electron="process.mainModule.require('electron')"
  const send=async(channel,value)=>run(`${electron}.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('vidbee://renderer')).webContents.send(${JSON.stringify(channel)},${JSON.stringify(value)})`)
  try {
    // React's commit hook exposes the actual mounted AppLayout effect. Gate only
    // its setup/cleanup boundaries; never replace its callback or navigation code.
    const locator=showHomeLocator(path.join(owned.build,'resources/app.asar'))
    await command('Page.enable')
    const hook=await command('Page.addScriptToEvaluateOnNewDocument',{source:`
      globalThis.__foundationDeliveries=[];
      globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__={supportsFiber:true,inject:()=>1,onCommitFiberUnmount:()=>{},onCommitFiberRoot:(_id,root)=>{
        globalThis.__foundationFiberRoot=root;const visit=fiber=>{if(!fiber)return;
          const last=fiber.updateQueue?.lastEffect;
          if(last){let effect=last.next;do{if(!globalThis.__foundationEffect&&effect.create?.toString().includes(${JSON.stringify(locator.effectText)})){
            globalThis.__foundationEffect=effect;globalThis.__foundationCreate=effect.create;
            effect.create=()=>{globalThis.__foundationMountReady=true;return ()=>{}};
            let dep=fiber.dependencies?.firstContext;while(dep){if(typeof dep.memoizedValue?.navigate==='function')globalThis.__foundationRouter=dep.memoizedValue;dep=dep.next}
          }effect=effect.next}while(effect!==last.next)}visit(fiber.child);visit(fiber.sibling)};visit(root.current)
      }};
    `})
    await command('Debugger.enable')
    const breakpoint=await command('Debugger.setBreakpointByUrl',{url:'vidbee://renderer/assets/'+path.basename(locator.entry),lineNumber:locator.line})
    const paused=command('$paused')
    await renderer(`location.hash='/settings';location.reload();true`)
    const frame=await locator.pause(paused)
    const captured=await command('Debugger.evaluateOnCallFrame',{callFrameId:frame.callFrames[0].callFrameId,expression:locator.capture,returnByValue:true})
    if(captured.exceptionDetails)locator.missing('compiled root capture failed')
    await command('Debugger.removeBreakpoint',{breakpointId:breakpoint.breakpointId})
    await command('Debugger.resume');await command('Debugger.disable');await delay(1500)
    if(!await renderer('Boolean(globalThis.__foundationMountReady)'))locator.missing('consumer effect was not gated')
    if(!await renderer('Boolean(globalThis.__foundationRouter)'))locator.missing('router context missing')
    await renderer(`globalThis.__foundationCounter=window.api.on('app:show-home',()=>__foundationDeliveries.push(location.hash));true`)
    await send('app:show-home',null);await delay(100)
    const beforeMount=await renderer(`({route:location.hash,deliveries:__foundationDeliveries.slice()})`)
    assert.equal(beforeMount.route,'#/settings');assert.equal(beforeMount.deliveries.length,1)
    await renderer(`__foundationEffect.inst.destroy=__foundationCreate();true`);await delay(100)
    await renderer(`(()=>{const actual=__foundationFiberRoot,element=actual.current.memoizedState.element;const root=__foundationClient.createRoot(document.createElement('div'));globalThis.__foundationRender=root.render;root.unmount();globalThis.__foundationFiberRoot=actual;globalThis.__foundationElement=element;return true})()`)

    assert.equal(await renderer('location.hash'),'#/settings','Pre-mount command replayed')
    // Hold the real router's completion while the real consumer receives commands.
    await renderer(`globalThis.__foundationNavigate=__foundationRouter.navigate;globalThis.__foundationPending=[];__foundationRouter.navigate=(...args)=>new Promise(resolve=>__foundationPending.push({args,resolve}));true`)
    await send('app:show-home',null);await send('app:show-home',null);await delay(100)
    const slow=await renderer(`({route:location.hash,deliveries:__foundationDeliveries.slice(),navigation:__foundationPending.map(p=>p.args)})`)
    assert.equal(slow.route,'#/settings');assert.equal(slow.navigation.length,2);assert.equal(slow.deliveries.length,3)
    await renderer(`(async()=>{__foundationRouter.navigate=__foundationNavigate;for(const p of __foundationPending){await __foundationNavigate(...p.args);p.resolve()}return true})()`);await delay(100)
    assert.equal(await renderer('location.hash'),'#/')
    await renderer(`(async()=>{await __foundationRouter.navigate({to:'/settings'});__foundationRender.call({_internalRoot:__foundationFiberRoot},null);return true})()`)
    await delay(100)
    await send('app:show-home',null);await delay(100)
    assert.equal(await renderer('document.getElementById("root").childElementCount'),0,'Consumer subtree did not unmount')
    const absent=await renderer(`({route:location.hash,deliveries:__foundationDeliveries.slice()})`)
    await renderer(`__foundationRender.call({_internalRoot:__foundationFiberRoot},__foundationElement);true`);await delay(300)
    assert(await renderer('document.getElementById("root").childElementCount>0'),'Consumer subtree did not remount')
    const resubscribed=await renderer(`({route:location.hash,deliveries:__foundationDeliveries.slice()})`)
    assert.equal(resubscribed.route,'#/settings');assert.deepEqual(resubscribed,absent)
    await send('app:show-home',null);await delay(100)
    const liveRoute=await renderer('location.hash');assert.equal(liveRoute,'#/')
    await renderer(`(async()=>{await __foundationRouter.navigate({to:'/settings'});__foundationPending=[];__foundationRouter.navigate=(...args)=>new Promise(resolve=>__foundationPending.push({args,resolve}));return true})()`)
    await send('app:show-home',null);await delay(100)
    const beforeReload=await renderer(`({route:location.hash,pending:__foundationPending.length,deliveries:__foundationDeliveries.slice()})`)
    assert.equal(beforeReload.route,'#/settings');assert.equal(beforeReload.pending,1)
    await command('Page.removeScriptToEvaluateOnNewDocument',{identifier:hook.identifier})
    await renderer(`location.hash='/settings';location.reload();true`);await delay(1500)
    const afterReload=await renderer(`({route:location.hash,oldState:typeof globalThis.__foundationEffect})`)
    assert.equal(afterReload.route,'#/settings');assert.equal(afterReload.oldState,'undefined')
    await send('app:show-home',null);await delay(100)
    const newLiveRoute=await renderer('location.hash');assert.equal(newLiveRoute,'#/')
    // Interpose only the owned main host's snapshot completion. The actual packaged
    // preload, IPC invocation, renderer hook, atom and KernelGate still execute.
    await run(`globalThis.__foundationIpc=${electron}.ipcMain;globalThis.__foundationOldStatus=__foundationIpc._invokeHandlers.get('app.getYtDlpKernelStatus');__foundationIpc.removeHandler('app.getYtDlpKernelStatus');__foundationIpc.handle('app.getYtDlpKernelStatus',()=>new Promise(resolve=>{globalThis.__foundationStatusResolve=resolve}));true`)
    await renderer('location.reload();true')
    for(let i=0;i<100;i++){if(await run("typeof globalThis.__foundationStatusResolve==='function'"))break;await delay(50)}
    const live={error:null,nodeVersion:'race-node',preparationStep:null,progress:null,ready:true,source:'bundled',state:'up-to-date',ytDlpVersion:'race-ytdlp'}
    const stale={error:'stale failure',nodeVersion:null,preparationStep:null,progress:null,ready:false,source:null,state:'unavailable',ytDlpVersion:null}
    await send('ytdlp-kernel:status',live);await delay(100)
    await run(`__foundationStatusResolve(${JSON.stringify(stale)});true`);await delay(300)
    await renderer(`location.hash='/about';true`);await delay(500)
    const raced=await renderer(`({body:document.body.innerText,route:location.hash})`)
    assert(raced.body.includes('race-ytdlp'),'Stale snapshot replaced newer kernel event')
    assert(!raced.body.includes('stale failure'))
    await run(`__foundationIpc.removeHandler('app.getYtDlpKernelStatus');__foundationIpc.handle('app.getYtDlpKernelStatus',__foundationOldStatus);true`)
    await renderer('location.reload();true');await delay(1500)
    return {home:{beforeMount,slow,absent,resubscribed,liveRoute,beforeReload,afterReload,newLiveRoute},kernel:{live,stale,raced}}
  } finally {main.close()}
}
