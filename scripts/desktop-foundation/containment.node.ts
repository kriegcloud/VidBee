import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { containedLaunch } from './containment.mjs'

// A host without Bubblewrap or unprivileged namespaces (hosted CI) skips this process test with the
// reason; the packaged runner has no uncontained route. VIDBEE_REQUIRE_CONTAINMENT=1 makes a skip fail.
const probe=spawnSync('bwrap',['--ro-bind','/','/','--','true'],{encoding:'utf8',timeout:10_000})
const unavailable=probe.error?`Bubblewrap cannot start: ${probe.error.message}`:probe.status===0?false:`Bubblewrap cannot contain: ${probe.stderr.trim()}`
if(process.env.VIDBEE_REQUIRE_CONTAINMENT==='1'&&unavailable!==false)throw new Error(unavailable)

test('filesystem containment denies outside scratch and symlink escape writes', {skip:unavailable}, () => {
  const parent=fs.mkdtempSync(path.join(process.cwd(),'.foundation-containment-'))
  const work=path.join(parent,'foundation-owned')
  fs.mkdirSync(work)
  const outside=path.join(parent,'outside')
  fs.writeFileSync(outside,'unchanged')
  fs.symlinkSync(outside,path.join(work,'escape'))
  try {
    const result=spawnSync('bwrap',containedLaunch(work,[process.execPath,'--input-type=module','-e',`
      import fs from 'node:fs';import assert from 'node:assert/strict';
      fs.writeFileSync(${JSON.stringify(path.join(work,'inside'))},'owned');
      for(const target of ${JSON.stringify([outside,path.join(work,'escape')])}) {
        assert.throws(()=>fs.writeFileSync(target,'escaped'),e=>e.code==='EROFS');
      }
    `]),{encoding:'utf8'})
    assert.equal(result.status,0,result.stderr)
    assert.equal(fs.readFileSync(outside,'utf8'),'unchanged')
    assert.equal(fs.readFileSync(path.join(work,'inside'),'utf8'),'owned')
  } finally {fs.rmSync(parent,{recursive:true,force:true})}
})
