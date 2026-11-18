# Phase 3 details: pinning inventory, `node:sqlite` spike and implementation receipts

The working record behind the [phase 3 report](3.md). It was written in three parts as the phase
progressed (pinning and spike, implementation, strict-rule resolution), and keeps the spike's own
recommendation as written; the decision taken is in the report and in [the design](../design/db.md).

## Progress

- [x] Read lane brief, common rules, locked plan and golden guidance.
- [x] Confirm clean starting worktree on `port/db`, baseline `299551e`.
- [x] Inventory database consumers and keep production source unchanged.
- [x] Pin current DDL, upgrades, Drizzle metadata, migrations and round trips.
- [x] Run the nine spike investigations on the requested runtimes and database copies; document measurement scope and failures.
- [x] Record D30 recommendation and transition evidence.
- [x] Run repository gates and write scratch `HANDOFF.md`.

This is the investigation and characterization part of phase 3. Schema/service design and
implementation belong to the phase owner's next part. The root Drizzle catalog remains unchanged.
Owner data is confined to scratch copies; this report contains only permitted metadata and timings.

## Pinning tests


Completed against unchanged `packages/db/src` and the current catalog. No owner database or fixture copy was needed or read: every test database is in-memory and every row synthetic.

### Files and execution

- `packages/db/test/pinning.test.ts`: 35 top-level node:test cases.
- `packages/db/test/support.ts`: in-memory better-sqlite3 adapter (`open`, `exec`, `all`, `get`, `close`), Drizzle construction, schema/config normalization, isolated actual desktop migration execution.
- `packages/db/test/snapshots/*.json`: 31 immutable JSON expectations, about 300 KB including helper/tests. No recorder remains in the repository. Tests do not write snapshots.
- `packages/db/test/tsconfig.json`: extends the unchanged, unported package tsconfig; includes source and tests. Does not extend the ported base or opt db into the ratchet.
- `packages/db/test/README.md`: test execution, harness isolation, normalization and known deviations.
- db `check`: `tsc --noEmit && tsc -p test/tsconfig.json`.
- db `test`: `tsc -p test/tsconfig.json && tsx --test test/*.test.ts`.
- Root `test` invokes db's `test` after existing audit tests.
- Added db dev dependencies `esbuild: catalog:` and `tsx: catalog:`; catalog itself unchanged. The workspace lock records were refreshed with `bun install`.

Choice: node:test/tsx as expressly allowed by this brief, preserving the unported package and running the same Node/better-sqlite3 driver as legacy consumers. It reuses the existing audit runner/tool versions. Porting tests to @effect/vitest belongs to implementation part 2.

### Coverage

1. All twelve Drizzle objects: full column names/order, SQL types, nullability, defaults, primary flags/autoincrement, composite primary keys, indexes/uniqueness and foreign keys/actions.
2. All four V1 DDL constants: normalized sqlite_master table/index SQL, pragma column/FK/index details, repeat application unchanged; task/subscription version marker rows.
3. Every exported V2+ DDL (subscription V2, transcript V2/V3/V4, prompt V2/V3/V4): expected upgraded schema, existing row preservation and new defaults, repeat direct ALTER raises exact SqliteError duplicate-column message.
4. Subscription applier: all 512 subsets of the nine additive columns; populated rows survive; existing present values survive; missing values obtain exact defaults/null; final columns match the pinned canonical schema; repeat refreshed application does not change schema/data.
5. Prompt applier: all eight subsets of thinking/thinking_ms/cloud_result_id, preserving rows/defaults and idempotence.
6. Transcript applier: all eight subsets of asr_tier/words_json/source_kind, preserving parent and segment rows/defaults and idempotence with actual segment introspection.
7. Fresh appliers: snapshot and repeat unchanged with refreshed columns; fresh transcript omission of words_json deliberately pinned. A later call with segment columns adds it, matching the real store's two-call setup.
8. Stale introspection arguments: current SqliteError behavior retained for all three appliers.
9. Actual desktop `migrate.ts`, isolated with only Electron app.getAppPath stubbed: fresh schema equals current Drizzle migrator; exact __drizzle_migrations hashes/timestamps pinned; migrator repeat and reconciliation repeat unchanged; old raw-journal states after zero, one, two and three migration files upgrade with synthetic download_history row preserved.
10. Exact migration SQL SHA-256 bytes independently checked against frozen hashes and journal timestamps.
11. Actual private desktop ensureSubscriptionsSchema implementation: selected source declaration is transpiled/injected into the isolated in-memory harness; original download_id value survives rename to task_id; repeated migration retains schema and rows; original legacy index survives.
12. Desktop current journal + task/subscription/transcript/prompt schema snapshot, with complete column-name/type matching and primary-key equality to all Drizzle objects. Existing default/nullability and relational/index deviations explicitly enumerated and pinned, so no new drift is silently accepted.
13. All twelve tables: insert two representative rows through Drizzle (filled nullable values vs null optionals); read through Drizzle and raw SQL; compare actual read values and JS types to frozen expectations. Covers integer epochs, real confidence, Unicode text, JSON text, composite keys, foreign-key-bearing rows and nulls.

The desktop harness imports no database singleton, settings, live application or profile. esbuild transpiles the actual migration source; the Electron boundary returns the repo desktop directory. TypeScript 7 is the native CLI package and does not expose the old compiler API, so esbuild is the explicit catalog-pinned test tool. The subscription function extraction fails if either named declaration disappears, requiring an intentional test update.

### Current deviations preserved (no source fixes)

- The fresh transcript applier deliberately omits words_json until called with nonempty segment-column introspection.
- V2+ ALTER constants themselves are not idempotent. The appliers need refreshed column arrays.
- SQLite pragma notnull differs from Drizzle for attempts.id, process_journal.seq, schema_meta.key, subscriptions_meta.key, tasks.id, transcript_segments.id, transcript_speakers.id and transcripts.id. SQLite INTEGER PRIMARY KEY seq is logically nonnull despite pragma's flag. The exact flags are recorded without conflating pragma reporting and logical constraints.
- subscriptions.auto_download gets SQLite default 1 but has no Drizzle default.
- tasks.parent_id has a SQLite self-reference missing from the Drizzle object.
- SQLite idx_tasks_next_retry and idx_journal_open are partial indexes, while the Drizzle objects omit their predicates. Full SQL predicates are pinned in schema snapshots; explicit relational checks additionally pin the partial flags.
- Upgraded desktop subscription_items retains the extra legacy subscription_items_subscription_idx.
- Subscription version metadata stays in subscriptions_meta even when schema_meta exists, and preserves its prior updated_at.

### Focused evidence

- `bun run --cwd packages/db check`: exit 0, source and test tsc checks clean.
- `bun run --cwd packages/db test`: exit 0, 35 passed, 0 failed/skipped, about 1.4 seconds for node:test (test tsc precedes it).
- Test run guarded with SHA-256 of all 31 snapshots before/after: unchanged = true.
- `git diff -- packages/db/src`: empty.
- No suppressions, any casts, snapshot-writing calls, owner/private content or generated recorder in tests.
- Whole-repository gate results are recorded separately below.

The owner's app and profile were not touched.

## Spike

### Reproduction

Exact throwaway dependency pins: effect 4.1.4; @effect/sql-sqlite-node 4.1.4; drizzle-orm and drizzle-kit 1.0.0-rc.5; better-sqlite3 13.2.0. `spike/package.json` and `spike/bun.lock` record them. The install succeeds with `TMPDIR=/tmp BUN_TMPDIR=/tmp BUN_INSTALL_CACHE_DIR=<scratch>/tmp/cache bun install --cwd spike`; TMP variables alone returned EROFS. No root catalog changed.

Run each `spike/runtime.mjs`, `spike/lock-probe.mjs`, and `spike/lock-extra.mjs` using:

```sh
ELECTRON_RUN_AS_NODE=1 ~/YeeBois/workstation-apps/VidBee/apps/desktop/dist/linux-unpacked/vidbee <script>
~/YeeBois/workstation-apps/VidBee/apps/desktop/dist/linux-unpacked/resources/resources/node/node <script>
~/.local/share/mise/installs/bun/1.4.4/bin/bun <script>
```

