import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it, layer } from "@effect/vitest";
import Database from "better-sqlite3";
import { sql as sqlText } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { sql as oldSql } from "drizzle-orm-rollback-fixture";
import { drizzle as oldDrizzle } from "drizzle-orm-rollback-fixture/better-sqlite3";
import { integer as oldInteger, sqliteTable as oldTable } from "drizzle-orm-rollback-fixture/sqlite-core";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Client from "effect/sql/SqlClient";
import * as SqlError from "effect/sql/SqlError";
import { releaseHandle, rethrowDriverError, rethrowQueryError, runtimeForHandle } from "../src/legacy/index.js";
import { applyPromptRunMigrations } from "../src/legacy/prompt-runs.js";
import { applySubscriptionsMigrations } from "../src/legacy/subscriptions.js";

it("M15: equal-looking memory handles keep independent runtime identity and disposal", () => {
  const a = new Database(":memory:");
  const b = new Database(":memory:");
  const ra = runtimeForHandle(a);
  const rb = runtimeForHandle(b);
  try {
    expect(ra).not.toBe(rb);
    a.exec("CREATE TABLE only_a (n); INSERT INTO only_a VALUES (1)");
    b.exec("CREATE TABLE only_b (n); INSERT INTO only_b VALUES (2)");
    const sqlA = ra.runSync(Client.SqlClient);
    const sqlB = rb.runSync(Client.SqlClient);
    expect(ra.runSync(sqlA`SELECT * FROM only_a`)).toEqual([{ n: 1 }]);
    expect(rb.runSync(sqlB`SELECT * FROM only_b`)).toEqual([{ n: 2 }]);
    releaseHandle(b);
    expect(ra.runSync(sqlA`SELECT * FROM only_a`)).toEqual([{ n: 1 }]);
  } finally {
    releaseHandle(a);
    releaseHandle(b);
    a.close();
    b.close();
  }
});
it("M14: host auto-rollback clears borrowed savepoint state before the next transaction", () => {
  const handle = new Database(":memory:");
  handle.exec("CREATE TABLE probe (n INTEGER UNIQUE); INSERT INTO probe VALUES (1)");
  const runtime = runtimeForHandle(handle);
  const sql = runtime.runSync(Client.SqlClient);
  try {
    expect(() =>
      handle.transaction(() => runtime.runSync(sql.withTransaction(sql`INSERT OR ROLLBACK INTO probe VALUES (1)`)))()
    ).toThrow();
    expect(handle.inTransaction).toBe(false);
    runtime.runSync(sql.withTransaction(sql`INSERT INTO probe VALUES (2)`));
    expect(handle.inTransaction).toBe(false);
    expect(handle.prepare("SELECT * FROM probe ORDER BY n").all()).toEqual([{ n: 1 }, { n: 2 }]);
  } finally {
    releaseHandle(handle);
    handle.close();
  }
});
it("M17: values classifies the original driver error once and resets cached raw mode", () => {
  const handle = new Database(":memory:");
  handle.exec("CREATE TABLE probe (n INTEGER UNIQUE); INSERT INTO probe VALUES (1)");
  const runtime = runtimeForHandle(handle);
  const sql = runtime.runSync(Client.SqlClient);
  try {
    for (const statement of [
      sql`INSERT INTO probe VALUES (1) RETURNING n`.pipe(Effect.asVoid),
      sql`INSERT INTO probe VALUES (1) RETURNING n`.values.pipe(Effect.asVoid),
    ]) {
      const cause = runtime.runSync(statement.pipe(Effect.sandbox, Effect.flip));
      for (const reason of cause.reasons) {
        if (Cause.isFailReason(reason)) {
          expect(reason.error.reason._tag).toBe("UniqueViolation");
          expect(reason.error.reason.cause).toBeInstanceOf(Database.SqliteError);
        }
      }
    }
    expect(runtime.runSync(sql`SELECT n FROM probe`)).toEqual([{ n: 1 }]);
  } finally {
    releaseHandle(handle);
    handle.close();
  }
});

