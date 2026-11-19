import { encode } from './fixtures/pure-oracle'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { SubscriptionsApi } from '@vidbee/subscriptions-core/api'
import { createSqliteSubscriptionsStore, createSqliteMetaStore, InMemoryMetaStore } from '@vidbee/subscriptions-core/store'
import { setup, baseInput, serialize } from './fixtures/store-scenario'
assert.equal(process.version, 'v22.23.4')
test('real SQLite stale lastError survives direct undefined and failed-then-successful API writes', { timeout: 120000 }, async () => {
  const { handle, store } = setup()
  try {
    const sub = await store.add(baseInput)
    await store.update(sub.id, { status: 'failed', lastError: 'direct boom' })
    await store.update(sub.id, { status: 'up-to-date', lastError: undefined })
    const direct = { row: await store.get(sub.id), raw: handle.prepare('SELECT last_error FROM subscriptions').get() }
    let fails = true
    const api = new SubscriptionsApi({ kind: 'desktop', pid: 1, store, metaStore: new InMemoryMetaStore(), now: () => 200, enqueueItem: async () => null, fetcher: { fetch: async () => { if (fails) throw new Error('fetch boom'); return { items: [] } } } })
    await api.refreshOne(sub.id); const failed = await store.get(sub.id)
    fails = false; await api.refreshOne(sub.id)
    const success = { row: await store.get(sub.id), raw: handle.prepare('SELECT last_error FROM subscriptions').get() }
    assert.equal(serialize({ direct, failed, success }), readFileSync(new URL('./fixtures/audit-store-stale.json', import.meta.url), 'utf8').trim())
  } finally { handle.close() }
})
test('default UUIDv4 and Date.now timestamps include preferred metadata writes', { timeout: 120000 }, async () => {
  const { handle, db } = setup()
  const original = Date.now
  Date.now = () => 4242
  try {
    const store = createSqliteSubscriptionsStore({ db })
    const meta = createSqliteMetaStore({ db })
    const sub = await store.add(baseInput)
    assert.match(sub.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    assert.equal(sub.createdAt, 4242); assert.equal(sub.updatedAt, 4242)
    await meta.writePreferred('desktop')
    assert.deepEqual(handle.prepare("SELECT key,value,updated_at FROM subscriptions_meta WHERE key='preferred_leader'").all(), [{ key: 'preferred_leader', value: 'desktop', updated_at: 4242 }])
  } finally { Date.now = original; handle.close() }
})
test('real SQLite wrong-kind add/update values retain returned results and failing calls remain rejected', { timeout: 120000 }, async () => {
  const { handle, store } = setup()
  try {
    const api = new SubscriptionsApi({ kind: 'desktop', pid: 1, store, metaStore: new InMemoryMetaStore(), now: () => 200, enqueueItem: async () => null, fetcher: { fetch: async () => ({ items: [] }) }, profileFetcher: { fetch: async () => ({ items: [], categoryErrors: {} }) } })
    const observations: unknown[] = []
    for (const patch of [{ categories: null }, { platform: 'instagram', categories: null }, { keywords: 'a' }]) {
      try { observations.push({ input: patch, value: await Reflect.apply(api.add, api, [{ ...baseInput, feedUrl: `https://fixture.invalid/${observations.length}`, ...patch }]) }) }
      catch (error) { observations.push({ input: patch, engine: true, failed: true, name: error instanceof Error ? error.name : typeof error, message: error instanceof Error ? error.message : String(error) }) }
    }
    const profile = await api.add({ ...baseInput, feedUrl: 'profile', platform: 'instagram', categories: ['posts'] })
    for (const patch of [{ categories: 'posts' }, { enabled: 'true' }, { checkIntervalMs: 0 }, { checkIntervalMs: false }, { checkIntervalMs: '' }, { feedUrl: '' }]) {
      try { observations.push({ input: patch, value: await Reflect.apply(api.update, api, [{ id: profile.id, ...patch }]) }) }
      catch (error) { observations.push({ input: patch, engine: true, failed: true, name: error instanceof Error ? error.name : typeof error, message: error instanceof Error ? error.message : String(error) }) }
    }
    const expected: unknown[] = JSON.parse(readFileSync(new URL('./fixtures/audit-store-json.json', import.meta.url), 'utf8'))
    assert.equal(observations.length, expected.length)
    for (const [index, value] of observations.entries()) {
      const old = expected[index]
      if (old && typeof old === 'object' && 'engine' in old) {
        assert.ok(value && typeof value === 'object' && 'failed' in value && value.failed === true)
      } else assert.deepEqual(encode(value), old)
    }
  } finally { handle.close() }
})
