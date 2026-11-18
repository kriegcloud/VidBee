import { BetterSqliteClient } from "@vidbee/db";
import { TASK_QUEUE_DDL_V1 } from "@vidbee/db/task-queue";
import Database from "better-sqlite3";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { persistenceSqlSuite } from "./persistence-sql-support.js";

const sqlLayer = Layer.unwrap(
  Effect.acquireRelease(
    Effect.sync(() => {
      const db = new Database(":memory:");
      db.exec(TASK_QUEUE_DDL_V1);
      return db;
    }),
    (db) =>
      Effect.sync(() => {
        db.close();
      })
  ).pipe(Effect.map((db) => BetterSqliteClient.layerFromHandle(db)))
);
persistenceSqlSuite(sqlLayer);