All commands returned exit 0 and output explicit per-case outcomes. Output files are `spike/{electron,node,bun}.out` and `.err`, `locks-*.out`, `extra-*.out`. Exit 0 alone is not a pass criterion; script errors are represented in JSON. Final runtime output contains no case-level unexpected errors. The deliberately unsupported node SqlClient stream is reported as a failed synchronous operation.

`spike/setup-fixture.mjs` creates an empty database using only the backup’s SQLite schema, copies only safe migration hash/timestamp metadata, then calls the canonical `buildFixture` function. This avoids launching or touching the owner app. The schema bootstrap was schema-only, rather than an actual desktop launch; the resulting synthetic fixture was populated by the real golden builder. `fixture/vidbee.db` is also used for migration probes. Each runtime starts with a fresh byte copy under `runs/<runtime>/<kind>/`.

### Runtime versions

| Runtime | Runtime version | Embedded Node | SQLite | First-use stderr |
| --- | --- | --- | --- | --- |
| electron | 43.8.10 | 24.22.1 | 3.53.4 | empty |
| node | 22.23.4 | 22.23.4 | 3.53.4 | ExperimentalWarning |
| bun | 1.4.4 | 26.3.0 | 3.53.4 | empty |

Complete `process.versions` appears in the first JSON line of each runtime output. Recorded output:

```json
{"key":"versions","value":{"node":"24.22.1","acorn":"8.18.0","ada":"4.0.0","amaro":"1.1.11","ares":"1.34.9","brotli":"1.2.0","cldr":"48.0","icu":"78.2","llhttp":"9.4.3","merve":"1.2.2","modules":"148","napi":"10","nbytes":"0.1.4","ncrypto":"0.0.1","nghttp2":"1.70.0","nghttp3":"","ngtcp2":"","openssl":"0.0.0","simdjson":"4.6.11","simdutf":"7.7.0","sqlite":"3.53.4","tz":"2026e","undici":"7.30.1","unicode":"17.0","uv":"1.52.1","uvwasi":"0.0.23","v8":"15.0.245.31-electron.0","zlib":"1.3.2.1-motley","zstd":"1.6.0","electron":"43.8.10","chrome":"150.0.7871.250"}}
{"key":"versions","value":{"node":"22.23.4","acorn":"8.16.0","ada":"2.9.2","amaro":"1.1.8","ares":"1.34.9","brotli":"1.1.0","cjs_module_lexer":"2.2.0","cldr":"48.0","icu":"78.3","llhttp":"9.4.3","modules":"127","napi":"10","nbytes":"0.1.3","ncrypto":"0.0.1","nghttp2":"1.69.0","openssl":"3.5.9","simdjson":"4.5.0","simdutf":"6.4.2","sqlite":"3.53.4","tz":"2026e","undici":"6.29.1","unicode":"17.0","uv":"1.51.0","uvwasi":"0.0.23","v8":"12.4.254.21-node.57","zlib":"1.3.1-e00f703","zstd":"1.5.7"}}
{"key":"versions","value":{"node":"26.3.0","bun":"1.4.4","boringssl":"41bf9b59c2ebf277a7aa427e1ecad5cc80dd4d4f","openssl":"1.1.0","llhttp":"9.4.2","libarchive":"27cbc7827172698143e440801fc0ba39ccb4f1f5","mimalloc":"92ef6587c57b262f6e6abf513f7776a2f8d12aeb","picohttpparser":"f4d94b48b31e0abae029ebeafcfd9ca0680ede58","uwebsockets":"38afee6c84fcf48c0edb2466aa4b27d287a59c30","webkit":"d6375c72affe0f70222cdcb45012b10f0bf3a9d5","zig":"04e7f6ac1e009525bc00934f20199c68f04e0a24","zlib":"12731092979c6d07f42da27da673a9f6c7b13586","tinycc":"05f0fafaa3be31e31d7b4b5c17dc60f62c991171","lolhtml":"725ce499aa9b71e38b7a2d0a9fbb6d7294a4079e","ares":"c7a3138dcfe3bb0eaaf10c0c24c36dc66dc790ab","libdeflate":"92e6a0db9fa848d742f9eb286c92afc60f2c3dda","usockets":"38afee6c84fcf48c0edb2466aa4b27d287a59c30","lshpack":"cf0f70dd10b352194c97448eb5d00b4aa484f531","zstd":"f8745da6ff1ad1e7bab384bd1f9d742439278e99","v8":"14.6.202.34-node.20","uv":"1.48.0","napi":"10","icu":"78.3","unicode":"17.0","sqlite":"3.53.4","typescript":"7.0.2","modules":"147"}}
```
 better-sqlite3 uses its supplied prebuilt N-API binding directly on all three runtimes; no ABI rebuild or driver substitution was needed.

### Q1 and Q2: opening, parity and type fidelity

On both fixture and owner copies, on all three runtimes:

- WAL remains `wal`; foreign_keys is 1; user_version is 0; integrity_check produces one result row and zero non-OK results. Backup contains 21 tables when `sqlite_sequence` is counted; content comparisons cover all 20 non-internal tables.
- Explicit `SELECT count(*)` queries through Better, raw Node and Effect SqlClient are compared to each other and to the corresponding row-array lengths for every table. Full-table counts and canonical ordered content checksums match Better → raw Node → Effect SqlClient for all 20 tables. Each table also has explicit `SELECT count(*)` checks through Better, raw Node and SqlClient, matched to result-array lengths. Canonicalization sorts rows and keys and represents blobs and bigints explicitly; hashes and rows are computed in memory and never printed.
- Effect Drizzle reads also match all 20 tables using column reflection. Separately, all **12 actual exported repository table definitions** from the five db source modules are copied unchanged into `spike/schemas/`, bundled to `schemas.mjs` with Drizzle external, and used by `drizzle-orm/effect-sqlite-node`. Each exported table matches the Better raw projection after mapping TypeScript property keys to SQL column names. These are real repository definitions against RC Drizzle, not only reflected substitutes.
- Declared column types: SERIAL 1, TEXT 115, numeric 1, INTEGER 54, REAL 1. No BLOB declared in these schemas. A separate synthetic INTEGER/REAL/TEXT/BLOB/null row matches Better, raw Node, Effect SqlClient and Effect Drizzle (`type-probe.mjs` on all runtimes). No integer column has an observed absolute maximum above 2^53−1. Only this boolean/count is output.
- Synthetic integer 9007199254740993: raw node defaults throw RangeError `ERR_OUT_OF_RANGE`; `setReadBigInts(true)` returns bigint. Better’s default numeric conversion can lose precision outside its safe-integer mode. Therefore future large integers need explicit safe-integer policy.

The installed client calls `setReadBigInts(Context.get(..., SqlClient.SafeIntegers))` on every prepared execution; its default is false. Values queries toggle `setReturnArrays(true)` and reset it. All tested bundled runtimes expose both methods. `allowBareNamedParameters` is not changed by the Effect client; neither are named-parameter policy settings. It opens `DatabaseSync({ readOnly, allowExtension: true })`, then disables extension loading, sets busy_timeout=5000 by default, and enables WAL unless disabled. The tested Node22 build has APIs sometimes absent from older 22.x releases, so its exact version matters.

### Q3: transactions and same-file coexistence

On all three runtimes and both database copies, Effect commit, rollback on failure, nested savepoint success, and inner savepoint rollback pass. Final synthetic IDs are [1,2,4]; failed transaction ID3 and failed inner ID5 are absent. Reads inside a transaction see expected rows. Both raw drivers write sequentially and can checkpoint WAL successfully.

**Conflicting mixed writers fail isolation.** Independent synthetic controls isolate the result from private data:

