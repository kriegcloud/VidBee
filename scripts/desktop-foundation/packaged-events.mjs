import assert from 'node:assert/strict'
import { mainInspector } from './inspector.mjs'
import { setTimeout as delay } from 'node:timers/promises'
export async function packagedEvents(owned,cdp) {
  const main=await mainInspector(owned)
  const run=async expression=>{const result=await main.evaluate(expression);assert(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));return result.result.value}
  const renderer=async expression=>{const result=await cdp.evaluate(expression);assert(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));return result.result.value}
  const electron="process.mainModule.require('electron')"
  const send=async(channel,value)=>run(`${electron}.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('vidbee://renderer')).webContents.send(${JSON.stringify(channel)},${JSON.stringify(value)})`)
  try {
    await renderer(`location.hash='/settings';true`);await delay(300)
    await send('app:show-home',null);await delay(300)
    const liveRoute=await renderer('location.hash')
    assert.equal(liveRoute,'#/')
    await renderer(`location.hash='/settings';globalThis.__foundationHome=[];window.electron.ipcRenderer.removeAllListeners('app:show-home');true`)
    await send('app:show-home',null);await delay(100)
    await renderer(`globalThis.__foundationHomeWrapper=window.api.on('app:show-home',()=>__foundationHome.push(location.hash));true`)
    const absent=await renderer(`({route:location.hash,deliveries:__foundationHome.slice()})`)
    assert.equal(absent.route,'#/settings');assert.deepEqual(absent.deliveries,[])
    await send('app:show-home',null);await send('app:show-home',null);await delay(100)
    const subscribed=await renderer('__foundationHome.slice()');assert.equal(subscribed.length,2)
    await renderer('location.reload();true');await delay(1500)
    const afterReload=await renderer(`({route:location.hash,oldState:typeof globalThis.__foundationHome})`)
    await send('app:show-home',null);await delay(300)
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
    return {home:{liveRoute,absent,subscribed,afterReload,newLiveRoute},kernel:{live,stale,raced}}
  } finally {main.close()}
}
