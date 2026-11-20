import { expect, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import fs from 'node:fs'
import { observe } from './observe.mjs'
import { sourceLoader } from './source-harness.mjs'

// Only explicit out-of-type JSON engine failures use PORT-GUIDE's failure-only contract.
const contract = (observation) => {
  const value = structuredClone(observation)
  if (value.writes) for (const index of [3, 4]) {
    expect(value.writes.serialization[index]).toHaveProperty('error')
    value.writes.serialization[index] = { failed: true }
  }
  if (value.audit?.failures) for (const name of ['serialization-3', 'serialization-4']) {
    const item = value.audit.failures.find(item => item.name === name)
    expect(item.result).toHaveProperty('thrown')
    item.result = { failed: true }
  }
  return value
}
const frozen = JSON.parse(fs.readFileSync(new URL('./settings.expected.json', import.meta.url)))
expect(frozen.missing).toHaveProperty('before')
const fieldKeys = frozen.audit.fields.map(item => item.key).filter((key, index, keys) => keys.indexOf(key) === index)
const selections = ['base', 'malformed', ...fieldKeys.map(key => `fields:${key}`), 'normalization', 'failures', 'portable', 'effects']
for (const selection of selections) {
  it.effect(`pins the old settings manager ${selection} matrix and installed store`, () => Effect.sync(() => {
    let expected
    if (selection === 'base') expected = Object.fromEntries(Object.entries(frozen).filter(([key]) => key !== 'audit'))
    else if (selection.startsWith('fields:')) expected = { audit: { fields: frozen.audit.fields.filter(item => `fields:${item.key}` === selection) } }
    else {
      const keys = selection === 'malformed' ? ['malformed-false', 'malformed-true'] : selection === 'failures' ? ['failures', 'repairs'] : [selection]
      expected = { audit: Object.fromEntries(keys.map(key => [key, frozen.audit[key]])) }
    }
    const actual = contract(observe(selection))
    const oracle = contract(expected)
    expect(actual).toEqual(oracle)
    expect(JSON.stringify(actual)).toBe(JSON.stringify(oracle))
  }))
}

it.effect('pins path fallback, portable relocation and external path preservation', () =>
  Effect.sync(() => {
    const { resolveStartupDownloadPath: resolve } = sourceLoader()('apps/desktop/src/main/lib/download-path-policy.ts')
    const base = { defaultPath: '/new/Downloads', oldDefaultPath: '/home/Downloads',
      portableMode: true, portableRoot: '/new', previousPortableRoot: '/old' }
    for (const currentPath of [undefined, '', null, false, 0, '/home/Downloads']) {
      expect(resolve({ ...base, currentPath })).toBe('/new/Downloads')
    }
    expect(resolve({ ...base, currentPath: '/old/media' })).toBe('/new/media')
    expect(resolve({ ...base, currentPath: '/outside/media' })).toBe('/outside/media')
    expect(resolve({ ...base, currentPath: '/old-sibling/media' })).toBe('/old-sibling/media')
  }))

it.effect('pins local clock formatting and argument identity', () => Effect.sync(() => {
  const { formatDesktopConsoleLog: format } = sourceLoader()('apps/desktop/src/main/lib/desktop-console-format.ts')
  const date = new Date(2020, 0, 2, 3, 4, 5)
  const argument = { untouched: true }
  const output = format({ data: ['message', argument], message: { date, scope: ' main ' } })
  expect(output[0]).toBe('03:04:05 main       message')
  expect(output[1]).toBe(argument)
  expect(format({ data: [], message: { date } })).toEqual(['03:04:05'])
}))
