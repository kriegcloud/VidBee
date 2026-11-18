import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as MutableHashMap from "effect/MutableHashMap";
import * as Option from "effect/Option";
import * as Reactivity from "effect/reactivity/Reactivity";
import * as S from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as Client from "effect/sql/SqlClient";
import { classifySqliteError, SqlError } from "effect/sql/SqlError";
import * as Statement from "effect/sql/Statement";
import type * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import type BetterSqlite3 from "better-sqlite3";
import type * as Connection from "effect/sql/SqlConnection";

// Keep the native public service identity without loading its node:sqlite implementation.
const sqliteTypeId: SqliteClient.TypeId = "~@effect/sql-sqlite-node/SqliteClient";

const failure = (cause: unknown) => SqlError.make({ reason: classifySqliteError(cause, { operation: "execute" }) });
export const layerFromHandle = (
  handle: BetterSqlite3.Database
): Layer.Layer<Client.SqlClient | SqliteClient.SqliteClient> =>
  Layer.effectContext(
    Effect.gen(function* () {
      const cache = MutableHashMap.empty<string, BetterSqlite3.Statement<unknown[], Record<string, unknown>>>();
      yield* Effect.addFinalizer(() => Effect.sync(() => MutableHashMap.clear(cache)));
      const prepare = (sql: string) => {
        const cached = MutableHashMap.get(cache, sql);
        if (Option.isSome(cached)) return cached.value;
        const statement = handle.prepare<unknown[], Record<string, unknown>>(sql);
        if (MutableHashMap.size(cache) >= 200) {
          const first = Array.from(cache)[0];
          if (first !== undefined) MutableHashMap.remove(cache, first[0]);
        }
        MutableHashMap.set(cache, sql, statement);
        return statement;
      };
      let borrowed: string | undefined;
      let counter = 0;
      const execute = (sql: string, params: ReadonlyArray<unknown>) =>
        Effect.try({
          try: () => {
            const statement = prepare(sql);
            return statement.reader ? statement.all(...params) : (statement.run(...params), []);
          },
          catch: failure,
        });
      const values = (sql: string, params: ReadonlyArray<unknown>, cached: boolean) =>
        Effect.try({
          try: () => {
            const statement = cached ? prepare(sql) : handle.prepare<unknown[], ReadonlyArray<unknown>>(sql);
            try {
              const raw = statement.raw(true);
              return raw.reader ? raw.all(...params) : (raw.run(...params), []);
            } finally {
              statement.raw(false);
            }
          },
          catch: failure,
        }).pipe(Effect.flatMap(S.decodeUnknownEffect(S.Array(S.Array(S.Unknown)))), Effect.mapError(failure));
      const unprepared = (sql: string, params: ReadonlyArray<unknown>) =>
        Effect.try({
          try: () => {
            if (sql === "ROLLBACK" && borrowed !== undefined) {
              const name = borrowed;
              handle.exec(`ROLLBACK TO SAVEPOINT ${name}; RELEASE SAVEPOINT ${name}`);
              borrowed = undefined;
              return [];
            }
            const statement = handle.prepare<unknown[], Record<string, unknown>>(sql);
            return statement.reader ? statement.all(...params) : (statement.run(...params), []);
          },
          catch: failure,
        });
      const connection: Connection.Connection = {
        execute: (sql, params, transform) =>
          transform !== undefined ? Effect.map(execute(sql, params), transform) : execute(sql, params),
        executeRaw: (sql, params) =>
          Effect.try({
            try: () => {
              const statement = prepare(sql);
              return statement.reader ? statement.all(...params) : statement.run(...params);
            },
            catch: failure,
          }),
        executeValues: (sql, params) => values(sql, params, true),
        executeValuesUnprepared: (sql, params) => values(sql, params, false),
        executeUnprepared: (sql, params, transform) =>
          transform !== undefined ? Effect.map(unprepared(sql, params), transform) : unprepared(sql, params),
        executeStream: () => Stream.die("executeStream not implemented"),
      };
      const semaphore = yield* Semaphore.make(1);
      const ensureAvailable = Effect.flatMap(semaphore.takeIfAvailable(1), (available) =>
        available
          ? semaphore.release(1)
          : Effect.die(
              "Database access suspended while holding a permit: database access rule 2 requires SQL and pure synchronous work only"
            )
      );
      const acquirers = Client.makeSqliteAcquirers({
        connection: Effect.succeed(connection),
        semaphore,
        isTransaction: () => handle.inTransaction,
      });
      const client = yield* Client.make({
        ...acquirers,
        acquirer: Effect.andThen(ensureAvailable, acquirers.acquirer),
        transactionAcquirer: Effect.andThen(ensureAvailable, acquirers.transactionAcquirer),
        borrower: (f) => Effect.andThen(ensureAvailable, acquirers.borrower(f)),
        driver: "better-sqlite3-borrowed",
        spanAttributes: [],
        compiler: Statement.makeCompilerSqlite(),
        begin: (_, statement) =>
          Effect.suspend(() => {
            if (handle.inTransaction) {
              borrowed = `vidbee_borrowed_${++counter}`;
              return Effect.asVoid(unprepared(`SAVEPOINT ${borrowed}`, []));
            }
            return Effect.asVoid(unprepared(statement ?? "BEGIN IMMEDIATE", []));
          }),
        commit: () =>
          Effect.suspend(() => {
            const sql = borrowed === undefined ? "COMMIT" : `RELEASE SAVEPOINT ${borrowed}`;
            return Effect.tap(Effect.asVoid(unprepared(sql, [])), () =>
              Effect.sync(() => {
                borrowed = undefined;
              })
            );
          }),
        releaseSavepoint: (name) => `RELEASE SAVEPOINT ${name}`,
      });
      const nodeClient = Object.assign(client as SqliteClient.SqliteClient & Client.SqlClient, {
        [sqliteTypeId]: sqliteTypeId,
        config: { filename: handle.name },
        backup: (_destination: string) => Effect.fail(failure(new Error("Cannot back up a borrowed database handle"))),
        loadExtension: (_path: string) =>
          Effect.fail(failure(new Error("Cannot load extensions on a borrowed database handle"))),
      });
      // SQLite compiler rejects updateValues; the node driver exposes this member as never.
      return Context.make(Client.SqlClient, nodeClient).pipe(
        Context.add(
          Context.Service<SqliteClient.SqliteClient, SqliteClient.SqliteClient & Client.SqlClient>(
            "@effect/sql-sqlite-node/SqliteClient"
          ),
          nodeClient
        )
      );
    })
  ).pipe(Layer.provide(Reactivity.layer));
