import assert from 'node:assert/strict'
import { test } from 'node:test'
import { differences, normalize } from './normalize.mjs'

test('comparison preserves array/object type and missing fields', () => {
  assert.equal(differences([], {}).length, 1)
  assert.equal(differences({ items: [] }, { items: {} }).length, 1)
  assert.equal(differences({ title: 'stable' }, {}).length, 1)
})

test('only known MCP JSON text is decoded and its wire type remains visible', () => {
  const text = { status: 200, result: { content: [{ type: 'text', text: '{"title":"stable"}' }] } }
  const object = { status: 200, result: { content: [{ type: 'text', text: { title: 'stable' } }] } }
  assert.ok(differences(normalize(text), normalize(object)).length)
  assert.deepEqual(normalize({ text: '{"title":"stable"}' }), { text: '{"title":"stable"}' })
})

test('normalization preserves stable media facts and fixed fixture clocks', () => {
  const value = {
    sha256: 'a'.repeat(64),
    durationMs: 3750,
    createdAt: 1_735_689_600_000,
    title: 'stable',
    items: [2, 1]
  }
  assert.deepEqual(normalize(value), value)
  assert.deepEqual(normalize({ createdAt: 1_794_986_338_269, port: 27_100 }), {
    createdAt: '<timestamp>',
    port: '<port>'
  })
})

test('generated identity aliases stay visible within each document', () => {
  const a = '01M7PR58GJ8RDW3061N9RZ1DFC'
  const b = '01M7PR58GJ8RDW3061N9RZ1DFD'
  assert.deepEqual(normalize({ id: a, parentId: a, childId: b }), {
    id: '<id:1>',
    parentId: '<id:1>',
    childId: '<id:2>'
  })
})
