import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as root from '@vidbee/subscriptions-core'
import * as schemas from '@vidbee/subscriptions-core/schemas'
import { observeSchema, schemaCases, schemaExportNames } from './fixtures/schema-oracle'
const frozen: Record<string, unknown> = JSON.parse(readFileSync(new URL('./fixtures/schema-oracle.json', import.meta.url), 'utf8'))
describe('pre-port schema differential oracle', () => {
 it('pins every public schema export and root identity', () => {
  expect(schemaExportNames).toEqual(frozen.exports)
  for (const name of schemaExportNames) expect(Reflect.get(root, name)).toBe(Reflect.get(schemas, name))
 })
 for (const entry of schemaCases()) it(entry.name, () => {
  expect(frozen[entry.name], 'case must exist in frozen oracle').toBeDefined()
  expect(observeSchema(entry)).toEqual(frozen[entry.name])
 }, 30000)
})
