import { expect, it } from '@effect/vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { rethrowQueryError } from '@vidbee/db/legacy'
import { DrizzleQueryError } from 'drizzle-orm/errors'
import { createSqliteMetaStore, createSqliteSubscriptionsStore } from '@vidbee/subscriptions-core/store'

it('M16: every supplied-store surface rethrows the original SQLite object and message', async () => {
  const handle = new Database(':memory:')
  const db = drizzle({ client: handle })
  const subscriptions = createSqliteSubscriptionsStore({ db })
  const meta = createSqliteMetaStore({ db })
  try {
    expect(subscriptions.get).toBe(subscriptions.get)
    expect(meta.readLeader).toBe(meta.readLeader)
    expect(Object.getPrototypeOf(subscriptions)).toBe(Object.prototype)
    expect(Object.keys(subscriptions)).toContain('get')
    expect(Object.getOwnPropertyDescriptor(subscriptions, 'get')).toEqual({
      value: subscriptions.get, configurable: true, enumerable: true, writable: true
    })
    expect(subscriptions.get.name).toBe('get')
    expect(subscriptions.get.length).toBe(1)
    Object.freeze(subscriptions)
    const failed = subscriptions.get('missing')
    expect(failed).toBeInstanceOf(Promise)
    await expect(failed).rejects.toBeInstanceOf(Database.SqliteError)
    for (const operation of [() => subscriptions.list(), () => subscriptions.get('missing'), () => meta.readLeader(), () => meta.writePreferred('desktop')]) {
      await expect(operation()).rejects.toBeInstanceOf(Database.SqliteError)
      await expect(operation()).rejects.toHaveProperty('code', 'SQLITE_ERROR')
      await expect(operation()).rejects.not.toBeInstanceOf(DrizzleQueryError)
    }
  } finally { handle.close() }
})

it('M16: a supplied store preserves a direct driver error object through rejection and call receivers', async () => {
  const handle = new Database(':memory:')
  const original = new Database.SqliteError('database is locked', 'SQLITE_BUSY')
  const db = new Proxy(drizzle({ client: handle }), {
    get(target, key, receiver) {
      if (key === 'select') return () => { throw original }
      return Reflect.get(target, key, receiver)
    }
  })
  const store = createSqliteSubscriptionsStore({ db })
  try {
    await expect(store.list()).rejects.toBe(original)
    await expect(Reflect.apply(store.get, { receiver: 'other' }, ['id'])).rejects.toBe(original)
  } finally { handle.close() }
})

it('R9: only top-level Drizzle query errors unwrap; all other values retain identity', () => {
  const driver = new Error('driver')
  const wrapped = new DrizzleQueryError('query', [], driver)
  const outer = new Error('outer', { cause: wrapped })
  for (const value of [outer, new Error('plain'), undefined, null, 'failure', 42, false, { cause: wrapped }]) {
    let caught: unknown
    try { rethrowQueryError(value) } catch (error) { caught = error }
    expect(caught).toBe(value)
  }
  expect(() => rethrowQueryError(wrapped)).toThrow(driver)
})

it('R9: a supplied-store error with a Drizzle cause preserves the outer rejection', async () => {
  const handle = new Database(':memory:')
  const outer = new Error('outer', { cause: new DrizzleQueryError('query', [], new Error('driver')) })
  const db = new Proxy(drizzle({ client: handle }), { get(target, key, receiver) {
    if (key === 'select') return () => { throw outer }
    return Reflect.get(target, key, receiver)
  } })
  try { await expect(createSqliteSubscriptionsStore({ db }).list()).rejects.toBe(outer) }
  finally { handle.close() }
})
