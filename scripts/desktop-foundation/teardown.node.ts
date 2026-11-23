import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import {mkdtempSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { containedLaunch } from './containment.mjs'
import { launchOwned, stopOwned } from './owned-process.mjs'

const work=mkdtempSync(path.join(os.tmpdir(),'foundation-teardown-'))
const probe=spawnSync('bwrap',containedLaunch(work,['/usr/bin/true']),{encoding:'utf8'})
const skip=probe.status===0?false:`Bubblewrap unavailable: ${probe.error?.message??probe.stderr.trim()}`
if(skip&&process.env.VIDBEE_REQUIRE_CONTAINMENT==='1')throw Error(skip)
const descendants=async pid=>{
  const out=[]
  try {for(const id of (await fs.readFile(`/proc/${pid}/task/${pid}/children`,'utf8')).trim().split(/\s+/).filter(Boolean)){out.push(id,...await descendants(id))}}catch{}
  return out
}
const gone=async ids=>{
  for(let i=0;i<100;i++){
    if((await Promise.all(ids.map(id=>fs.access(`/proc/${id}`).then(()=>false,()=>true)))).every(Boolean))return
    await delay(20)
  }
  assert.fail(`Run processes survived: ${ids}`)
}
for(const mode of ['early-exit','launch-failure','control-eof'])test(`owned teardown: ${mode}`,{skip},async()=>{
  const child=launchOwned(work, mode==='launch-failure'?['/missing-command']:['bash','-c',mode==='early-exit'?'sleep 60 & sleep 0.3; exit 7':'sleep 60 & wait'])
  await delay(100)
  const ids=[String(child.pid),...await descendants(child.pid)]
  if(mode==='control-eof')await stopOwned(child)
  const result=await child.completed
  assert.equal(result.code,mode==='early-exit'?7:mode==='launch-failure'?127:0)
  await gone(ids)
})
for(const signal of ['SIGINT','SIGTERM'])test(`runner ${signal} releases the complete run`,{skip},async()=>{
  const ready=path.join(work,signal)
  const source=`import fs from 'node:fs';import {launchOwned,stopOwned} from ${JSON.stringify(new URL('./owned-process.mjs',import.meta.url).href)};const child=launchOwned(${JSON.stringify(work)},['bash','-c','sleep 60 & wait']);for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await stopOwned(child);process.exit(1)});fs.writeFileSync(${JSON.stringify(ready)},String(child.pid));await child.completed;`
  const runner=spawn(process.execPath,['--input-type=module','-e',source],{stdio:'ignore'})
  const completed=new Promise(resolve=>runner.once('close',resolve))
  for(let i=0;i<100;i++){try{await fs.access(ready);break}catch{};await delay(20)}
  await delay(100)
  const childPid=await fs.readFile(ready,'utf8'),ids=[String(runner.pid),childPid,...await descendants(childPid)]
  runner.kill(signal);await completed;await gone(ids)
})
test.after(()=>fs.rm(work,{recursive:true,force:true}))