| Handle A holds BEGIN IMMEDIATE and uncommitted INSERT(2) | Handle B INSERT(3) | Result |
| --- | --- | --- |
| Better → Better | ~80ms | SqliteError, SQLITE_BUSY, `database is locked` |
| Node → Node | ~80ms | Error, ERR_SQLITE_ERROR, errcode 5, `database is locked` |
| Better → Node, same process | succeeds in ~3ms | conflicting writer admitted |
| Node → Better, same process | succeeds in ~0.2ms | conflicting writer admitted |
| Better → Node, separate process | ~80ms | Error, ERR_SQLITE_ERROR, errcode 5, `database is locked` |
| Node → Better, separate process | ~80ms | SqliteError, SQLITE_BUSY, `database is locked` |

This matrix repeats identically on Electron, Node22 and Bun. In `lock-extra.mjs` mixed-commit mode, B reports insert3 success, then A commits; final IDs are [1,2], so B’s acknowledged insert3 is **lost**. Both handles are then closed and a fresh DatabaseSync reopens the file: IDs remain [1,2], so insert3 is durably absent. Final integrity_check says `ok` on every run. That is direct evidence of lost writes rather than an inferred risk. Both mixed directions fail. The separate-process and same-driver controls do block correctly, so timeout configuration and transaction setup are verified. The likely cause is independently linked SQLite libraries not sharing the same-process locking coordination; that mechanism is an inference, while the lost write is observed.

### Q4 and Q5: synchronous Effect and existing-handle adapter

After constructing each ManagedRuntime with `runPromise`, `ManagedRuntime.runSync` passes single statements, transactions, and one reused prepared SELECT executed 10,000 times on both databases, on all runtimes. Direct `Effect.runSync(statement)` also passes. **No AsyncFiberException occurs** in these uncontended tests. The semaphore has a synchronous uncontended path; this does not promise synchronous completion when another fiber holds the permit or the Effect performs genuinely async work.

The standard driver’s `.stream` fails with defect `executeStream not implemented`. That is an explicitly unsupported driver operation, **not** an async-boundary failure. No supported streaming workaround exists inside that driver; normal eager result reads work.

`spike/custom-client.mjs` is a 27-line JavaScript prototype built entirely from public Effect constructors: SqlClient.make, SqlClient.makeSqliteAcquirers, Statement.makeCompilerSqlite, Semaphore.make, SqlError/classifySqliteError. The host supplies one existing Better handle; the adapter opens no connection and never closes it. It has a one-statement preparation cache and flattens its eager rows into a Stream. Host handle remains open and readable after disposing the runtime. All single/transaction/10,000 reused prepared query/stream runSync checks pass on both copies and all runtimes. This is feasibility proof, not a production adapter: no full TypeScript schema/service port, full cache policy, safe-integer context handling, host-owned external-transaction nesting policy or lifetime ownership contract is implemented here. Streaming eagerly materializes rows.

| Runtime / owner copy | Standard 10k sync SELECT ms | Adapter 10k sync SELECT ms | Adapter stream |
| --- | --- | --- | --- |
| electron | 27.451 | 20.273 | pass, flattened rows |
| node | 32.398 | 21.894 | pass, flattened rows |
| bun | 23.171 | 22.618 | pass, flattened rows |


### Scope and reproducible commands

From this part's `spike/` directory (exact dependencies installed there):

```sh
# Copy resources/drizzle to migration-up before the upgrade; migration-old remains pristine.
./node_modules/.bin/drizzle-kit up --config=migration.config.ts
NODE22 migration-probe.mjs > migration-node.jsonl 2> migration-node.stderr
ELECTRON_RUN_AS_NODE=1 ELECTRON migration-probe.mjs > migration-electron.jsonl 2> migration-electron.stderr
BUN144 migration-probe.mjs > migration-bun.jsonl 2> migration-bun.stderr
# Same runtime prefixes for migration-baseline.mjs and api-runtime-probe.mjs.
# tsc initial baseline / RC source checks:
REPO/node_modules/.bin/tsc -p api-baseline.json
REPO/node_modules/.bin/tsc -p api-rc.json
```

`NODE22` = packaged `resources/resources/node/node` (22.23.4); `ELECTRON` = baseline `linux-unpacked/vidbee` (43.8.10, Node 24.22.1); `BUN144` = mise Bun 1.4.4. Full `process.versions` is first line of every `migration-<runtime>.jsonl`. Scripts use only the copied `owner-db/vidbee.db` and synthetic `fixture/vidbee.db`. Each `(runtime, folder, adapter, input)` gets a fresh database copy; empty paths are removed before opening. Native better-sqlite3 13.2.0 bundled `prebuilds/linux-x64.node` works on all three runtimes.

The fixture was built for the runtime probes: schema copied from the owner backup, safe migration hash/timestamp metadata only, then the repo golden fixture builder supplied synthetic rows. This is not a packaged application launch.

### Q6: entry points and folder upgrade

All three public exports exist at 1.0.0-rc.5:

| Adapter | Migrator | Execution |
| --- | --- | --- |
| better-sqlite3 | `drizzle-orm/better-sqlite3/migrator` `migrate` | synchronous |
| node:sqlite | `drizzle-orm/node-sqlite/migrator` `migrate` | synchronous |
| Effect node:sqlite | `drizzle-orm/effect-sqlite-node/migrator` `migrate` | Effect; yield/run it with SQLite client layer |

All call shared `readMigrationFiles`. It rejects `meta/_journal.json`, then scans direct child folders containing `migration.sql`, sorts directory names, takes their first 14 characters as UTC `YYYYMMDDHHMMSS`, splits SQL on `--> statement-breakpoint`, and hashes the complete original SQL bytes. Legacy folder direct use on every runtime/adapter/input throws:

```text
Error: We detected that you have old drizzle-kit migration folders. You must upgrade drizzle-kit and run "drizzle-kit up"
```

All 27 old-folder cases left schema and migration rows unchanged.

`drizzle-kit up --config=migration.config.ts` succeeded (exit 0) and replaced the flat numbered SQL files plus `meta` journal/snapshots with:

```text
20251115032041_swift_aaron_stack/{migration.sql,snapshot.json}
20260121021248_smiling_agent_zero/{migration.sql,snapshot.json}
20260121021305_smooth_impossible_man/{migration.sql,snapshot.json}
```

SQL files are byte-for-byte identical before/after, so all three hashes below are preserved. The version-6 SQLite snapshot object (`tables`, `views`, `prevId`, etc.) becomes version 7 (`ddl`, `prevIds`, `renames`). Millisecond journal timestamps become second-precision directory timestamps.

### Q6: owner, fixture, and empty results

Every row here represents all three adapters (`better`, `node`, `effect`):

| Runtime | Owner upgraded folder | Fixture upgraded folder | Empty upgraded folder | Second migration call |
| --- | --- | --- | --- | --- |
| Node 22.23.4 | succeeds; only tracking table gains columns | same | same business schema as old migrator | unchanged |
| Electron 43.8.10 | succeeds; only tracking table gains columns | same | same business schema as old migrator | unchanged |
| Bun 1.4.4 | succeeds; only tracking table gains columns | same | same business schema as old migrator | unchanged |

27 upgraded cases succeeded. All 27 repeat calls succeeded with exactly unchanged schema and hash/timestamp rows. No original migration SQL reran on owner/fixture (it would fail on duplicate tables/columns); tracking names were successfully backfilled.

Owner and fixture rows, **before and after**, on every runtime and adapter:

```json
[
  {
    "hash": "20c544c34667576d75c3c377d9f10aeaa281eba2892a91b32c7d6b32fbeb33d3",
    "created_at": 1763176841336
  },
  {
    "hash": "820a72164d76d265455f1a8642e27af0beaae03b2878df2726bfcc3f3105ca04",
    "created_at": 1768961568903
  },
  {
    "hash": "b52ea0e29bd5d00f68db555d33153432c66dbd286c0594e85d40b20094e941e8",
    "created_at": 1768961585359
  }
]
```

Schema diff on owner/fixture is exactly one changed sqlite_master entry:

```diff
-CREATE TABLE "__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)
+CREATE TABLE "__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric, "name" text, "applied_at" TEXT)
```

