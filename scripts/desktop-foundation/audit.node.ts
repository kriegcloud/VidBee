import path from 'node:path'
import os from 'node:os'
import { behavior } from './behavior.mjs'
import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { auditObservations } from './audit-observe.mjs'

test('pins complete audit host, lifecycle, boot, native, renderer and real transport observations', async () => {
  assert.equal(process.version, `v${fs.readFileSync(new URL('../../.node-version',import.meta.url),'utf8').trim()}`, 'Use pinned Node')
  const observed=await auditObservations()
  fs.writeFileSync(path.join(os.tmpdir(), 'foundation-import-trace.json'),JSON.stringify(observed.importEffects,null,2))
  const actual=behavior(observed)
  const expected=behavior(JSON.parse(fs.readFileSync(new URL('./audit.expected.json',import.meta.url),'utf8')))
  assert.deepEqual(actual,expected)
  assert.equal(JSON.stringify(actual),JSON.stringify(expected))
})
