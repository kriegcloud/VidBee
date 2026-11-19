import { readFileSync } from 'node:fs'
import { describe, expect, it } from '@effect/vitest'
import * as S from 'effect/Schema'
import * as Result from 'effect/Result'
import * as OnlyFans from '@vidbee/downloader-core/onlyfans-profile'
import * as Fansly from '@vidbee/downloader-core/fansly-profile'
import * as ZodOnlyFans from '@vidbee/downloader-core-legacy/onlyfans-profile'
import { FanslyCommandSchema as ZodFansly } from '@vidbee/downloader-core-legacy/fansly-profile'

const marker = Symbol('undefined')
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/schema-oracle.json', import.meta.url), 'utf8'), (_key,value) => value && typeof value === 'object' && '$review' in value ? value.$review === 'undefined' ? marker : Number(value.$review) : value)
const restore = (value: unknown): void => {
  if (value === null || typeof value !== 'object') return
  for (const [key,entry] of Object.entries(value)) {
    if (entry === marker) Reflect.set(value,key,undefined)
    else restore(entry)
  }
}
restore(fixtures)
describe('profile boundary schema oracle', () => {
  it('preserves pre-port zod acceptance and complete decoded values for all reused schemas', () => {
    expect(fixtures.length).toBe(1166)
    for (const fixture of fixtures) {
      const schema = Reflect.get(fixture.module === 'onlyfans-profile' ? OnlyFans : Fansly,fixture.name)
      const decoded = S.decodeUnknownResult(schema)(fixture.input)
      expect(Result.isSuccess(decoded),fixture.name).toBe(fixture.accepted)
      if (Result.isSuccess(decoded)) expect(decoded.success).toEqual(fixture.decoded)
      const old = fixture.module === 'onlyfans-profile' ? Reflect.get(ZodOnlyFans,fixture.name) : fixture.name === 'FanslyCommandSchema' ? ZodFansly : undefined
      if (old) {
        const result = old.safeParse(fixture.input)
        expect(result.success,fixture.name).toBe(fixture.accepted)
        if (result.success) expect(result.data).toEqual(fixture.decoded)
      }
    }
  }, 120000)
})
