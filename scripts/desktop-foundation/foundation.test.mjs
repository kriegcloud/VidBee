import { expect, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import fs from 'node:fs'
import { observe } from './observe.mjs'
import { sourceLoader } from './source-harness.mjs'

it.effect('pins the old settings manager and installed electron-store observations', () =>
  Effect.sync(() => {
    const expected = JSON.parse(fs.readFileSync(new URL('./settings.expected.json', import.meta.url)))
    const actual = observe()
    // PORT-GUIDE permits any failure for old engine failures outside declared types.
    // Only the explicit BigInt/cyclic JSON vectors get that policy; successful values
    // and all other error contracts remain exact in the frozen observation.
    const contract = (observation) => {
      const value = structuredClone(observation)
      for (const index of [3, 4]) {
        expect(value.writes.serialization[index]).toHaveProperty('error')
        value.writes.serialization[index] = { failed: true }
      }
      return value
    }
    const observedContract = contract(actual)
    const expectedContract = contract(expected)
    expect(observedContract).toEqual(expectedContract)
    expect(JSON.stringify(observedContract)).toBe(JSON.stringify(expectedContract))
  }))

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
