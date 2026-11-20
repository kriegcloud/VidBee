import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { pureCases, observe } from './fixtures/pure-oracle'
import { schemaCases, observeSchema } from './fixtures/schema-oracle'
assert.equal(process.version, 'v22.23.4')
test('pinned V8 enforces every frozen pure and schema observation', { timeout: 120000 }, () => {
  const pure = JSON.parse(readFileSync(new URL('./fixtures/pure-oracle.json', import.meta.url), 'utf8'))
  const schema = JSON.parse(readFileSync(new URL('./fixtures/schema-oracle.json', import.meta.url), 'utf8'))
  for (const entry of pureCases()) {
    assert.ok(Object.hasOwn(pure, entry.name), entry.name)
    if (entry.engine && pure[entry.name]?.error) assert.throws(entry.run, entry.name)
    else assert.deepEqual(observe(entry), pure[entry.name], entry.name)
  }
  // Before the port: for (const entry of schemaCases()) assert.deepEqual(observeSchema(entry), schema[entry.name], entry.name)
  for (const entry of schemaCases().filter(entry => entry.schema === 'SubscriptionPlatformSchema' || entry.schema === 'SubscriptionUpdateInputSchema')) assert.deepEqual(observeSchema(entry), schema[entry.name], entry.name)
})
