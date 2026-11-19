import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { assertObservation, observe, unpack, wrongArray } from './pure-oracle'
import { seeds as baseSeeds } from './pure-cases'
import { asrSeeds } from './pure-asr-cases'
import { remainingSeeds } from './pure-remaining-cases'
import { seedSeeds } from './pure-seed-cases'
import { pureTextCases } from './pure-text-cases'
import { pureTargets } from './pure-target'
interface Fixture { module: string; name: string; args: unknown; expected: ReturnType<typeof observe>; excluded?: string; seed?: number }
const seeds: Record<string, Record<string, unknown[][]>> = { ...baseSeeds, ...pureTextCases, ...asrSeeds, ...remainingSeeds, ...seedSeeds }
const wrongArrayRow = (entry: Fixture) => {
  const seed = entry.seed === undefined ? undefined : seeds[entry.module]?.[entry.name]?.[entry.seed]
  return seed !== undefined && wrongArray(seed, unpack(entry.args))
}
const fixtures: Fixture[] = JSON.parse(readFileSync(new URL('./fixtures/review-pure-oracle.json', import.meta.url), 'utf8'))
assert.equal(process.version, 'v22.23.4', 'pure oracle must use repository-pinned Node')
for (const [module, entries] of Object.entries(Object.groupBy(fixtures, entry => entry.module))) {
 test(`pinned-Node differential pure oracle: ${module}`, { timeout: 120000 }, () => {
  for (const entry of entries ?? []) {
   if (entry.excluded) {
    assert.equal(entry.excluded, 'old-engine-error', 'unclassified oracle exclusion')
    assert.ok('failed' in entry.expected && entry.expected.engine, 'only old engine failures may be excluded')
    assert.ok(wrongArrayRow(entry), 'only rows with a non-array in an array position of their own seed may be excluded')
    continue
   }
   const fn = Reflect.get(pureTargets[module]!, entry.name)
   assert.equal(typeof fn, 'function', entry.name)
   assertObservation(observe(fn, unpack(entry.args)), entry.expected, `${module}.${entry.name} args=${JSON.stringify(entry.args)}`)
  }
 })
}
