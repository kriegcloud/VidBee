import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as root from '@vidbee/subscriptions-core-legacy'
import * as schemas from '@vidbee/subscriptions-core-legacy/schemas'
import { observeSchema, schemaCases, schemaExportNames } from './fixtures/schema-oracle'
const frozen: Record<string, unknown> = JSON.parse(readFileSync(new URL('./fixtures/schema-oracle.json', import.meta.url), 'utf8'))
const retained=new Set(['SubscriptionPlatformSchema','SubscriptionUpdateInputSchema'])
describe('pre-port schema differential oracle', () => {
 it('pins every public schema export and root identity', () => {
  // Before the port: expect(schemaExportNames).toEqual(frozen.exports)
  expect(schemaExportNames).toEqual((frozen.exports as string[]).filter(name=>retained.has(name)))
  for (const name of schemaExportNames) expect(Reflect.get(root, name)).toBe(Reflect.get(schemas, name))
 })
 for (const entry of schemaCases().filter(entry=>retained.has(entry.schema))) it(entry.name, () => {
  expect(frozen[entry.name], 'case must exist in frozen oracle').toBeDefined()
  expect(observeSchema(entry)).toEqual(frozen[entry.name])
 }, 30000)
})
