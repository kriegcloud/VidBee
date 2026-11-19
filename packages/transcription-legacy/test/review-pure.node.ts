import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { assertObservation, observe, unpack } from './pure-oracle'
import { pureTargets } from './pure-target'
interface Fixture { module: string; name: string; args: unknown; expected: ReturnType<typeof observe>; excluded?: string }
const fixtures: Fixture[] = JSON.parse(readFileSync(new URL('./fixtures/review-pure-oracle.json', import.meta.url), 'utf8'))
assert.equal(process.version, 'v22.23.4', 'pure oracle must use repository-pinned Node')
for (const [module, entries] of Object.entries(Object.groupBy(fixtures, entry => entry.module))) {
 test(`pinned-Node differential pure oracle: ${module}`, { timeout: 120000 }, () => {
  for (const entry of entries ?? []) {
   if (entry.excluded) continue
   const fn = Reflect.get(pureTargets[module]!, entry.name)
   assert.equal(typeof fn, 'function', entry.name)
   assertObservation(observe(fn, unpack(entry.args)), entry.expected, `${module}.${entry.name} args=${JSON.stringify(entry.args)}`)
  }
 })
}
