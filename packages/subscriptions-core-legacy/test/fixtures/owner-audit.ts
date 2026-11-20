// Run manually under pinned Node with OWNER_SUBSCRIPTIONS_AUDIT pointing to the supplied copy.
// Output is aggregate counts and schema paths only. Never include row values in receipts.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as S from 'effect/Schema'
import { SubscriptionRow, SubscriptionItemRow, SubscriptionsMetaRow, subscriptionsTable, subscriptionItemsTable, subscriptionsMetaTable } from '@vidbee/db/subscriptions'
import { createSqliteSubscriptionsStore, createSqliteMetaStore } from '@vidbee/subscriptions-core-legacy/store'

assert.equal(process.version, 'v22.23.4')
const path = process.env.OWNER_SUBSCRIPTIONS_AUDIT
assert(path, 'Set OWNER_SUBSCRIPTIONS_AUDIT to the supplied consistent database copy')
const hash = () => createHash('sha256').update(readFileSync(path)).digest('hex')
const before = hash()
const handle = new Database(path, { readonly: true, fileMustExist: true })
handle.pragma('query_only = ON')
const db = drizzle({ client: handle })
const store = createSqliteSubscriptionsStore({ db })
const meta = createSqliteMetaStore({ db })
const rules = db.select().from(subscriptionsTable).all()
const items = db.select().from(subscriptionItemsTable).all()
const metadata = db.select().from(subscriptionsMetaTable).all()
const invalid: Record<string, number> = {}
const audit = (table: string, rows: object[], fields: Record<string, S.ConstraintDecoder<unknown, never>>) => {
  for (const row of rows) {
    for (const [column, schema] of Object.entries(fields)) {
      try { S.decodeUnknownSync(schema)(Reflect.get(row, column)) } catch { invalid[`${table}.${column}`] = (invalid[`${table}.${column}`] ?? 0) + 1 }
    }
  }
}
audit('subscriptions', rules, SubscriptionRow.fields)
audit('subscription_items', items, SubscriptionItemRow.fields)
audit('subscriptions_meta', metadata, SubscriptionsMetaRow.fields)
const unknownEnums: Record<string, number> = {}
const recovery: Record<string, number> = {}
const countUnknown = (path: string, value: string | null, known: readonly string[]) => {
  if (value !== null && !known.includes(value)) unknownEnums[path] = (unknownEnums[path] ?? 0) + 1
}
for (const row of rules) {
  countUnknown('subscriptions.platform', row.platform, ['youtube','bilibili','custom','instagram','threads','x','tiktok','snapchat'])
  countUnknown('subscriptions.status', row.status, ['idle','checking','up-to-date','failed','rate-limited','auth-required'])
  countUnknown('subscriptions.sourceKind', row.sourceKind, ['feed','profile'])
  countUnknown('subscriptions.downloadType', row.downloadType, ['video','audio','subtitles'])
  countUnknown('subscriptions.downloadQuality', row.downloadQuality, ['best','2160p','1440p','1080p','720p','480p','360p','240p','144p'])
  countUnknown('subscriptions.downloadContainer', row.downloadContainer, ['default','mp4','mkv','webm'])
  const mapped = await store.get(row.id)
  assert(mapped)
  assert.equal(mapped.platform, row.platform)
  assert.equal(mapped.status, row.status)
  assert.equal(mapped.sourceKind, row.sourceKind === 'profile' ? 'profile' : 'feed')
  assert.equal(mapped.onlyDownloadLatest, row.onlyDownloadLatest === 1)
  assert.equal(mapped.items.length, items.filter((item) => item.subscriptionId === row.id).length)
  for (const key of ['keywords', 'tags', 'categories'] as const) {
    let classification = 'valid'
    let expected: string[] = []
    try {
      const value: unknown = JSON.parse(row[key])
      if (!Array.isArray(value)) classification = 'non-array'
      else {
        const seen = new Set<string>()
        for (const entry of value) {
          if (typeof entry !== 'string') throw new Error('non-string entry')
          const trimmed = entry.trim()
          if (trimmed && !seen.has(trimmed)) { seen.add(trimmed); expected.push(trimmed) }
        }
      }
    } catch { classification = 'parse-or-element-recovery'; expected = [] }
    recovery[`subscriptions.${key}.${classification}`] = (recovery[`subscriptions.${key}.${classification}`] ?? 0) + 1
    assert.deepEqual(mapped[key], expected)
  }
}
await store.list()
await meta.readLeader()
await meta.readPreferred()
handle.close()
assert.equal(hash(), before)
console.log(JSON.stringify({ counts: { subscriptions: rules.length, subscription_items: items.length, subscriptions_meta: metadata.length }, invalidSchemaPaths: invalid, unknownEnums, jsonLists: recovery, mappedEverySubscription: true, readOnly: true, unchangedFileHash: true }, null, 2))
