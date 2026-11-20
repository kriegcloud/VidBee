import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { auditObservations } from './audit-observe.mjs'

test('pins complete audit host, lifecycle, boot, native, renderer and real transport observations', async () => {
  assert.equal(process.version, `v${fs.readFileSync(new URL('../../.node-version',import.meta.url),'utf8').trim()}`, 'Use pinned Node')
  const actual=await auditObservations()
  const expected=JSON.parse(fs.readFileSync(new URL('./audit.expected.json',import.meta.url),'utf8'))
  assert.deepEqual(actual,expected)
  assert.equal(JSON.stringify(actual),JSON.stringify(expected))
})
