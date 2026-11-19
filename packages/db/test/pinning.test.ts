import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { it as test } from "@effect/vitest";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { drizzle as rollbackDrizzle } from "drizzle-orm-rollback-fixture/better-sqlite3";
import { migrate } from "drizzle-orm-rollback-fixture/better-sqlite3/migrator";
import * as A from "effect/Array";
import * as O from "effect/Option";
import * as R from "effect/Record";
import * as Str from "effect/String";
import { fileHash, readJournal, readText, record } from "./legacy/io.js";
import {
  applyCurrent,
  columns,
  desktopMigrations,
  desktopSubscriptions,
  drizzleSchema,
  migrationsFolder,
  open,
  prompts,
  schema,
  snapshot,
  subscriptions,
  tables,
  tasks,
  transcripts,
} from "./support.js";

const migrationRows = (db: ReturnType<typeof open>) =>
  db.all("SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at");
const trackingVariant = (rows: readonly Record<string, unknown>[]) =>
  A.map(rows, (row) =>
    row.name !== "__drizzle_migrations"
      ? row
      : {
          ...row,
          sql: Str.replace(/\)$/, ', "name" text, "applied_at" TEXT)')(String(row.sql)),
          columns: [
            ...(row.columns as Record<string, unknown>[]),
            {
              cid: 3,
              name: "name",
              type: "TEXT",
              notnull: 0,
              dflt_value: null,
              pk: 0,
            },
            {
              cid: 4,
              name: "applied_at",
              type: "TEXT",
              notnull: 0,
              dflt_value: null,
              pk: 0,
            },
          ],
        }
  );
const pin = (actual: unknown, name: string) => assert.deepEqual(actual, snapshot(name));
const pinDesktop = (actual: unknown, name: string) => assert.deepEqual(actual, trackingVariant(snapshot(name)));