it("M16: upgraded Drizzle failures expose the pre-upgrade class, code, message and original object", () => {
  const handle = new Database(":memory:");
  handle.exec("CREATE TABLE probe (n INTEGER UNIQUE); INSERT INTO probe VALUES (1)");
  try {
    const before = oldDrizzle(handle);
    const after = drizzle({ client: handle });
    const oldProbe = oldTable("probe", { n: oldInteger("n") });
    const newProbe = sqliteTable("probe", { n: integer("n") });
    const oldAbsent = oldTable("absent", { n: oldInteger("n") });
    const newAbsent = sqliteTable("absent", { n: integer("n") });
    const operations = [
      [() => before.insert(oldProbe).values({ n: 1 }).run(), () => after.insert(newProbe).values({ n: 1 }).run()],
      [
        () =>
          before
            .select({ missing: oldSql.raw("missing") })
            .from(oldProbe)
            .all(),
        () =>
          after
            .select({ missing: sqlText.raw("missing") })
            .from(newProbe)
            .all(),
      ],
      [() => before.update(oldAbsent).set({ n: 1 }).run(), () => after.update(newAbsent).set({ n: 1 }).run()],
    ] as const;
    for (const [oldOperation, newOperation] of operations) {
      let previous: unknown;
      let current: unknown;
      try {
        oldOperation();
      } catch (error) {
        previous = error;
      }
      try {
        newOperation();
      } catch (error) {
        try {
          rethrowQueryError(error);
        } catch (original) {
          current = original;
        }
      }
      expect(current).toBeInstanceOf(Database.SqliteError);
      expect(current).toEqual(previous);
      if (current instanceof Error && previous instanceof Error) expect(current.message).toBe(previous.message);
    }
    const original = new Database.SqliteError("database is locked", "SQLITE_BUSY");
    const wrapped = new DrizzleQueryError("SELECT 1", [], original);
    try {
      rethrowQueryError(wrapped);
    } catch (error) {
      expect(error).toBe(original);
    }
  } finally {
    handle.close();
  }
});

layer(NodeServices.layer)((it) => {
  it.effect("M15: two handles to the same file keep distinct runtimes and independent disposal", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* Effect.acquireRelease(fs.makeTempDirectory(), (path) =>
        fs.remove(path, { recursive: true }).pipe(Effect.orDie)
      );
      const handles = yield* Effect.acquireRelease(
        Effect.sync(
          () => [new Database(`${directory}/handles.sqlite`), new Database(`${directory}/handles.sqlite`)] as const
        ),
        ([a, b]) =>
          Effect.sync(() => {
            releaseHandle(a);
            releaseHandle(b);
            a.close();
            b.close();
          })
      );
      const [a, b] = handles;
      const ra = runtimeForHandle(a);
      const rb = runtimeForHandle(b);
      expect(ra).not.toBe(rb);
      a.exec("CREATE TEMP TABLE local_a (n); INSERT INTO local_a VALUES (1)");
      b.exec("CREATE TEMP TABLE local_b (n); INSERT INTO local_b VALUES (2)");
      const sqlA = ra.runSync(Client.SqlClient);
      const sqlB = rb.runSync(Client.SqlClient);
      expect(ra.runSync(sqlA`SELECT * FROM local_a`)).toEqual([{ n: 1 }]);
      expect(rb.runSync(sqlB`SELECT * FROM local_b`)).toEqual([{ n: 2 }]);
      releaseHandle(b);
      expect(ra.runSync(sqlA`SELECT * FROM local_a`)).toEqual([{ n: 1 }]);
    })
  );
});

it("dual audit: legacy migration appliers execute the same statements in both call shapes", () => {
  for (const apply of [applySubscriptionsMigrations, applyPromptRunMigrations]) {
    const direct: string[] = [];
    const curried: string[] = [];
    apply((statement) => {
      direct.push(statement);
    }, []);
    apply([])((statement) => {
      curried.push(statement);
    });
    expect(curried).toEqual(direct);
    expect(curried.length).toBeGreaterThan(0);
  }
});

it("U2: mixed SQL failure and Drizzle defect retain the SQL driver error by identity", () => {
  const driver = new Database.SqliteError("database is locked", "SQLITE_BUSY");
  const failure = Cause.fail(
    SqlError.SqlError.make({ reason: SqlError.classifySqliteError(driver, { operation: "execute" }) })
  );
  const wrapped = new DrizzleQueryError("SELECT absent", [], new Error("no such table: absent"));
  for (const defect of [wrapped, new Error("listener", { cause: wrapped })]) {
    expect(() => rethrowDriverError(Cause.combine(failure, Cause.die(defect)))).toThrow(driver);
    try {
      rethrowDriverError(Cause.combine(failure, Cause.die(defect)));
    } catch (error) {
      expect(error).toBe(driver);
    }
  }
});
