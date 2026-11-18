import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Client from "effect/sql/SqlClient";
export const layer = (filename: string) =>
  Layer.effectDiscard(
    Effect.gen(function* () {
      const sql = yield* Client.SqlClient;
      yield* sql.unsafe("PRAGMA foreign_keys = ON");
    })
  ).pipe(Layer.provideMerge(SqliteClient.layer({ filename, busyTimeout: 5000 })));
