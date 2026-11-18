import * as NodeClient from "@effect/sql-sqlite-node/SqliteClient";
import { expect, it, layer } from "@effect/vitest";
import Database from "better-sqlite3";
import * as A from "effect/Array";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Str from "effect/String";
import * as Client from "effect/sql/SqlClient";
import { layerFromHandle } from "../src/BetterSqlite.driver.js";
import { Drizzle, layer as drizzleLayer } from "../src/Drizzle.service.js";
import { downloadHistoryTable } from "../src/history.js";
import { releaseHandle, rethrowDriverError, runtimeForHandle } from "../src/legacy/index.js";
import * as Migrations from "../src/Migrations.layer.js";
import { DbSchema } from "../src/Migrations.service.js";

it("borrowed adapter is synchronous, caches one runtime, and never closes its handle", () => {
  const handle = new Database(":memory:");
  try {
    const runtime = runtimeForHandle(handle);
    expect(runtimeForHandle(handle)).toBe(runtime);
    const rows = runtime.runSync(
      Effect.gen(function* () {
        const sql = yield* Client.SqlClient;
        return yield* sql`SELECT 1 AS n`;
      })
    );
    expect(rows).toEqual([
      {
        n: 1,
      },
    ]);
    releaseHandle(handle);
    expect(handle.open).toBe(true);
    expect(runtimeForHandle(handle)).not.toBe(runtime);
    releaseHandle(handle);
  } finally {
    handle.close();
  }
});
it("statement cache resets values mode after success and failure, with raw run results", () => {
  const handle = new Database(":memory:");
  const runtime = runtimeForHandle(handle);
  try {
    runtime.runSync(
      Effect.gen(function* () {
        const sql = yield* Client.SqlClient;
        const query = sql.unsafe("SELECT ? AS n", [3]);
        const queried1 = yield* query;
        expect(queried1).toEqual([
          {
            n: 3,
          },
        ]);
        const queried2 = yield* query.values;
        expect(queried2).toEqual([[3]]);
        const queried3 = yield* query.raw;
        expect(queried3).toEqual([
          {
            n: 3,
          },
        ]);
        yield* Effect.flip(sql.unsafe("SELECT ? AS n", []).values);
        const queried4 = yield* query;
        expect(queried4).toEqual([
          {
            n: 3,
          },
        ]);
        yield* sql.unsafe("CREATE TABLE cache_probe (n INTEGER)");
        const queried5 = yield* sql.unsafe("INSERT INTO cache_probe VALUES (?)", [4]).raw;
        expect(queried5).toEqual({
          changes: 1,
          lastInsertRowid: 1,
        });
      })
    );
  } finally {
    releaseHandle(handle);
    handle.close();
  }
});
it("explicit begin modes, nested failure and borrowed host transactions preserve ownership", () => {
  const statements: string[] = [];
  const handle = new Database(":memory:", {
    verbose: (sql) => statements.push(String(sql)),
  });
  handle.exec("CREATE TABLE probe (n INTEGER)");
  const runtime = runtimeForHandle(handle);
  const write = Effect.gen(function* () {
    const sql = yield* Client.SqlClient;
    yield* sql`INSERT INTO probe VALUES (1)`;
    yield* sql
      .withTransaction(Effect.andThen(sql`INSERT INTO probe VALUES (2)`, Effect.fail("inner")))
      .pipe(Effect.flip);
    yield* sql`INSERT INTO probe VALUES (3)`;
  });
  const transaction = Effect.gen(function* () {
    const sql = yield* Client.SqlClient;
    yield* sql.withTransaction(write);
  });
  try {
    runtime.runSync(transaction.pipe(Effect.provideService(Client.BeginTransaction, "BEGIN")));
    expect(statements).toContain("BEGIN");
    expect(A.some(statements, (sql) => Str.startsWith("RELEASE SAVEPOINT effect_sql_")(sql))).toBe(true);
    handle.transaction(() => {
      runtime.runSync(transaction.pipe(Effect.provideService(Client.BeginTransaction, "BEGIN IMMEDIATE")));
      expect(handle.inTransaction).toBe(true);
      runtime.runSync(
        Effect.gen(function* () {
          const sql = yield* Client.SqlClient;
          yield* sql
            .withTransaction(Effect.andThen(sql`INSERT INTO probe VALUES (9)`, Effect.fail("borrowed")))
            .pipe(Effect.flip);
        })
      );
      expect(handle.inTransaction).toBe(true);
      handle.prepare("INSERT INTO probe VALUES (4)").run();
    })();
    expect(handle.prepare("SELECT n FROM probe").all()).toEqual([
      {
        n: 1,
      },
      {
        n: 3,
      },
      {
        n: 1,
      },
      {
        n: 3,
      },
      {
        n: 4,
      },
    ]);
    expect(A.some(statements, (sql) => Str.startsWith("ROLLBACK TO SAVEPOINT vidbee_borrowed_")(sql))).toBe(true);
  } finally {
    releaseHandle(handle);
    handle.close();
  }
});
it("driver errors retain their exact object through legacy rethrow", () => {
  const handle = new Database(":memory:");
  try {
    const runtime = runtimeForHandle(handle);
    const cause = runtime.runSync(
      Effect.gen(function* () {
        const sql = yield* Client.SqlClient;
        return yield* sql.unsafe("SELECT missing FROM absent").pipe(Effect.sandbox, Effect.flip);
      })
    );
    let original: unknown;
    for (const reason of cause.reasons) if (Cause.isFailReason(reason)) original = reason.error.reason.cause;
    expect(() => rethrowDriverError(cause)).toThrow("no such table: absent");
    try {
      rethrowDriverError(cause);
    } catch (error) {
      expect(error).toBe(original);
    }
  } finally {
    releaseHandle(handle);
    handle.close();
  }
});
for (const driver of ["borrowed", "node"] as const) {
  const borrowedLayer = Layer.unwrap(
    Effect.acquireRelease(
      Effect.sync(() => new Database(":memory:")),
      (handle) =>
        Effect.sync(() => {
          handle.close();
        })
    ).pipe(Effect.map((handle) => layerFromHandle(handle)))
  );
  const clientLayer = driver === "borrowed" ? borrowedLayer : NodeClient.layer({ filename: ":memory:" });
  layer(Layer.merge(Migrations.layer, drizzleLayer).pipe(Layer.provideMerge(clientLayer)), { buildPerTest: true })(
    (it) => {
      it.effect(`${driver}: Effect migrations and Drizzle use the same database and result shapes`, () =>
        Effect.gen(function* () {
          const migrations = yield* DbSchema;
          yield* migrations.applyTaskQueue;
          yield* migrations.applySubscriptions;
          yield* migrations.applyTranscripts;
          yield* migrations.applyTranscripts;
          yield* migrations.applyPromptRuns;
          const sql = yield* Client.SqlClient;
          const queried6 = yield* sql`SELECT value FROM schema_meta`;
          expect(queried6).toEqual([
            {
              value: "1",
            },
          ]);
          // Drizzle's .run uses executeRaw; the cached select alternates with .values.
          yield* sql.unsafe(
            "CREATE TABLE download_history (id TEXT PRIMARY KEY, url TEXT NOT NULL, title TEXT NOT NULL, thumbnail TEXT, type TEXT NOT NULL, status TEXT NOT NULL, download_path TEXT, saved_file_name TEXT, file_size INTEGER, duration INTEGER, downloaded_at INTEGER NOT NULL, completed_at INTEGER, sort_key INTEGER NOT NULL, error TEXT, yt_dlp_command TEXT, yt_dlp_log TEXT, description TEXT, channel TEXT, uploader TEXT, view_count INTEGER, tags TEXT, origin TEXT, subscription_id TEXT, selected_format TEXT, playlist_id TEXT, playlist_title TEXT, playlist_index INTEGER, playlist_size INTEGER)"
          );
          const db = yield* Drizzle;
          yield* db.insert(downloadHistoryTable).values({
            id: "synthetic",
            url: "https://example.invalid",
            title: "雪",
            type: "video",
            status: "done",
            downloadedAt: 1,
            sortKey: 1,
          });
          const rows = yield* db.select().from(downloadHistoryTable);
          expect(rows[0]?.id).toBe("synthetic");
        })
      );
    }
  );
}

