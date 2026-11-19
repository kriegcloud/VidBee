import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { it } from '@effect/vitest'
import { NODE } from './fixtures/node-runtime.js'

const fixtureUrl = new URL('./fixtures/store-scenario.ts', import.meta.url).href
const run = (name: string): string => execFileSync(NODE, ['--import', 'tsx', '--input-type=module', '--eval', `
  import { ${name}, serialize } from ${JSON.stringify(fixtureUrl)};
  process.stdout.write(serialize(await ${name}()));
`], { encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024 })
for (const [name, operation] of Object.entries({ store: 'scenario', 'store-memory': 'memoryScenario', 'store-failures': 'failureScenario', 'store-limit': 'limitScenario', 'store-timing': 'timingScenario', 'store-transaction-failures': 'transactionFailureScenario', 'store-api-sql-failure': 'apiSqlFailureScenario', 'store-reopen': 'reopenScenario' })) {
  it(`legacy supplied-Drizzle ${name}: full values, SQL, parameters, transactions and timing`, () => {
    const expected = readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8').trim()
    assert.equal(run(operation), expected)
  }, 120_000)
}
it('legacy supplied-Drizzle store-safe: only declared local integer conversion changes', () => {
  const expected = JSON.parse(readFileSync(new URL('./fixtures/store-safe.json', import.meta.url), 'utf8')) as Record<string, unknown>
  const actual = run('safeScenario')
  // Before the port: assert.equal(serialize(await safeScenario()), expected)
  assert.equal(actual, JSON.stringify({ ...expected, old: expected.expectedNew, orphan: expected.expectedNewOrphanCount }, null, 2))
}, 120_000)

const invalidRunner = `
  import assert from 'node:assert/strict';
  import { setup, baseInput, item, serialize } from ${JSON.stringify(fixtureUrl)};
  const result = {};
  for (const [name, mutation, table] of [
    ['nonfinite', 'UPDATE subscriptions SET updated_at=1e999', 'subscriptions'],
    ['blob', "UPDATE subscriptions SET title=x'0102'", 'subscriptions'],
    ['null-primary-key', 'UPDATE subscriptions SET id=NULL', 'subscriptions'],
    ['real-numeric', 'UPDATE subscriptions SET created_at=1.5,only_latest=1.5', null],
    ['item-nonfinite', 'UPDATE subscription_items SET published_at=1e999', 'subscription_items'],
    ['meta-nonfinite', 'UPDATE subscriptions_meta SET updated_at=1e999', 'subscriptions_meta'],
  ]) {
    const { handle, store, meta } = setup();
    try {
      await store.add(baseInput); await store.replaceItems('sub-1', [item('a')]); handle.exec(mutation);
      const raw = () => ({ subscriptions: handle.prepare('SELECT * FROM subscriptions').all(), items: handle.prepare('SELECT * FROM subscription_items').all(), meta: handle.prepare('SELECT * FROM subscriptions_meta').all() });
      const before = raw();
      if (table === null) result[name] = { old: await store.list(), oldMeta: await meta.readLeader(), rawMeta: before.meta, expectedNewPath: null };
      else {
        let rejection;
        try { await (table === 'subscriptions_meta' ? meta.readLeader() : store.list()); }
        catch (error) { rejection = { tag: error._tag, table: error.table, issue: error.issue }; }
        assert.deepEqual(raw(), before);
        result[name] = { rejection, rawUnchanged: true, rawMeta: before.meta, ...(table === 'subscriptions_meta' ? { old: await store.list() } : { oldMeta: await meta.readLeader() }) };
      }
    } finally { handle.close(); }
  }
  const recoveries = [];
  for (const value of ['', 'null', 'false', '123', '"scalar"', '{}', '{', '[]', '[" a ","a","A",""]', '["before",null]', '["before",{}]']) {
    const { handle, store } = setup();
    try { await store.add(baseInput); handle.prepare('UPDATE subscriptions SET keywords=?,tags=?,categories=?').run(value,value,value); recoveries.push({ input: value, old: await store.get('sub-1') }); }
    finally { handle.close(); }
  }
  result.listRecovery = recoveries;
  process.stdout.write(serialize(result));
`
it('legacy supplied-Drizzle store-invalid: declared decode failures preserve raw rows and JSON recovery', () => {
  const expected = JSON.parse(readFileSync(new URL('./fixtures/store-invalid.json', import.meta.url), 'utf8')) as Record<string, Record<string, unknown>>
  const actual = JSON.parse(execFileSync(NODE, ['--import', 'tsx', '--input-type=module', '--eval', invalidRunner], { encoding: 'utf8', timeout: 120_000 })) as Record<string, Record<string, unknown>>
  for (const [name, table] of [['nonfinite', 'subscriptions'], ['blob', 'subscriptions'], ['null-primary-key', 'subscriptions'], ['item-nonfinite', 'subscription_items'], ['meta-nonfinite', 'subscriptions_meta']] as const) {
    const observed = actual[name]!
    // Before the port: assert.equal(serialize(await invalidRowScenario()), expected)
    assert.deepEqual(observed.rejection, { tag: 'DbRowDecodeError', table, issue: expected[name]!.expectedNewPath })
    assert.equal(observed.rawUnchanged, true)
    assert.deepEqual(observed.rawMeta, expected[name]!.rawMeta)
    if (table === 'subscriptions_meta') assert.deepEqual(observed.old, expected[name]!.old)
    else assert.deepEqual(observed.oldMeta, expected[name]!.oldMeta)
  }
  assert.deepEqual(actual['real-numeric'], expected['real-numeric'])
  assert.deepEqual(actual.listRecovery, expected.listRecovery)
}, 120_000)
