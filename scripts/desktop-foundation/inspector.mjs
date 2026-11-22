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