No application table, index, or trigger changed. The new migrator upgrades its own tracking schema and backfills names; `hash` and `created_at` stay unchanged. The strict expected no-schema-diff assertion is therefore false and must be stated as a migration compatibility caveat, even though application data is not replayed.

On empty databases the three original migration hashes match today's migrator. New `created_at` values are `1763176841000`, `1768961568000`, `1768961585000` (last three digits dropped), versus the baseline millisecond values above. New tracking tables use `id INTEGER PRIMARY KEY`, plus `name` and `applied_at`; baseline tracking tables use `id SERIAL PRIMARY KEY`. `migration-baseline.mjs` uses repo Drizzle 0.45.4 / its actual better-sqlite3 migrator on empty DB, and compared ordered non-tracking sqlite_master records exactly. All nine `(runtime, RC adapter)` comparisons report `businessSchemaEqual:true`.

Implementation detail relevant to acceptance: `up-migrations/sqlite.js` and the Effect counterpart match existing tracking rows by second-truncated timestamp, with hash fallback/tiebreaks; they do not require millisecond equality. This explains why existing rows remain untouched despite folder precision changing.

Node 22 stderr contains the SQLite ExperimentalWarning. Migration runs on Electron/Bun emitted no stderr. Packaging implications belong to Q9.

### Q7: complete repository import inventory and compilation

An initial `rg` inventory found these direct Drizzle consumers, all included explicitly in both scratch TypeScript configurations:

- `packages/db/src/{history,task-queue,subscriptions,transcripts,prompt-runs}.ts`
- `apps/desktop/src/main/lib/database.ts`
- `apps/desktop/src/main/lib/database/{schema,migrate}.ts`
- `packages/subscriptions-core/src/store.ts`
- `packages/subscriptions-core/test/profile-subscriptions.test.ts`
- `apps/desktop/drizzle.config.ts`

Their relative import closure was preserved under `api-src`; compiler paths force the RC Drizzle declarations for the RC compile and actual repo 0.45.4 declarations for baseline. Same TypeScript 7.0.2 compiler/options in both. This is a dependency compatibility comparison, not the repo port gate. Six unchanged transitive errors in downloader-core (`social-media.ts`, `threads.ts`) prevent baseline exit 0. They are recorded in `api-baseline.log`; do not call this a clean whole-app compile.

Only two added RC diagnostics occur:

```text
apps/desktop/src/main/lib/database.ts(34,22): TS2345 [Database] is not assignable to drizzle's new overloads
packages/subscriptions-core/test/profile-subscriptions.test.ts(254,62): TS2345 same
```

Both fix by changing `drizzle(sqlite)` to `drizzle({ client: sqlite })`. The RC constructor accepts a connection string or a config object; existing handles are a `client` field. This is also a runtime hazard: an early probe using the old unchecked call silently opened another in-memory connection rather than mutating the supplied file. That probe was corrected and all migration experiments rerun from fresh input copies. Only final rerun logs remain in `migration-<runtime>.jsonl`.

After applying those two changes **only in the scratch copy**, compiler diagnostics are byte-for-byte identical to baseline, on all three runtimes. `api-runtime-probe.mjs` outputs `diagnosticsEqualBaseline:true` and compiler exit 1 for each, preserving the baseline failure honestly. `api-rc.log` is the initial unmodified RC output; `api-rc-fixed.log` is the fixed output. No other current type-facing query/table/index/config/migrator usage broke in this comparison. Existing object-returning desktop `sqliteTable` index callback still compiles, as do filters, select/insert/update/delete, transaction call sites and existing `BetterSQLite3Database` type use.

Migration format is a separate operational break even though its import compiles: existing `database/migrate.ts` still points to the old folder. Its deployment must upgrade resources atomically and account for Drizzle tracking metadata, rather than just bumping versions.

### Q7: generation is not initially no-op

`api-runtime-probe.mjs` starts each runtime with a fresh copy of upgraded snapshots, a copy of the real desktop config's schema file resolving RC table builders, and isolated config/out paths. On **all three runtimes**, first `drizzle-kit generate` exits 0 and proposes:

```sql
ALTER TABLE `subscriptions` ADD `auto_download` integer NOT NULL;
DROP TABLE `download_history`;
```

Never applied. This fails the requested initial “no changes” expectation. The real desktop schema exports only subscriptions/subscription_items, omits history, and includes auto_download while the committed last snapshot has history but lacks auto_download. The old repo drizzle-kit, run separately against the pristine old snapshots/current schema, proposes the **same SQL**, proving this is pre-existing snapshot/schema drift. Generated artifacts stay in scratch (`api-generate-{node,electron,bun}` and `api-generate-old`), not the deployment migration folder. A second generation against the new generated snapshot says `No schema changes, nothing to migrate`; that second-run result does not satisfy the original expectation.

Current package-level definitions cover more tables/columns than the desktop Drizzle config; blindly changing the schema glob would create still more baseline changes. Reconcile this explicitly in the port design and preserve historical SQL/hashes. Do not apply this generated DROP migration to the owner's database.


### Q8: performance sanity

Fifteen candidate raw SQL shapes are inventoried from the named startup/Home stores and their agent restore dependencies. Each is profiled on all three drivers; the ten slowest by Better median on each runtime are shown below. Parameters select the most populated applicable group internally (IDs never output), with row counts reported. This is an actual ranking within the stated source inventory, not a whole-app CPU profile: Drizzle-generated Home queries outside this raw SQL inventory and startup migration metadata probes are outside this ranking. Startup restoration’s all-task and orphan-process queries dominate measured latency. Runs use hot prepared statements, 20 executions each, report the arithmetic median of sorted samples 9 and 10 (zero based), and include Effect runPromise overhead. Absolute timings are workload- and machine-specific.

| Shape | Source |
| --- | --- |
| load-all-tasks | packages/task-queue/src/persist/sqlite.ts:510 |
| open-spawns | packages/task-queue/src/persist/sqlite.ts:491 |
| latest-attempt | packages/task-queue/src/persist/sqlite.ts:516 |
| child-ids | packages/task-queue/src/persist/sqlite.ts:295 |
| attempt-count | packages/task-queue/src/persist/sqlite.ts:305 |
| saved-prompts | apps/desktop/src/main/lib/video-library-host.ts:160 |
| agent-threads | apps/desktop/src/main/lib/agent-chat-store.ts:498 |
| agent-messages | apps/desktop/src/main/lib/agent-chat-store.ts:315 |
| agent-runs | apps/desktop/src/main/lib/agent-chat-store.ts:323 |
| agent-run-entries | apps/desktop/src/main/lib/agent-chat-store.ts:331 |
| agent-header | apps/desktop/src/main/lib/agent-chat-store.ts:306 |
| agent-artifacts | apps/desktop/src/main/lib/agent-chat-store.ts:319 |
| agent-events | apps/desktop/src/main/lib/agent-chat-store.ts:466 |
| video-running | apps/desktop/src/main/lib/video-library-host.ts:70 |
| all-agent-thread-ids | apps/desktop/src/main/lib/agent-chat-store.ts:146 |

#### electron: median milliseconds, owner copy

| Query | Rows | Better | Raw Node | Effect Node | Effect / Better |
| --- | ---: | ---: | ---: | ---: | ---: |
| open-spawns | 0 | 20.501185 | 21.277746 | 20.584669 | 1.00x |
| load-all-tasks | 820 | 2.171109 | 2.703108 | 2.729264 | 1.26x |
| video-running | 0 | 0.191135 | 0.194680 | 0.197213 | 1.03x |
| agent-events | 480 | 0.064790 | 0.080679 | 0.083013 | 1.28x |
| agent-run-entries | 31 | 0.042786 | 0.038440 | 0.042581 | 1.00x |
| agent-messages | 3 | 0.012865 | 0.009645 | 0.012679 | 0.99x |
| latest-attempt | 1 | 0.009830 | 0.003245 | 0.006040 | 0.61x |
| agent-runs | 2 | 0.009315 | 0.006650 | 0.009224 | 0.99x |
| agent-threads | 13 | 0.006901 | 0.004386 | 0.006936 | 1.01x |
| all-agent-thread-ids | 49 | 0.005138 | 0.007201 | 0.009690 | 1.89x |
| 10,000 inserts / one transaction | 10000 | 5.303848 | 8.489185 | 32.002444 | 6.03x |

