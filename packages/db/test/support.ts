import { createRequire } from "node:module";
import * as A from "effect/Array";
import { dual } from "effect/Function";
import * as O from "effect/Option";
import * as R from "effect/Record";
import * as Str from "effect/String";
import { parseRows, path, quoteString, readText } from "./legacy/io.js";

const { dirname, resolve } = path;

import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { transformSync } from "esbuild";
import * as history from "../src/history.js";
import * as prompts from "../src/legacy/prompt-runs.js";
import * as subscriptions from "../src/legacy/subscriptions.js";
import * as transcripts from "../src/legacy/transcripts.js";
import * as tasks from "../src/task-queue.js";

export { prompts, subscriptions, tasks, transcripts };
export const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const migrationsFolder = resolve(root, "packages/db/test/fixtures/drizzle-0.45");
export const tables = A.map(
  A.filter(
    R.values({
      history: history.downloadHistoryTable,
      tasks: tasks.tasksTable,
      attempts: tasks.attemptsTable,
      journal: tasks.processJournalTable,
      meta: tasks.schemaMetaTable,
      subs: subscriptions.subscriptionsTable,
      items: subscriptions.subscriptionItemsTable,
      smeta: subscriptions.subscriptionsMetaTable,
      transcripts: transcripts.transcriptsTable,
      segments: transcripts.transcriptSegmentsTable,
      speakers: transcripts.transcriptSpeakersTable,
      prompts: prompts.transcriptPromptRunsTable,
    }),
    (value) => typeof value === "object" && value !== null && !A.isArray(value)
  ),
  (value) => value as Parameters<typeof getTableConfig>[0]
);
export const open = () => {
  const raw = new Database(":memory:");
  raw.pragma("foreign_keys = ON");
  return {
    raw,
    db: drizzle({
      client: raw,
    }),
    exec: (sql: string) => {
      raw.exec(sql);
    },
    all: (sql: string) => raw.prepare(sql).all() as Record<string, unknown>[],
    get: (sql: string) => raw.prepare(sql).get() as Record<string, unknown> | undefined,
    close: () => {
      raw.close();
    },
  };
};
export type TestDatabase = ReturnType<typeof open>;
export const columns: { (db: TestDatabase, table: string): string[]; (table: string): (db: TestDatabase) => string[] } =
  dual(2, (db: TestDatabase, table: string) => A.map(db.all(`PRAGMA table_info("${table}")`), (c) => String(c.name)));
export const schema = (db: TestDatabase) =>
  A.map(
    db.all("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"),
    (row) => ({
      ...row,
      sql:
        typeof row.sql === "string"
          ? Str.trim(Str.replace(/ \)/g, ")")(Str.replace(/\( /g, "(")(Str.replace(/\s+/g, " ")(row.sql))))
          : row.sql,
      ...(row.type === "table"
        ? {
            columns: db.all(`PRAGMA table_info("${row.name}")`),
            foreignKeys: db.all(`PRAGMA foreign_key_list("${row.name}")`),
          }
        : {}),
      ...(row.type === "index"
        ? {
            columns: db.all(`PRAGMA index_info("${row.name}")`),
          }
        : {}),
    })
  );
export const snapshot = (name: string) => parseRows(readText(new URL(`./snapshots/${name}.json`, import.meta.url)));
export const drizzleSchema = () =>
  A.map(tables, (table) => {
    const c = getTableConfig(table);
    return {
      name: c.name,
      columns: A.map(c.columns, (x) => ({
        name: x.name,
        type: x.getSQLType(),
        notNull: x.notNull,
        primary: x.primary,
        autoIncrement: "autoIncrement" in x ? x.autoIncrement : false,
        default: x.default ?? null,
      })),
      primaryKeys: A.map(c.primaryKeys, (x) => ({
        name: x.getName(),
        columns: A.map(x.columns, (x) => x.name),
      })),
      indexes: A.map(c.indexes, (x) => ({
        name: x.config.name,
        unique: x.config.unique,
        columns: A.map(x.config.columns, (x) => ("name" in x ? x.name : "SQL")),
        where: x.config.where ?? null,
      })),
      foreignKeys: A.map(c.foreignKeys, (x) => {
        const r = x.reference();
        return {
          columns: A.map(r.columns, (x) => x.name),
          table: getTableConfig(r.foreignTable).name,
          foreignColumns: A.map(r.foreignColumns, (x) => x.name),
          onDelete: x.onDelete,
          onUpdate: x.onUpdate ?? null,
        };
      }),
    };
  }).sort((a, b) => Str.localeCompare(b.name)(a.name));

// Execute only the real desktop migration code, with its Electron boundary replaced.
// No database singleton, settings, application lifecycle, or user profile is imported.
const execute = (source: string, filename: string, bindings: Record<string, unknown>) => {
  const module = {
    exports: {},
  };
  const require = createRequire(resolve(root, "apps/desktop/package.json"));
  const output = transformSync(source, {
    loader: "ts",
    format: "cjs",
    target: "es2022",
  }).code;
  runInNewContext(
    output,
    {
      module,
      exports: module.exports,
      require: (id: string) =>
        id === "electron"
          ? {
              app: {
                getAppPath: () => resolve(root, "apps/desktop"),
              },
            }
          : require(id),
      process: {
        cwd: () => resolve(root, "apps/desktop"),
      },
      ...bindings,
    },
    {
      filename,
    }
  );
  return module.exports;
};
export const desktopMigrations = () => {
  const filename = resolve(root, "apps/desktop/src/main/lib/database/migrate.ts");
  const source = Str.replace("import.meta.dirname", quoteString(dirname(filename)))(readText(filename));
  return execute(source, filename, {}) as {
    runMigrations: (db: TestDatabase["db"]) => void;
    reconcileLegacyMigrationState: (db: TestDatabase["raw"]) => void;
  };
};
export const desktopSubscriptions = (db: TestDatabase) => {
  const filename = resolve(root, "apps/desktop/src/main/lib/subscriptions-host.ts");
  const source = readText(filename);
  const start = O.getOrElse(Str.indexOf("const ensureSubscriptionsSchema =")(source), () => -1);
  const end = O.getOrElse(Str.indexOf("const ensureDirectoryExists =")(source), () => -1);
  if (start < 0 || end < 0) throw new Error("Desktop subscription migration function not found");
  const declaration = Str.slice(start, end)(source);
  const result = execute(`export ${declaration}`, filename, {
    getDatabaseConnection: () => ({
      sqlite: db.raw,
    }),
    logger: {
      info: () => {},
    },
    applySubscriptionsMigrations: subscriptions.applySubscriptionsMigrations,
  }) as {
    ensureSubscriptionsSchema: () => void;
  };
  result.ensureSubscriptionsSchema();
};
export const applyCurrent = (db: TestDatabase) => {
  desktopMigrations().runMigrations(db.db);
  db.exec(tasks.TASK_QUEUE_DDL_V1);
  desktopSubscriptions(db);
  transcripts.applyTranscriptMigrations(db.exec, columns(db, "transcripts"));
  transcripts.applyTranscriptMigrations(db.exec, columns(db, "transcripts"), columns(db, "transcript_segments"));
  prompts.applyPromptRunMigrations(db.exec, columns(db, "transcript_prompt_runs"));
};
