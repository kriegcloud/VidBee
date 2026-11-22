import { verifyWorker } from './isolation.mjs'
import assert from 'node:assert/strict'
// Caller must complete verifyWorker before opening this namespace-local socket.
export async function mainInspector(owned) {
  await verifyWorker({run:owned?.run,identity:owned?.identity})
  const targets=await(await fetch('http://127.0.0.1:9231/json/list')).json()
  assert.equal(targets.length,1)
  const socket=new WebSocket(targets[0].webSocketDebuggerUrl)
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})})
  let id=0;const pending={}
  socket.addEventListener('message',event=>{const value=JSON.parse(event.data);if(pending[value.id]){const p=pending[value.id];delete pending[value.id];clearTimeout(p.timer);value.error?p.reject(Error(JSON.stringify(value.error))):p.resolve(value.result)}})
  const evaluate=expression=>new Promise((resolve,reject)=>{const key=++id;pending[key]={resolve,reject,timer:setTimeout(()=>reject(Error('Owned main inspector deadline')),10000)};socket.send(JSON.stringify({id:key,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}))})
  const identity=await evaluate('process.pid')
  assert.equal(identity.result.value,Number(owned.appPid),'Unexpected main process')
  return {evaluate,close:()=>socket.close()}
}

/** Captures already acquired bundle exports in the authenticated process, without constructing another runtime or adding a product debugging API.
 * **Example** (Acquire the native ownership counters)
 * ```js
 * import assert from 'node:assert/strict'
 * import { captureFoundationMain } from './inspector.mjs'
 * export async function counters(main, rendererVersionRead) {
 *   await captureFoundationMain(main, rendererVersionRead)
 *   const result = await main.evaluate('__foundationNative.admission.stats()')
 *   assert.equal(result.exceptionDetails, undefined)
 *   return result.result.value
 * }
 * // main comes from mainInspector after worker identity and build verification.
 * ```
 * @category testing
 * @since 0.0.0
 */
export async function captureFoundationMain(main,trigger) {
 const result=await main.evaluate(`(()=>{const fs=process.mainModule.require('node:fs');const dir=process.resourcesPath+'/app.asar/out/main/';const files=fs.readdirSync(dir);const settings=files.find(file=>file.startsWith('settings.compatibility-')&&file.endsWith('.js'));const capture=files.find(file=>file.startsWith('share-capture-window-')&&file.endsWith('.js'));if(!settings||!capture)throw Error('Foundation bundle adapter needs updating');const runtime=process.mainModule.require(dir+settings);const windows=process.mainModule.require(dir+capture);globalThis.__foundationNative={events:runtime.foundationEvents,admission:runtime.foundationAdmission,registerWindow:windows.registerFoundationWindow};return true})()`)
 assert(!result.exceptionDetails,JSON.stringify(result.exceptionDetails))
 await trigger()
}