#### node: median milliseconds, owner copy

| Query | Rows | Better | Raw Node | Effect Node | Effect / Better |
| --- | ---: | ---: | ---: | ---: | ---: |
| open-spawns | 0 | 19.816686 | 19.075088 | 18.899013 | 0.95x |
| load-all-tasks | 820 | 2.363185 | 3.221597 | 3.406356 | 1.44x |
| video-running | 0 | 0.190918 | 0.187499 | 0.192351 | 1.01x |
| agent-events | 480 | 0.095096 | 0.104902 | 0.118803 | 1.25x |
| agent-run-entries | 31 | 0.047428 | 0.045840 | 0.049221 | 1.04x |
| agent-messages | 3 | 0.015454 | 0.010827 | 0.013761 | 0.89x |
| agent-runs | 2 | 0.009760 | 0.007262 | 0.009945 | 1.02x |
| latest-attempt | 1 | 0.009645 | 0.003966 | 0.006826 | 0.71x |
| agent-threads | 13 | 0.006680 | 0.004307 | 0.007045 | 1.05x |
| all-agent-thread-ids | 49 | 0.005944 | 0.007617 | 0.010225 | 1.72x |
| 10,000 inserts / one transaction | 10000 | 6.644624 | 15.987028 | 35.626440 | 5.36x |

#### bun: median milliseconds, owner copy

| Query | Rows | Better | Raw Node | Effect Node | Effect / Better |
| --- | ---: | ---: | ---: | ---: | ---: |
| open-spawns | 0 | 21.036855 | 20.652979 | 20.322926 | 0.97x |
| load-all-tasks | 820 | 2.874797 | 3.033752 | 2.960745 | 1.03x |
| video-running | 0 | 0.180468 | 0.175575 | 0.179676 | 1.00x |
| agent-events | 480 | 0.091075 | 0.060893 | 0.070363 | 0.77x |
| agent-run-entries | 31 | 0.072867 | 0.081235 | 0.076397 | 1.05x |
| agent-messages | 3 | 0.018078 | 0.015123 | 0.017647 | 0.98x |
| agent-runs | 2 | 0.015409 | 0.011954 | 0.015149 | 0.98x |
| latest-attempt | 1 | 0.010086 | 0.004838 | 0.007406 | 0.73x |
| agent-threads | 13 | 0.007256 | 0.003195 | 0.006290 | 0.87x |
| all-agent-thread-ids | 49 | 0.005959 | 0.003375 | 0.005614 | 0.94x |
| 10,000 inserts / one transaction | 10000 | 4.303173 | 7.240407 | 26.819937 | 6.23x |

Finding: none of the ranked ten read shapes exceeds 2x Effect/Better on the final run. Some faster, unselected candidate queries exceed 2x, at microsecond absolute latency (full candidate JSON retained). The two large startup queries are below 2x. The 10k-row transaction is materially slower through Effect (per-statement Effect execution), and exceeds 2x on every runtime. The ten-thousand insert test runs 20 fresh scratch-table transactions per driver; no owner table is mutated.

### Q9: packaging, SQLite features and warnings

All three built-ins report SQLite 3.53.4 and pass actual JSON extraction, INSERT RETURNING, upsert, STRICT table and FTS5 creation probes. No feature divergence was observed. The repo db schema does not currently declare STRICT/FTS tables; probing them is additional feature coverage.

Electron 43.8.10 and Bun 1.4.4 first-use stderr are empty. Node 22.23.4 prints exactly (PID substituted):

```text
(node:<pid>) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
```

`warning-filter.mjs` demonstrates flag-free suppression with public process EventEmitter APIs: remove Node’s default warning listener, register a replacement that drops only the SQLite ExperimentalWarning and writes other warning stacks. Running bundled Node on this probe prints `sqlite opened` and stderr is zero bytes. Caveat: replacing the global default warning printer changes process-wide warning handling; merely adding a listener does not suppress default output. There is no per-SqliteClient suppress-warning option. CLI stderr parity therefore needs an explicit entrypoint warning policy or a process flag.

`bundle-build.mjs` imports the repository-installed **electron-vite 6.0.0**, loads `electron.spike.config.mjs`, and runs its real main-process build. The config uses the repository’s CJS output and native-external list; it does **not** explicitly list `node:sqlite`. The resulting 0.33kB bundle contains `require("node:sqlite")`, proving built-in externalization happens automatically. Actual Electron execution returns `{"bundle":"electron-vite-main","rows":1}` and empty stderr. The build warns only that renderer/preload configs are absent, expected for this main-only probe. No new native SQLite addon is required for node:sqlite. This is a focused packaging proof, not a rebuilt full app or golden suite.

### Trimmed actual output receipts

These are verbatim sanitized JSON lines from the final runs; complete output files remain beside the scripts. Every runtime and both databases are covered in the full files.

#### electron receipts

```json
{"key":"feature-probe","value":{"sqlite":"3.53.4","json":1,"returning":1,"upsert":1,"fts":true}}
{"key":"owner-db/pragma","value":{"journal_mode":[{"journal_mode":"wal"}],"foreign_keys":[{"foreign_keys":1}],"user_version":[{"user_version":0}],"integrityRows":1,"integrityNonOkCount":0}}
{"key":"owner-db/parity","value":{"tables":20,"checksums":"match","drizzleTables":20,"rowCounts":"match","types":{"SERIAL":1,"TEXT":115,"numeric":1,"INTEGER":54,"REAL":1},"unsafeIntegers":0}}
{"key":"owner-db/transactions","value":{"nestedRead":[{"n":3}],"rows":[{"id":1},{"id":2},{"id":4}]}}
{"key":"owner-db/sync-single","value":{"ok":true,"value":[{"n":1}],"elapsedMs":0.03089799999997922}}
{"key":"owner-db/effect-runSync-single","value":{"ok":true,"value":[{"n":1}],"elapsedMs":0.007822000000032858}}
{"key":"owner-db/sync-transaction","value":{"ok":true,"value":[{"n":1}],"elapsedMs":0.0638379999998051}}
{"key":"owner-db/sync-10000","value":{"ok":true,"elapsedMs":27.451029000000062}}
{"key":"owner-db/sync-stream","value":{"ok":false,"error":{"message":"executeStream not implemented"},"elapsedMs":0.15979700000002595}}
{"key":"owner-db/custom-sync","value":{"single":{"ok":true,"value":[{"n":1}],"elapsedMs":0.09489700000017365},"transaction":{"ok":true,"value":[{"n":1}],"elapsedMs":0.11080000000015389},"tenThousand":{"ok":true,"elapsedMs":20.27325399999995},"stream":{"ok":true,"value":[{"n":1}],"elapsedMs":0.1537269999998898}}}
{"key":"owner-db/host-handle-after-dispose","value":{"open":true,"read":1}}
{"typesMatch":{"raw":true,"effect":true,"drizzle":true},"largeIntegerDefault":{"name":"effect/sql/SqlError","tag":"SqlError","message":"Failed to execute statement"},"safeIntegersType":"bigint","betterDefaultType":"number"}
{"pair":["better","node"],"mode":"mixed-commit","result":{"ok":true},"ids":[{"id":1},{"id":2}],"integrity":[{"integrity_check":"ok"}]}
{"pair":["better","node"],"mode":"mixed-commit","postCloseReopenIds":[{"id":1},{"id":2}],"integrity":[{"integrity_check":"ok"}]}
{"pair":["node","better"],"mode":"mixed-commit","result":{"ok":true},"ids":[{"id":1},{"id":2}],"integrity":[{"integrity_check":"ok"}]}
{"pair":["node","better"],"mode":"mixed-commit","postCloseReopenIds":[{"id":1},{"id":2}],"integrity":[{"integrity_check":"ok"}]}
```

#### node receipts

