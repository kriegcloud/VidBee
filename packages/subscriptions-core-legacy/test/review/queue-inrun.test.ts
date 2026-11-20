import { expect, it } from '@effect/vitest'
import { readFileSync } from 'node:fs'
import { followups, inRun, operationSets } from './queue-inrun'

// Recorded by running this same scenario source against git-extracted 21d6718.
const expected = JSON.parse(readFileSync(new URL('./queue-inrun-old.json', import.meta.url), 'utf8'))
for (const operations of operationSets) for (const followup of followups) {
  const name = `${operations.join('+') || 'none'}/${followup}`
  it(`U1: pre-port inside-run control matrix ${name}`, async () => {
    expect(await inRun(operations, followup)).toEqual(expected[name])
  })
  it(`U1: pre-port synchronous finish inside run ${name}`, async () => {
    expect(await inRun(operations, followup, true)).toEqual(expected[`sync/${name}`])
  })
}