it("borrowed layer preserves host pragmas and rolls back a failed deferred COMMIT", () => {
  const handle = new Database(":memory:");
  handle.pragma("foreign_keys = ON");
  handle.pragma("busy_timeout = 4321");
  handle.exec(
    "CREATE TABLE parent (id INTEGER PRIMARY KEY); CREATE TABLE child (parent INTEGER REFERENCES parent(id) DEFERRABLE INITIALLY DEFERRED)"
  );
  const before = [handle.pragma("journal_mode"), handle.pragma("foreign_keys"), handle.pragma("busy_timeout")];
  const runtime = runtimeForHandle(handle);
  try {
    const exit = runtime.runSync(
      Effect.gen(function* () {
        const sql = yield* Client.SqlClient;
        return yield* Effect.exit(sql.withTransaction(sql`INSERT INTO child VALUES (99)`));
      })
    );
    expect(exit._tag).toBe("Failure");
    expect(handle.inTransaction).toBe(false);
    expect(handle.prepare("SELECT * FROM child").all()).toEqual([]);
    expect([handle.pragma("journal_mode"), handle.pragma("foreign_keys"), handle.pragma("busy_timeout")]).toEqual(
      before
    );
  } finally {
    releaseHandle(handle);
    handle.close();
  }
});

it("contended acquisition is an explicit synchronous-work defect", () => {
  const handle = new Database(":memory:");
  const runtime = runtimeForHandle(handle);
  const holder = runtime.runFork(
    Effect.gen(function* () {
      const sql = yield* Client.SqlClient;
      return yield* sql.withTransaction(Effect.never);
    })
  );
  try {
    expect(() =>
      runtime.runSync(
        Effect.gen(function* () {
          const sql = yield* Client.SqlClient;
          yield* sql`SELECT 1`;
        })
      )
    ).toThrow("database access rule 2");
  } finally {
    runtime.runSync(Fiber.interrupt(holder));
    releaseHandle(handle);
    handle.close();
  }
});