```json
{"key":"feature-probe","value":{"sqlite":"3.53.4","json":1,"returning":1,"upsert":1,"fts":true}}
{"key":"owner-db/pragma","value":{"journal_mode":[{"journal_mode":"wal"}],"foreign_keys":[{"foreign_keys":1}],"user_version":[{"user_version":0}],"integrityRows":1,"integrityNonOkCount":0}}
{"key":"owner-db/parity","value":{"tables":20,"checksums":"match","drizzleTables":20,"rowCounts":"match","types":{"SERIAL":1,"TEXT":115,"numeric":1,"INTEGER":54,"REAL":1},"unsafeIntegers":0}}
{"key":"owner-db/transactions","value":{"nestedRead":[{"n":3}],"rows":[{"id":1},{"id":2},{"id":4}]}}
{"key":"owner-db/sync-single","value":{"ok":true,"value":[{"n":1}],"elapsedMs":0.04923600000074657}}
{"key":"owner-db/effect-runSync-single","value":{"ok":true,"value":[{"n":1}],"elapsedMs":0.022284999999101274}}
{"key":"owner-db/sync-transaction","value":{"ok":true,"value":[{"n":1}],"elapsedMs":0.1384939999989001}}
{"key":"owner-db/sync-10000","value":{"ok":true,"elapsedMs":32.39835800000037}}
{"key":"owner-db/sync-stream","value":{"ok":false,"error":{"message":"executeStream not implemented"},"elapsedMs":0.22079999999914435}}
{"key":"owner-db/custom-sync","value":{"single":{"ok":true,"value":[{"n":1}],"elapsedMs":0.07375300000057905},"transaction":{"ok":true,"value":[{"n":1}],"elapsedMs":0.11825299999873096},"tenThousand":{"ok":true,"elapsedMs":21.894290999998702},"stream":{"ok":true,"value":[{"n":1}],"elapsedMs":0.22284299999955692}}}
{"key":"owner-db/host-handle-after-dispose","value":{"open":true,"read":1}}
{"typesMatch":{"raw":true,"effect":true,"drizzle":true},"largeIntegerDefault":{"name":"effect/sql/SqlError","tag":"SqlError","message":"Failed to execute statement"},"safeIntegersType":"bigint","betterDefaultType":"number"}
{"pair":["better","node"],"mode":"mixed-commit","result":{"ok":true},"ids":[{"id":1},{"id":2}],"integrity":[{"integrity_check":"ok"}]}
{"pair":["better","node"],"mode":"mixed-commit","postCloseReopenIds":[{"id":1},{"id":2}],"integrity":[{"integrity_check":"ok"}]}
{"pair":["node","better"],"mode":"mixed-commit","result":{"ok":true},"ids":[{"id":1},{"id":2}],"integrity":[{"integrity_check":"ok"}]}
{"pair":["node","better"],"mode":"mixed-commit","postCloseReopenIds":[{"id":1},{"id":2}],"integrity":[{"integrity_check":"ok"}]}
```

#### bun receipts

```json
{"key":"feature-probe","value":{"sqlite":"3.53.4","json":1,"returning":1,"upsert":1,"fts":true}}
{"key":"owner-db/pragma","value":{"journal_mode":[{"journal_mode":"wal"}],"foreign_keys":[{"foreign_keys":1}],"user_version":[{"user_version":0}],"integrityRows":1,"integrityNonOkCount":0}}
{"key":"owner-db/parity","value":{"tables":20,"checksums":"match","drizzleTables":20,"rowCounts":"match","types":{"SERIAL":1,"TEXT":115,"numeric":1,"INTEGER":54,"REAL":1},"unsafeIntegers":0}}
{"key":"owner-db/transactions","value":{"nestedRead":[{"n":3}],"rows":[{"id":1},{"id":2},{"id":4}]}}
{"key":"owner-db/sync-single","value":{"ok":true,"value":[{"n":1}],"elapsedMs":0.030547000000069602}}
{"key":"owner-db/effect-runSync-single","value":{"ok":true,"value":[{"n":1}],"elapsedMs":0.009324999999989814}}
{"key":"owner-db/sync-transaction","value":{"ok":true,"value":[{"n":1}],"elapsedMs":0.09330399999998917}}
{"key":"owner-db/sync-10000","value":{"ok":true,"elapsedMs":23.170906999999943}}
{"key":"owner-db/sync-stream","value":{"ok":false,"error":{"message":"executeStream not implemented"},"elapsedMs":0.2559039999998731}}
{"key":"owner-db/custom-sync","value":{"single":{"ok":true,"value":[{"n":1}],"elapsedMs":0.15464799999995194},"transaction":{"ok":true,"value":[{"n":1}],"elapsedMs":0.19255700000007892},"tenThousand":{"ok":true,"elapsedMs":22.617774999999938},"stream":{"ok":true,"value":[{"n":1}],"elapsedMs":0.30470900000000256}}}
{"key":"owner-db/host-handle-after-dispose","value":{"open":true,"read":1}}
{"typesMatch":{"raw":true,"effect":true,"drizzle":true},"largeIntegerDefault":{"name":"effect/sql/SqlError","tag":"SqlError","message":"Failed to execute statement"},"safeIntegersType":"bigint","betterDefaultType":"number"}
{"pair":["better","node"],"mode":"mixed-commit","result":{"ok":true},"ids":[{"id":1},{"id":2}],"integrity":[{"integrity_check":"ok"}]}
{"pair":["better","node"],"mode":"mixed-commit","postCloseReopenIds":[{"id":1},{"id":2}],"integrity":[{"integrity_check":"ok"}]}
{"pair":["node","better"],"mode":"mixed-commit","result":{"ok":true},"ids":[{"id":1},{"id":2}],"integrity":[{"integrity_check":"ok"}]}
{"pair":["node","better"],"mode":"mixed-commit","postCloseReopenIds":[{"id":1},{"id":2}],"integrity":[{"integrity_check":"ok"}]}
```

#### Build/run and warning-filter receipts

```text
vite v8.3.8 building ssr environment for production...
transforming...
✓ 2 modules transformed.
rendering chunks...
bundle-out/index.cjs  0.33 kB

✓ built in 11ms
{"bundle":"electron-vite-main","rows":1}
bundle-run.err: 0 bytes
sqlite opened
warning-filter.err: 0 bytes
```

### Verdict against D30

| Question | Result | Evidence |
| --- | --- | --- |
| 1. Open and read | pass | Both copies on three runtimes: all 20 non-internal tables and twelve repository Drizzle table objects match Better. |
| 2. Type fidelity | pass with caveat | Current types match, including synthetic blob/null through both Effect APIs; out-of-range integers need explicit policy. |
| 3. Transactions and coexistence | **fail** | Standard transactions pass; mixed same-process WAL writers admit conflicts and durably lose an acknowledged insert. |
| 4. Synchronous execution | pass with caveat | Effect/ManagedRuntime sync statements, transaction and 10k reuse pass; standard stream explicitly unsupported. |
| 5. Existing-handle custom client | pass with caveat | Small public-API prototype runs synchronously, flattens eager stream rows and leaves host handle open. Production policies still needed. |
| 6. RC migrations | pass with caveat | Upgraded folders preserve old hashes/rows and business schema; tracking metadata changes and new timestamps lose milliseconds. |
| 7. RC API and generation | **fail** for initial no-changes expectation | Two constructor adaptations; existing generation drift proposes dropping history, confirmed against old kit too. |
| 8. Performance | pass with caveat | Ranked raw-SQL candidate reads stay below 2x; synthetic 10k inserts exceed 2x. Ranking scope is documented above. |
| 9. Packaging | pass with caveat | Real electron-vite main bundle runs; Node22 emits SQLite ExperimentalWarning, Electron/Bun do not. |

Recommendation: **keep `better-sqlite3` behind a service**.
The facts that decide it are the observed mixed-driver loss of an acknowledged write after close/reopen,
the still-live Better handle consumers that require a safe transition, and the feasible synchronous
public-API adapter over that existing handle. The standard client's unsupported stream and Node22's
warning are additional caveats. RC migration/generation issues affect either driver choice and must
be handled separately; retaining Better does not remove those issues.

