# Database compatibility pins

Run `bun run --cwd packages/db test` (also included in root `bun run test`).
These are pre-port `node:test` assertions executed with `tsx` on Node, matching
existing legacy audit tests and the current `better-sqlite3` consumer driver.
The package keeps its unported TypeScript configuration; `test/tsconfig.json`
checks the test helper and assertions without opting the package into the port
ratchet. The Effect port can move the suite to `@effect/vitest` later.

`support.ts` owns the in-memory driver boundary (`open`, `exec`, `all`, `get`,
`close`) and Drizzle construction. Every database and row is synthetic. No
application is launched and no profile or owner database is read.

Snapshots are checked-in expectations. Test execution never records or rewrites
them. Changes require reviewing the old/new schema or return-value contract.
SQLite SQL normalization removes formatting whitespace, including whitespace
inside parentheses; it retains case, identifiers, predicates, defaults and all
constraints. Column order remains pinned in schema snapshots. Tests of older
additive shapes compare columns by name because SQLite appends added columns.

The desktop migration module runs from its real TypeScript source, transpiled
by esbuild in an isolated VM with only Electron's `app.getAppPath` substituted.
The private subscription migration function is selected from the real host
source between its named declaration and the next named declaration, then run
with an in-memory connection and a silent logger. Neither harness imports the
host's database singleton or application dependencies. Renaming these functions
fails the harness and requires an explicit test update.

Known current behavior is preserved rather than repaired:

- Individual V2+ `ALTER TABLE` constants fail when repeated; appliers are
  idempotent when callers refresh their column arrays.
- The transcript applier's initial call skips `words_json` when segment columns
  are omitted or empty. The real store invokes it again with segment columns.
- SQLite reports `notnull=0` for several primary keys while Drizzle reports
  `notNull=true`; the exact differences are frozen in `known-column-drift.json`.
- Subscription `auto_download` has a SQL default of `1` but no Drizzle default.
- SQLite has a `tasks.parent_id` foreign key absent from the Drizzle object,
  and partial predicates on `idx_tasks_next_retry` and `idx_journal_open` that
  are absent from the Drizzle objects. Desktop upgrades retain an extra legacy
  `subscription_items_subscription_idx` index.
- The subscription version marker lives in `subscriptions_meta` even when
  `schema_meta` exists; its existing timestamp survives reapplication.

The migration hash snapshot pins the exact SHA-256 of each existing SQL file
and its journal timestamp as well as the migrator's persisted values. Editing
migration bytes, reordering journal entries, changing columns, or changing the
current migration metadata table fails the suite.
