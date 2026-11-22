import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { sourcePolicy } from './source-policy.mjs'
import { scratchIO } from './scratch-io.mjs'
import { containedLaunch } from './containment.mjs'
import { behavior } from './behavior.mjs'
import { captureOwned } from './owned-process.mjs'

test('outer source policy covers every availability/host/explicit/require combination without observations', () => {
  for (const available of [false,true]) for (const hosted of [false,true]) for (const explicit of [false,true]) for (const required of [false,true]) {
    const env = {GITHUB_ACTIONS: hosted ? 'true' : 'false', VIDBEE_FOUNDATION_UNCONTAINED: explicit ? '1' : '0', VIDBEE_REQUIRE_CONTAINMENT: required ? '1' : '0'}
    if (!available && (required || (!hosted && !explicit))) assert.throws(() => sourcePolicy(available,env), /outer probe/)
    else assert.equal(sourcePolicy(available,env), available ? 'contained' : 'uncontained')
  }
})

test('semantic hook projection retains values, identity, multiplicity and order', () => {
  const original = JSON.parse(fs.readFileSync(new URL('./audit.expected.json',import.meta.url),'utf8'))
  const expected = behavior(original)
  for (const field of ['title','appInfo','share']) {
    const groups = field === 'title' ? [original.lifecycle.title] : original.lifecycle[field]
    for (let index=0;index<groups.length;index++) {
      if (!groups[index].updates.length) continue
      const locate = o => field === 'title' ? o.lifecycle.title.updates : o.lifecycle[field][index].updates
      const refactor=structuredClone(original)
      for (const row of locate(refactor)) row[0] += 7
      assert.deepEqual(behavior(refactor),expected)
      for (const mutation of ['drop','duplicate','wrong-value','wrong-state','reorder']) {
        const changed=structuredClone(original), rows=locate(changed)
        if (mutation==='drop') rows.pop()
        if (mutation==='duplicate') rows.push(rows[0])
        if (mutation==='wrong-value') rows[0][1]='wrong'
        if (mutation==='wrong-state') rows[0][0]='wrong-state'
        if (mutation==='reorder') { if(rows.length<2 || JSON.stringify(rows[0])===JSON.stringify(rows.at(-1))) continue; rows.reverse() }
        assert.notDeepEqual(behavior(changed),expected,`${field}/${index}/${mutation}`)
      }
    }
  }
})

test('parent scratch helper refuses planted file/directory symlinks, hardlinks, FIFOs and replaced outputs', async t => {
  const parent=fs.mkdtempSync(path.join(os.tmpdir(),'foundation-parent-')),work=path.join(parent,'foundation-io')
  fs.mkdirSync(work)
  const probe=spawnSync('bwrap',containedLaunch(work,['/usr/bin/true']),{encoding:'utf8'})
  if(probe.status!==0){fs.rmSync(parent,{recursive:true,force:true});t.skip(`Bubblewrap unavailable: ${probe.stderr}`);return}
  try {
    const outside=path.join(parent,'outside');fs.writeFileSync(outside,'unchanged')
    const plant=spawnSync('bwrap',containedLaunch(work,[process.execPath,'--input-type=module','-e',`
      import fs from 'node:fs';import {spawnSync}from'node:child_process';
      fs.symlinkSync(${JSON.stringify(outside)},${JSON.stringify(path.join(work,'link'))});
      fs.symlinkSync(${JSON.stringify(parent)},${JSON.stringify(path.join(work,'directory'))});
      fs.writeFileSync(${JSON.stringify(path.join(work,'regular'))},'replacement');
      fs.linkSync(${JSON.stringify(path.join(work,'regular'))},${JSON.stringify(path.join(work,'hardlink'))});
      if(spawnSync('mkfifo',[${JSON.stringify(path.join(work,'fifo'))}]).status!==0)throw Error('mkfifo');
    `]),{encoding:'utf8'})
    assert.equal(plant.status,0,plant.stderr)
    const io=scratchIO(work)
    for(const name of ['link','directory/outside','hardlink','fifo','regular']) {
      await assert.rejects(io.writeFile(path.join(work,name),'escaped'))
      if(name!=='regular')await assert.rejects(io.readFile(path.join(work,name)))
    }
    await io.writeFile(path.join(work,'owned'),'safe')
    assert.equal(await io.readFile(path.join(work,'owned'),'utf8'),'safe')
    assert.equal(fs.readFileSync(outside,'utf8'),'unchanged')
  } finally {fs.rmSync(parent,{recursive:true,force:true})}
})

test('capture deadline handles an exited leader with retained output without group signalling', async () => {
  let stopped=0
  const result=await captureOwned(process.execPath,['-e',`const{spawn}=require('node:child_process');spawn(process.execPath,['-e','setTimeout(()=>{},1000)'],{stdio:['ignore',process.stdout,process.stderr]});process.exit(0)`],{timeoutMs:100,stop:async()=>{stopped++}})
  assert.equal(stopped,1)
  assert.equal(result.timedOut,true)
})