// Additive upgrades can append columns in different orders. Compare each result
// to an immutable schema baseline while retaining types/defaults/nullability/PKs,
// foreign keys, and exact index SQL (including predicates and uniqueness).
const pinUpgradedSchema = (db: ReturnType<typeof open>, baseline: string, tableNames: readonly string[]) => {
  const normalize = (rows: readonly Record<string, unknown>[]) =>
    A.map(rows, (row) => {
      const { sql, columns: rawColumns, ...rest } = row;
      assert.ok(A.isArray(rawColumns));
      const normalizedColumns = A.map(rawColumns, (value) => {
        const column = record(value);
        const { cid, ...fields } = column;
        return fields;
      });
      if (row.type === "table") normalizedColumns.sort((a, b) => Str.localeCompare(String(b.name))(String(a.name)));
      return {
        ...rest,
        ...(row.type === "index"
          ? {
              sql,
            }
          : {}),
        columns: normalizedColumns,
      };
    });
  const expected: readonly Record<string, unknown>[] = snapshot(baseline);
  assert.deepEqual(
    normalize(schema(db)),
    normalize(A.filter(expected, (row) => tableNames.includes(String(row.tbl_name))))
  );
};
test("every exported Drizzle table configuration is pinned, including indexes and foreign keys", () => {
  assert.equal(tables.length, 12);
  pin(drizzleSchema(), "drizzle-tables");
});
const ddlCases = [
  ["task-queue-v1", tasks.TASK_QUEUE_DDL_V1],
  ["subscriptions-v1", subscriptions.SUBSCRIPTIONS_DDL_V1],
  ["transcripts-v1", transcripts.TRANSCRIPT_DDL_V1],
  ["prompt-runs-v1", prompts.PROMPT_RUN_DDL_V1],
] as const;
for (const [name, ddl] of ddlCases)
  test(`${name}: empty schema and second application are pinned`, (t) => {
    const db = open();
    t.onTestFinished(db.close);
    db.exec(ddl);
    const first = schema(db);
    pin(first, name);
    const data = db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    db.exec(ddl);
    assert.deepEqual(schema(db), first);
    assert.deepEqual(db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"), data);
    if (name === "task-queue-v1")
      assert.deepEqual(db.get("SELECT * FROM schema_meta"), {
        key: "task_queue_version",
        value: "1",
      });
    if (name === "subscriptions-v1")
      assert.deepEqual(db.get("SELECT * FROM subscriptions_meta"), {
        key: "subscriptions_version",
        value: "1",
        updated_at: 0,
      });
  });
const alterations = [
  [
    "subscriptions-v2",
    subscriptions.SUBSCRIPTIONS_DDL_V1,
    subscriptions.SUBSCRIPTIONS_DDL_V2,
    "subscriptions",
    "auto_download",
    1,
  ],
  ["transcripts-v2", transcripts.TRANSCRIPT_DDL_V1, transcripts.TRANSCRIPT_DDL_V2, "transcripts", "asr_tier", null],
  [
    "transcripts-v3",
    transcripts.TRANSCRIPT_DDL_V1,
    transcripts.TRANSCRIPT_DDL_V3,
    "transcript_segments",
    "words_json",
    null,
  ],
  ["transcripts-v4", transcripts.TRANSCRIPT_DDL_V1, transcripts.TRANSCRIPT_DDL_V4, "transcripts", "source_kind", null],
  ["prompt-runs-v2", prompts.PROMPT_RUN_DDL_V1, prompts.PROMPT_RUN_DDL_V2, "transcript_prompt_runs", "thinking", ""],
  ["prompt-runs-v3", prompts.PROMPT_RUN_DDL_V1, prompts.PROMPT_RUN_DDL_V3, "transcript_prompt_runs", "thinking_ms", 0],
  [
    "prompt-runs-v4",
    prompts.PROMPT_RUN_DDL_V1,
    prompts.PROMPT_RUN_DDL_V4,
    "transcript_prompt_runs",
    "cloud_result_id",
    null,
  ],
] as const;
for (const [name, base, ddl, table, column, value] of alterations)
  test(`${name}: additive DDL schema, row default, and duplicate-column failure`, (t) => {
    const db = open();
    t.onTestFinished(db.close);
    db.exec(base);
    seedRaw(db, table);
    const before = db.get(`SELECT * FROM ${table}`);
    db.exec(ddl);
    assert.deepEqual(db.get(`SELECT * FROM ${table}`), {
      ...before,
      [column]: value,
    });
    pin(schema(db), name);
    assert.throws(() => db.exec(ddl), {
      name: "SqliteError",
      message: `duplicate column name: ${column}`,
    });
  });

// Seed synthetic values using SQLite's actual required columns, not private fixture data.
function seedRaw(db: ReturnType<typeof open>, table: string) {
  if (table === "transcript_segments") seedRaw(db, "transcripts");
  const info = db.all(`PRAGMA table_info(${table})`);
  const names = A.map(info, (c) => String(c.name));
  const values = A.map(info, (c) =>
    c.name === "transcript_id"
      ? "synthetic-id"
      : c.type === "INTEGER"
        ? 1700000000123
        : c.notnull === 1 || Number(c.pk) > 0
          ? "synthetic-id"
          : null
  );
  db.raw
    .prepare(
      `INSERT INTO ${table} (${A.join(names, ",")}) VALUES (${A.join(
        A.map(names, () => "?"),
        ","
      )})`
    )
    .run(...values);
}
// Every combination of missing columns on a fresh database: seconds on a loaded CI runner, so
// the default five-second budget is replaced by an explicit one.
test("subscription applier upgrades every supported missing column and preserves populated rows", {
  timeout: 60_000,
}, (t) => {
  const added = [
    "auto_download",
    "download_type",
    "download_quality",
    "download_container",
    ...A.map(subscriptions.SUBSCRIPTIONS_V3_COLUMNS, ([name]) => name),
  ];
  for (let mask = 0; mask < 2 ** added.length; mask++) {
    const missing = A.filter(added, (_, bit) => (mask & (1 << bit)) !== 0);
    const db = open();
    t.onTestFinished(db.close);
    subscriptions.applySubscriptionsMigrations(db.exec, []);
    for (const column of missing) db.exec(`ALTER TABLE subscriptions DROP COLUMN ${column}`);
    seedRaw(db, "subscriptions");
    const before = db.get("SELECT * FROM subscriptions");
    subscriptions.applySubscriptionsMigrations(db.exec, columns(db, "subscriptions"));
    const row = db.get("SELECT * FROM subscriptions");
    for (const [key, value] of R.toEntries(before ?? {})) assert.equal(row?.[key], value);
    const defaults: Record<string, unknown> = {
      auto_download: 1,
      source_kind: "feed",
      categories: "[]",
    };
    for (const name of missing) assert.equal(row?.[name], defaults[name] ?? null);
    // SQLite appends added columns; normalize by name when comparing different older shapes.
    const actualColumns = A.map(db.all("PRAGMA table_info(subscriptions)"), ({ cid, ...c }) => c).sort((a, b) =>
      Str.localeCompare(String(b.name))(String(a.name))
    );
    assert.deepEqual(actualColumns, snapshot("subscriptions-current-columns"));
    pinUpgradedSchema(db, "fresh-appliers", ["subscriptions", "subscription_items", "subscriptions_meta"]);
    const upgraded = schema(db);
    subscriptions.applySubscriptionsMigrations(db.exec, columns(db, "subscriptions"));
    assert.deepEqual(schema(db), upgraded);
    assert.deepEqual(db.get("SELECT * FROM subscriptions"), row);
  }
});
test("subscription version marker preserves timestamps and coexists with task queue metadata", (t) => {
  const db = open();
  t.onTestFinished(db.close);
  db.exec(tasks.TASK_QUEUE_DDL_V1);
  subscriptions.applySubscriptionsMigrations(db.exec, []);
  db.exec("UPDATE subscriptions_meta SET value='old', updated_at=123");
  subscriptions.applySubscriptionsMigrations(db.exec, columns(db, "subscriptions"));
  assert.deepEqual(db.get("SELECT * FROM subscriptions_meta"), {
    key: "subscriptions_version",
    value: "1",
    updated_at: 123,
  });
  assert.deepEqual(db.all("SELECT * FROM schema_meta"), [
    {
      key: "task_queue_version",
      value: "1",
    },
  ]);
});
test("prompt applier upgrades all eight older combinations and preserves existing values", (t) => {
  const ddls = [prompts.PROMPT_RUN_DDL_V2, prompts.PROMPT_RUN_DDL_V3, prompts.PROMPT_RUN_DDL_V4];
  for (let mask = 0; mask < 8; mask++) {
    const db = open();
    t.onTestFinished(db.close);
    db.exec(prompts.PROMPT_RUN_DDL_V1);
    A.forEach(ddls, (ddl, bit) => {
      if ((mask & (1 << bit)) !== 0) db.exec(ddl);
    });
    seedRaw(db, "transcript_prompt_runs");
    const before = db.get("SELECT * FROM transcript_prompt_runs");
    prompts.applyPromptRunMigrations(db.exec, columns(db, "transcript_prompt_runs"));
    const row = db.get("SELECT * FROM transcript_prompt_runs");
    assert.deepEqual(row, {
      thinking: "",
      thinking_ms: 0,
      cloud_result_id: null,
      ...before,
    });
    pinUpgradedSchema(db, "current-schema", ["transcript_prompt_runs"]);
    const first = schema(db);
    prompts.applyPromptRunMigrations(db.exec, columns(db, "transcript_prompt_runs"));
    assert.deepEqual(schema(db), first);
    assert.deepEqual(db.get("SELECT * FROM transcript_prompt_runs"), row);
    assert.deepEqual(
      columns(db, "transcript_prompt_runs").sort(),
      A.map(
        O.getOrThrow(A.findFirst(drizzleSchema(), (x) => x.name === "transcript_prompt_runs")).columns,
        (c) => c.name
      ).sort()
    );
  }
});
test("transcript applier upgrades all eight older combinations with segment introspection", (t) => {
  const ddls = [transcripts.TRANSCRIPT_DDL_V2, transcripts.TRANSCRIPT_DDL_V3, transcripts.TRANSCRIPT_DDL_V4];
  for (let mask = 0; mask < 8; mask++) {
    const db = open();
    t.onTestFinished(db.close);
    db.exec(transcripts.TRANSCRIPT_DDL_V1);
    A.forEach(ddls, (ddl, bit) => {
      if ((mask & (1 << bit)) !== 0) db.exec(ddl);
    });
    seedRaw(db, "transcript_segments");
    const before = db.get("SELECT * FROM transcripts");
    const segment = db.get("SELECT * FROM transcript_segments");
    transcripts.applyTranscriptMigrations(db.exec, columns(db, "transcripts"), columns(db, "transcript_segments"));
    assert.deepEqual(db.get("SELECT * FROM transcripts"), {
      asr_tier: null,
      source_kind: null,
      ...before,
    });
    assert.deepEqual(db.get("SELECT * FROM transcript_segments"), {
      words_json: null,
      ...segment,
    });
    pinUpgradedSchema(db, "current-schema", ["transcripts", "transcript_speakers", "transcript_segments"]);
    const first = schema(db);
    transcripts.applyTranscriptMigrations(db.exec, columns(db, "transcripts"), columns(db, "transcript_segments"));
    assert.deepEqual(schema(db), first);
  }
});
test("fresh appliers are idempotent with refreshed columns; transcript first-call omission is pinned", (t) => {
  const db = open();
  t.onTestFinished(db.close);
  subscriptions.applySubscriptionsMigrations(db.exec, []);
  prompts.applyPromptRunMigrations(db.exec, []);
  transcripts.applyTranscriptMigrations(db.exec, []);
  pin(schema(db), "fresh-appliers");
  assert.equal(columns(db, "transcript_segments").includes("words_json"), false);
  const first = schema(db);
  subscriptions.applySubscriptionsMigrations(db.exec, columns(db, "subscriptions"));
  prompts.applyPromptRunMigrations(db.exec, columns(db, "transcript_prompt_runs"));
  transcripts.applyTranscriptMigrations(db.exec, columns(db, "transcripts"));
  assert.deepEqual(schema(db), first);
  transcripts.applyTranscriptMigrations(db.exec, columns(db, "transcripts"), columns(db, "transcript_segments"));
  assert.equal(columns(db, "transcript_segments").includes("words_json"), true);
});
test("stale introspection arrays retain duplicate-column errors rather than silently changing API", (t) => {
  const db = open();
  t.onTestFinished(db.close);
  subscriptions.applySubscriptionsMigrations(db.exec, []);
  prompts.applyPromptRunMigrations(db.exec, []);
  transcripts.applyTranscriptMigrations(db.exec, []);
  for (const apply of [
    () => subscriptions.applySubscriptionsMigrations(db.exec, []),
    () => prompts.applyPromptRunMigrations(db.exec, []),
    () => transcripts.applyTranscriptMigrations(db.exec, []),
  ]) {
    assert.throws(apply, {
      name: "SqliteError",
    });
  }
});
test("journal hashes, timestamps, schema and desktop migrator parity are pinned", (t) => {
  const db = open();
  t.onTestFinished(db.close);
  migrate(rollbackDrizzle(db.raw), {
    migrationsFolder,
  });
  pin(schema(db), "journal-schema");
  pin(migrationRows(db), "migration-rows");
  const desktop = open();
  t.onTestFinished(desktop.close);
  desktopMigrations().runMigrations(desktop.db);
  assert.deepEqual(schema(desktop), trackingVariant(schema(db)));
  assert.deepEqual(migrationRows(desktop), migrationRows(db));
  const before = schema(desktop);
  desktopMigrations().runMigrations(desktop.db);
  assert.deepEqual(schema(desktop), before);
  pin(migrationRows(desktop), "migration-rows");
  const journal = readJournal();
  assert.deepEqual(
    A.map(journal.entries, (entry: { tag: string; when: number }) => ({
      hash: fileHash(`${migrationsFolder}/${entry.tag}.sql`),
      created_at: entry.when,
    })),
    snapshot("migration-rows")
  );
});
test("desktop reconciles every older journal state without losing legacy history rows", (t) => {
  const journal = readJournal();
  for (let count = 0; count <= journal.entries.length; count++) {
    const db = open();
    t.onTestFinished(db.close);
    for (const entry of journal.entries.slice(0, count))
      db.exec(A.join(Str.split(readText(`${migrationsFolder}/${entry.tag}.sql`), "--> statement-breakpoint"), "\n"));
    if (count > 0) seedRaw(db, "download_history");
    const before = count > 0 ? db.get("SELECT * FROM download_history") : undefined;
    desktopMigrations().runMigrations(db.db);
    pinDesktop(schema(db), "journal-schema");
    pin(migrationRows(db), "migration-rows");
    if (before !== undefined)
      assert.deepEqual(db.get("SELECT * FROM download_history"), {
        yt_dlp_command: null,
        yt_dlp_log: null,
        ...before,
      });
    desktopMigrations().reconcileLegacyMigrationState(db.raw);
    pin(migrationRows(db), "migration-rows");
  }
});
test("desktop subscription migration renames download_id to task_id once and retains rows/indexes", (t) => {
  const db = open();
  t.onTestFinished(db.close);
  desktopMigrations().runMigrations(db.db);
  seedRaw(db, "subscription_items");
  db.exec("UPDATE subscription_items SET download_id='synthetic-task'");
  const before = db.get("SELECT * FROM subscription_items");
  desktopSubscriptions(db);
  assert.ok(before);
  const { download_id, ...rest } = before;
  assert.deepEqual(db.get("SELECT * FROM subscription_items"), {
    ...rest,
    task_id: download_id,
  });
  assert.equal(columns(db, "subscription_items").includes("download_id"), false);
  pinDesktop(schema(db), "desktop-subscriptions");
  const first = schema(db);
  desktopSubscriptions(db);
  assert.deepEqual(schema(db), first);
});
test("desktop current schema and column-for-column Drizzle drift are pinned explicitly", (t) => {
  const db = open();
  t.onTestFinished(db.close);
  applyCurrent(db);
  pinDesktop(schema(db), "current-schema");
  const differences: unknown[] = [];
  for (const table of drizzleSchema()) {
    const actual = db.all(`PRAGMA table_info(${table.name})`);
    assert.deepEqual(
      A.map(actual, (c) => c.name).sort(),
      A.map(table.columns, (c) => c.name).sort(),
      `${table.name}: columns`
    );
    for (const expected of table.columns) {
      const column = O.getOrUndefined(A.findFirst(actual, (c) => c.name === expected.name));
      assert.ok(column);
      assert.equal(Str.toLowerCase(String(column.type)), expected.type, `${table.name}.${expected.name}: type`);
      if (
        Boolean(column.notnull) !== expected.notNull ||
        (column.dflt_value ?? null) !==
          (typeof expected.default === "string"
            ? `'${expected.default}'`
            : expected.default === null
              ? null
              : String(expected.default))
      ) {
        differences.push({
          table: table.name,
          column: expected.name,
          drizzle: {
            notNull: expected.notNull,
            default: expected.default,
          },
          sqlite: {
            notNull: Boolean(column.notnull),
            default: column.dflt_value,
          },
        });
      }
    }
  }
  pin(differences, "known-column-drift");
});
test("primary keys match and existing foreign-key/index differences remain explicit", (t) => {
  const db = open();
  t.onTestFinished(db.close);
  applyCurrent(db);
  const differences: unknown[] = [];
  for (const table of drizzleSchema()) {
    const actualPrimary = A.map(
      A.filter(db.all(`PRAGMA table_info(${table.name})`), (c) => Number(c.pk) > 0).sort(
        (a, b) => Number(a.pk) - Number(b.pk)
      ),
      (c) => c.name
    );
    const expectedPrimary = [
      ...A.map(
        A.filter(table.columns, (c) => c.primary),
        (c) => c.name
      ),
      ...A.flatMap(table.primaryKeys, (pk) => pk.columns),
    ];
    assert.deepEqual(actualPrimary, expectedPrimary, `${table.name}: primary key`);
    const actualForeign = A.map(db.all(`PRAGMA foreign_key_list(${table.name})`), (fk) => ({
      columns: [fk.from],
      table: fk.table,
      foreignColumns: [fk.to],
      onDelete: Str.toLowerCase(String(fk.on_delete)),
      onUpdate: Str.toLowerCase(String(fk.on_update)),
    }));
    const expectedForeign = A.map(table.foreignKeys, (fk) => ({
      ...fk,
      onDelete: fk.onDelete ?? "no action",
      onUpdate: fk.onUpdate ?? "no action",
    }));
    if (!isDeepStrictEqual(actualForeign, expectedForeign))
      differences.push({
        table: table.name,
        foreignKeys: {
          drizzle: expectedForeign,
          sqlite: actualForeign,
        },
      });
    const actualIndexes = A.map(
      A.filter(db.all(`PRAGMA index_list(${table.name})`), (idx) => !Str.startsWith("sqlite_")(String(idx.name))),
      (idx) => ({
        name: idx.name,
        unique: Boolean(idx.unique),
        columns: A.map(db.all(`PRAGMA index_info("${idx.name}")`), (c) => c.name),
        partial: Boolean(idx.partial),
      })
    ).sort((a, b) => Str.localeCompare(String(b.name))(String(a.name)));
    const expectedIndexes = A.map(table.indexes, (idx) => ({
      name: idx.name,
      unique: idx.unique,
      columns: idx.columns,
      partial: idx.where !== null,
    })).sort((a, b) => Str.localeCompare(b.name)(a.name));
    for (const idx of actualIndexes) {
      const expected = O.getOrUndefined(A.findFirst(expectedIndexes, (candidate) => candidate.name === idx.name));
      if (expected === undefined)
        differences.push({
          table: table.name,
          extraIndex: idx,
        });
      else if (!isDeepStrictEqual(idx, expected))
        differences.push({
          table: table.name,
          index: idx.name,
          drizzle: expected,
          sqlite: idx,
        });
    }
    for (const idx of expectedIndexes)
      assert.ok(
        A.some(actualIndexes, (candidate) => candidate.name === idx.name),
        `${table.name}: missing index ${idx.name}`
      );
  }
  assert.deepEqual(differences, [
    {
      table: "process_journal",
      index: "idx_journal_open",
      drizzle: {
        name: "idx_journal_open",
        unique: false,
        columns: ["op"],
        partial: false,
      },
      sqlite: {
        name: "idx_journal_open",
        unique: false,
        columns: ["op"],
        partial: true,
      },
    },
    {
      table: "subscription_items",
      extraIndex: {
        name: "subscription_items_subscription_idx",
        unique: false,
        columns: ["subscription_id"],
        partial: false,
      },
    },
    {
      table: "tasks",
      foreignKeys: {
        drizzle: [],
        sqlite: [
          {
            columns: ["parent_id"],
            table: "tasks",
            foreignColumns: ["id"],
            onDelete: "no action",
            onUpdate: "no action",
          },
        ],
      },
    },
    {
      table: "tasks",
      index: "idx_tasks_next_retry",
      drizzle: {
        name: "idx_tasks_next_retry",
        unique: false,
        columns: ["next_retry_at"],
        partial: false,
      },
      sqlite: {
        name: "idx_tasks_next_retry",
        unique: false,
        columns: ["next_retry_at"],
        partial: true,
      },
    },
  ]);
});
for (const table of tables)
  test(`${getTableConfig(table).name}: Drizzle/raw round trips preserve values and JS types`, (t) => {
    const db = open();
    t.onTestFinished(db.close);
    applyCurrent(db);
    // Parent rows satisfy the three declared SQLite foreign keys.
    seedRaw(db, "tasks");
    seedRaw(db, "transcripts");
    const config = getTableConfig(table);
    const properties = getTableColumns(table);
    const expectedRows: Record<string, unknown>[] = [];
    const results: unknown[] = [];
    for (const optionalNull of [false, true]) {
      const row: Record<string, unknown> = {};
      const raw: Record<string, unknown> = {};
      for (const [property, column] of R.toEntries(properties)) {
        const primary = column.primary || A.some(config.primaryKeys, (pk) => pk.columns.includes(column));
        const isForeign =
          A.some(config.foreignKeys, (fk) => fk.reference().columns.includes(column)) ||
          (config.name === "tasks" && column.name === "parent_id");
        const value =
          optionalNull && !column.notNull && !primary
            ? null
            : isForeign
              ? "synthetic-id"
              : column.getSQLType() === "integer"
                ? optionalNull
                  ? 1700000000124
                  : 1700000000123
                : column.getSQLType() === "real"
                  ? 0.875
                  : Str.endsWith("_json")(column.name) || ["keywords", "tags", "categories"].includes(column.name)
                    ? '["synthetic",{"n":1}]'
                    : `${config.name}:${column.name}:${optionalNull ? "nulls" : "values"}:雪`;
        row[property] = value;
        raw[column.name] = value;
      }
      db.db.insert(table).values(row).run();
      expectedRows.push(row);
      const read = A.filter(db.db.select().from(table).all(), (candidate) =>
        A.some(expectedRows, (expected) => A.every(R.toEntries(expected), ([key, value]) => candidate[key] === value))
      );
      assert.deepEqual(read, expectedRows);
      const actualRaw = O.getOrUndefined(
        A.findFirst(db.all(`SELECT * FROM ${config.name}`), (candidate) =>
          A.every(R.toEntries(raw), ([key, value]) => candidate[key] === value)
        )
      );
      assert.deepEqual(actualRaw, raw);
      const actualDrizzle = read[read.length - 1];
      assert.ok(actualDrizzle);
      results.push({
        drizzle: actualDrizzle,
        raw: actualRaw,
        types: R.fromEntries(
          A.map(R.toEntries(actualDrizzle), ([key, value]) => [key, value === null ? "null" : typeof value])
        ),
      });
    }
    pin(results, `roundtrip-${config.name}`);
  });
