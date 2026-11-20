import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { mock } from 'node:test'
const expected=readFileSync(new URL('../../../../.node-version',import.meta.url),'utf8').trim().replace(/^v/,'')
assert.equal(process.versions.node,expected)
const out=[]
for(const delay of [0,-5,0.5,NaN,2**31,Infinity]){
 // Read the real Node timer's normalization, then drive that measured period
 // through Node's deterministic timer clock. No elapsed-real-time assertion.
 const timer=setInterval(()=>{},delay)
 const period=Reflect.get(timer,'_idleTimeout')
 clearInterval(timer)
 mock.timers.enable({apis:['setInterval']})
 let ticks=0
 setInterval(()=>{ticks++},period)
 mock.timers.tick(5)
 mock.timers.reset()
 out.push({delay:String(delay),period,window:5,ticks})
}
const file=new URL('./interval-clamp.json',import.meta.url)
if(process.env.RECORD_INTERVAL==='1')writeFileSync(file,JSON.stringify(out,null,2)+'\n')
else assert.deepEqual(out,JSON.parse(readFileSync(file,'utf8')))
console.log(JSON.stringify(out))