Transition shape: **a `SqlClient` adapter over the host's existing `better-sqlite3` handle**.
Do not open a second `node:sqlite` connection to that file in the same process while Better handles
remain. A future fully single-driver cutover can be reconsidered with full application proof after
all legacy handle users are removed. The phase owner owns the D30 decision and part 2 design.


## Consumer inventory

`rg 'better-sqlite3|@vidbee/db'` identifies these production boundaries:

- Desktop connection and migrations: `database.ts`, `database/migrate.ts`,
  `task-queue-migrate.ts`, `task-queue-host.ts` and `subscriptions-host.ts`.
- Other desktop raw-handle stores: `agent-chat-store.ts`, `agent-directory.ts`,
  `agent-skill-migration.ts`, `ai-prompt-store.ts` and `social-media-file.ts`.
- Shared consumers: `packages/task-queue/src/persist/sqlite.ts`,
  `packages/subscriptions-core/src/store.ts` and `packages/transcription/src/transcript-store.ts`.
- CLI: `apps/cli/src/transport/local-client.ts`.
- Packaging/build configuration retains native-module handling in desktop Vite/builder config,
  `build/before-build.cjs`, `build/before-pack.cjs`, `scripts/ensure-native-deps.mjs` and the CLI
  build script. These are consumers of the eventual driver decision, not changes in this part.

The video-library host also uses the shared connection for raw queries. It is included in the
performance investigation even though its imports do not match the narrow driver search.

## Validation

| Command | Exit | Evidence |
| --- | ---: | --- |
| `bun install` | 0 | Lock records refreshed; prepare patched tsrs and installed hooks. |
| `bun run --cwd packages/db check` | 0 | Source and durable test TypeScript configurations pass. |
| `bun run --cwd packages/db test` | 0 | 35 passed, zero failures/skips; snapshots unchanged. |
| `bun run check` | 0 | Desktop lint/locales/node+web checks, schema/logger checks and ratchet pass. |
| `bun run test` | 0 | Final rerun: 216 audit + 35 db + 42 schema + 7 logger + 2 checker/type tests pass. Schema/logger results use Turbo cache. |
| `bun run deps:check` | 0 | No issues found. |
| `bun run port:check` | 0 | Four ported configurations, zero violations; db remains unported. |
| `git diff --check` | 0 | No whitespace errors. |
| `git diff --exit-code -- packages/db/src` | 0 | Production package source unchanged. |

The root test gate was rerun after review strengthened every older-shape schema assertion.
The existing desktop `useExhaustiveDependencies` warning in `TranscriptCaptionsPane.tsx`
and Node module-type warning from `check-locales.js` remain. They did not fail the gate.
No diagnostics, formatting rules or allowlists were weakened.

Install initially returned EROFS with only TMPDIR/BUN_TMPDIR overridden. Pointing
`BUN_INSTALL_CACHE_DIR` into scratch fixed it. No privilege operation was needed.
Gate logs are retained in the the run's scratch directory as `gate-*.log`.

This part does not port a unit. No full application build, packaged golden run, installation,
owner-profile mutation, commit, push or PR was performed. The main-process bundle experiment is
focused packaging evidence and cannot substitute for the phase owner's full application gate.

## Implementation

### Progress

- [x] Installed Drizzle 1.0.0-rc.5 and Effect SQLite node 4.1.4; retained the 0.45 migrator as an explicitly named test-only alias.
- [x] Preserved every old migration fixture byte and all original pinning snapshots.
- [x] Converted the migration folder with `drizzle-kit up`; all three SQL files and their SHA-256 hashes are unchanged.
- [x] Updated every positional `drizzle` call, desktop migration discovery/configuration and millisecond reconciliation.
- [x] Added all twelve row models, raw SQL mappings, insert schemas and mutual structural type checks; runtime decoding tests pass.
- [x] Added errors, shared projection schemas, borrowed client, target client, migration and Drizzle services, and legacy entries/consumer imports.
- [x] Adapter runtime tests, separate-process persistence suites and old/new rollback matrix pass.
- [x] Added and self-tested `node-sqlite-before-cutover`; documented database access rules.
- [x] Repository tests, dependency gate, port checker, package formatting, Linux package build and CLI build pass.
- [x] Five consecutive golden runs pass on the final packaged artifact, with no golden edits.
- [x] Private migration-only checks and final forward/previous-build offline launches pass on supplied database copies.
- [x] Part 3: resolved all 119 strict diagnostics; package source/test checks and root `check` pass without exceptions.
- [x] Part 3: stored positive/negative infinity is rejected as sanitized `DbRowDecodeError` on both clients; finite fractional values decode to branded class instances.
- [x] Part 3: repeated Linux/CLI builds and private migration/forward/rollback proofs on the final source tree; final golden stability runs are recorded below.
- [x] Native-error test scope follows amended design section 9: preserve original direct assertions and run schema/value/additive coverage separately on both Effect clients; native error identity cannot be shared between drivers.

### What changed and compatibility

The twelve Drizzle tables retain their definitions. Each has a hand-written row class,
a `RowFromSql` key mapping, and an insert schema. Exported compile-time checks compare
the row class field structs in both directions with `$inferSelect`, and the insert
structs with `$inferInsert`; all 24 type comparisons pass. Row classes carry the
required unique-symbol brand, while their fields retain Drizzle structural parity.
Twelve runtime tests decode both immutable raw/property snapshots and omit nullable
insert columns. Every numeric column and shared numeric query field uses `S.Finite`
per amended design section 3.2; finite fractions remain supported. Physically stored
non-finite values now fail decoding, like physically nullable text primary keys.
`decodeRow` returns a sanitized `DbRowDecodeError` without embedding row content.

`BetterSqlite.driver.ts` borrows the host's handle, with a 200-entry statement cache,
a synchronous semaphore guard, explicit transaction begin statements, nested savepoints,
and unique borrowed savepoints. It resets raw row mode in `finally`. Disposal drops
cached statement references and does not close, checkpoint or reconfigure the handle.
The native library exposes no public statement-finalize method; native finalization is
therefore owned by its statement lifetime/GC. The tests prove the handle remains open
and host pragmas remain unchanged. Deferred COMMIT failure rolls back; a suspended
transaction holder makes a second acquisition fail with the named rule-2 defect.

The node layer sets WAL, foreign keys, a 5000 ms busy timeout and default number reads.
The Effect Drizzle service works over both tags. The adapter uses the same single
intersection type assertion as the installed node driver when marking the SqlClient
as the node tag: that tag types SQLite's unsupported `updateValues` member as `never`,
while the generic public constructor exposes its throwing compiler operation. No
`any`, double cast, suppression, override or relaxed diagnostic was introduced.

Migration services execute the original DDL statements sequentially. This is necessary
because the node client's unprepared execution prepares one statement; passing a
multi-statement DDL string creates only the first object. Transcript first-call omission
of `words_json` is preserved, followed by its addition on a later introspected call.
Legacy stale-column lists still fail with the original `SqliteError`. Legacy structural
type aliases remain mutable for unported consumers; schema class types are readonly.
Relative imports use `.js` specifiers so unported desktop TypeScript configurations can
consume these source entries.

| Legacy entry | Exports and users |
| --- | --- |
| `legacy/task-queue` | Original task DDL/tables/types; desktop task migration/host |
| `legacy/subscriptions` | Original applier, DDL/tables/mutable types; desktop subscription host and subscriptions-core store |
| `legacy/transcripts` | Original applier, DDL/tables/mutable types; desktop task host and transcription transcript store |
| `legacy/prompt-runs` | Original applier, DDL/tables/mutable types; desktop AI prompt store |
| `legacy` | `runtimeForHandle`, `releaseHandle`, recursive `rethrowDriverError`; foundation for later package facades, currently exercised by tests |

Callbacks retain their signatures, execution order and return values; additional
pipeable overloads preserve the existing direct calls. Callback appliers need no
runtime. `runtimeForHandle` creates one runtime per host handle and `releaseHandle`
disposes it synchronously before the future host closes its handle.

### Migration bytes and rollback

`drizzle-kit up` produced timestamp-named directories containing `migration.sql` and
`snapshot.json`. Only generated 1.0 JSON snapshots were formatted. All seven files in
`test/fixtures/drizzle-0.45` match the old committed folder byte-for-byte. Every original
pinning snapshot also matches the original commit byte-for-byte.

| SQL file | SHA-256, unchanged |
| --- | --- |
| `0000_swift_aaron_stack.sql` | `20c544c34667576d75c3c377d9f10aeaa281eba2892a91b32c7d6b32fbeb33d3` |
| `0001_smiling_agent_zero.sql` | `820a72164d76d265455f1a8642e27af0beaae03b2878df2726bfcc3f3105ca04` |
| `0002_smooth_impossible_man.sql` | `b52ea0e29bd5d00f68db555d33153432c66dbd286c0594e85d40b20094e941e8` |

The desktop reconciles original millisecond timestamps by migration hash after each
successful 1.0 migration. Eight rollback tests cover 0/1/2/3 prior migrations in
`new-old-new` and `old-new-old` order, using the real 0.45.4 test alias and the new
migrator. The alias makes rollback proof independent of an installed artifact.
Existing desktop resource packaging/discovery still finds the converted folder;
the fixture bootstrap and packaged golden launches demonstrate that path.
`drizzle-kit generate` was never run.

### Runtime tests and gate receipts

Final package runtime tests: **63 passed** in the normal pass (35 original pinning,
12 row-model, 8 adapter/service and 8 rollback cases); **20 driver-select cases skip
only in that pass**. The package script then runs those 20 in a fresh borrowed-client
process and 20 in a fresh node-client process: **20/20 + 20/20 pass**. The driver suites
cover four immutable DDL schema/idempotence baselines, all 512 subscription missing-
column combinations, all eight transcript and prompt additive states, and all twelve
raw/Effect Drizzle value round trips, plus non-finite rejection and finite-fraction
acceptance. Native error-class identity is tested separately.

| Command | Exit/result |
| --- | --- |
| `bun run check` | 0; legacy lint/i18n/typechecks and all ported checks pass |
| `bun run --cwd packages/db check` | 0; source tsrs, test tsrs and Biome pass |
| source `tsrs --emitDeclarationOnly` and test `tsrs` (package check) | 0; both included in the package check |
| `bun run --cwd packages/db build` | 0; strict source build passes |
| `bunx biome check packages/db` | 0; 34 files, no fixes required |
| `bun run --cwd packages/db test` | 0; 63 + 20 + 20 passed, selection skips explained above |
| `bun run test` | 0; repository audit, Turbo package tests and script self-tests pass |
| `bun run deps:check` | 0; no issues |
| `bun run port:check` | 0; 8 ported configs, 0 violations |
| `node --test scripts/port-check.test.mjs` | 0; both self-tests pass |
| `bun run build:linux` | 0; unpacked Linux app, AppImage and deb built |
| `bun run --cwd apps/cli build` | 0 |
| `bun run test:golden --scratch <part-3 scratch>/golden`, five consecutive runs | 0 each; 358/358 cases each, five result files, no golden changes (27.6, 23.8, 25.1, 24.0, 22.8 seconds) |
| supplied-copy migration-only script | 0; preservation results below |
| final forward and previous-build offline launches, 15 seconds each | 0 each; database initialization and isolated automation/MCP files present |

Part 3 evidence is in the private `3-fix` the run's scratch directory: `db-check.log`,
`db-test.log`, `db-build.log`, `check.log`, `test.log`, `deps.log`, `port.log`,
`build-linux.log`, `cli-build.log`, `golden-{1..5}.log` and each golden
`result.json`. `preservation-receipt.json` confirms all 358 golden files, 31
pinning snapshots and seven old migration fixture files equal their committed
bytes; the three converted SQL files also equal the immutable fixtures.

All build scripts remain JavaScript and unchanged. CLI build output is generated
proof only and is restored from the original commit after validation. Hosted CI,
installation and owner acceptance were not performed by this part.

### Part 3 strict-rule resolution and For OWNER-REVIEW

The phase owner amended the reviewed design in the strict rule set's favor. Part 3
implemented all three decisions without suppressions, overrides or casts:

1. All 106 `schemaNumber` findings are resolved by `S.Finite`, including insert and
   shared query schemas. Both separate driver suites store `1e999` and `-1e999` in
   an INTEGER-affinity task column, observe the infinities, and require raw/property
   decoders to return sanitized `DbRowDecodeError`. A stored `1.5` still decodes.
2. All twelve `schemaClassMissingBrand` findings are resolved by the required
   unique-symbol class brands. `S.Struct(Model.fields)` is compared to Drizzle's
   select type in both directions; insert structs retain the equivalent insert check.
   Existing package/test callers already decode rows or construct valid instances;
   no plain-row casts or assertions were needed.
3. The `missingPipeableSignature` finding is resolved by the single handle-only
   `layerFromHandle(handle)` API. Unused options and overload plumbing are removed;
   the underlying SQL constructor receives an empty span-attribute list.

Remaining observations for owner review (not blockers under amended design):

1. **Native error identity prevents literally identical 35-test suites.** On both
   Bun and Node, `node:sqlite` duplicate-column failures are `Error`, code
   `ERR_SQLITE_ERROR`, errcode 1, message `duplicate column name: n`. The original
   pinning requires better-sqlite3's `SqliteError`. A wrapper would fabricate driver
   identity; no such wrapper was added. The unchanged original suite is retained,
   while the separate driver suites cover non-error schema/value/additive behavior.
   Not all original host/journal-specific assertions run through all three clients.
2. The pre-existing snapshot drift (`generate` proposing `DROP TABLE download_history`
   and duplicate `auto_download`) remains recorded and unfixed. Table/DDL discrepancies
   and transcript first-call omission remain pinned, without behavior repairs.
3. SQLite `schema_version` necessarily increases for the two new tracking columns.
   The design's literal claim that every pragma remains identical cannot include this
   schema-change counter. Operational pragmas remain identical as measured below.

### Private-data preservation proof

Only supplied copies were opened. The migration-only script and its private evidence
remain in part 3 the run's scratch directory (`private-proof.ts`, `private-proof.log`), outside
the repository. It computes canonical SHA-256 content
checksums for each application table (keys sorted, row encodings sorted), compares
application schema and tracking hashes/timestamps, and checks integrity, foreign keys
and pragmas. It then runs the real 0.45 migrator on the same migrated copy.

Both comparisons returned the following sanitized output:

```text
agent_artifacts: identical
agent_events: identical
agent_messages: identical
agent_run_entries: identical
agent_runs: identical
agent_schema: identical
agent_threads: identical
attempts: identical
download_history: identical
process_journal: identical
schema_meta: identical
sqlite_sequence: identical
subscription_items: identical
subscriptions: identical
subscriptions_meta: identical
tasks: identical
transcript_prompt_runs: identical
transcript_segments: identical
transcript_speakers: identical
transcripts: identical
application schema: identical
migration hash / created_at pairs: identical
integrity_check: identical (ok)
foreign_key_check: identical (no rows)
tracking columns before: id,hash,created_at
tracking columns after: id,hash,created_at,name,applied_at
name: filled with the three timestamp directory names
applied_at: null on all three existing rows
journal_mode: wal -> wal
foreign_keys: 1 -> 1
busy_timeout: 5000 -> 5000
user_version: 0 -> 0
schema_version: 1 -> 3 (two tracking-table ALTERs)
```

A separate supplied copy was seeded into the final build's isolated offline profile;
the previous build then launched on a copy of that resulting profile. Both remained
alive until the harness deadline, initialized the database, and created isolated
MCP/automation configuration. The source copy's SHA-256 remains unchanged. Part 3
evidence is `owner-{forward,rollback}-launch.log`, corresponding isolated profiles
and sanitized receipt JSON. Private launch logs are not copied into this report.
This proves local migration preservation and launch/rollback, not network-dependent
workflows or acceptance on the owner's running application.
