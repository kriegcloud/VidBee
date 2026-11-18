import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import * as Client from "effect/sql/SqlClient";
import { DbMigrationError } from "./Db.errors.js";
import { DbSchema } from "./Migrations.service.js";
import * as P from "./prompt-runs.js";
import * as U from "./subscriptions.js";
import { TASK_QUEUE_DDL_V1 } from "./task-queue.js";
import * as T from "./transcripts.js";
import type { MigrationName } from "./Db.errors.js";

const Columns = S.Array(S.Struct({ name: S.String }));
export const layer = Layer.effect(
  DbSchema,
  Effect.gen(function* () {
    const sql = yield* Client.SqlClient;
    const exec = (migration: typeof MigrationName.Type, step: string, ddl: string) =>
      Effect.forEach(
        A.filter(Str.split(ddl, ";"), (statement) => Str.trim(statement).length > 0),
        (statement) => sql.unsafe(statement).unprepared,
        { concurrency: 1 }
      ).pipe(
        Effect.asVoid,
        Effect.mapError((cause) => DbMigrationError.make({ migration, step, cause }))
      );
    const columns = (migration: typeof MigrationName.Type, table: string) =>
      sql.unsafe(`PRAGMA table_info(${table})`).pipe(
        Effect.flatMap(S.decodeUnknownEffect(Columns)),
        Effect.mapBoth({
          onSuccess: A.map((row) => row.name),
          onFailure: (cause) => DbMigrationError.make({ migration, step: `inspect ${table}`, cause }),
        })
      );
    const additions = Effect.fnUntraced(function* (
      migration: typeof MigrationName.Type,
      table: string,
      definitions: ReadonlyArray<readonly [string, string]>
    ) {
      const names = yield* columns(migration, table);
      for (const [name, definition] of definitions)
        if (!names.includes(name))
          yield* exec(migration, `add ${name}`, `ALTER TABLE ${table} ADD COLUMN ${name} ${definition};`);
    });
    return DbSchema.of({
      applyTaskQueue: exec("task-queue", "v1", TASK_QUEUE_DDL_V1),
      applySubscriptions: Effect.gen(function* () {
        yield* exec("subscriptions", "v1", U.SUBSCRIPTIONS_DDL_V1);
        yield* additions("subscriptions", "subscriptions", [
          ["auto_download", "INTEGER NOT NULL DEFAULT 1"],
          ["download_type", "TEXT"],
          ["download_quality", "TEXT"],
          ["download_container", "TEXT"],
          ...U.SUBSCRIPTIONS_V3_COLUMNS,
        ]);
      }),
      applyTranscripts: Effect.gen(function* () {
        const previousSegments = yield* columns("transcripts", "transcript_segments");
        yield* exec("transcripts", "v1", T.TRANSCRIPT_DDL_V1);
        yield* additions("transcripts", "transcripts", [["asr_tier", "TEXT"]]);
        if (previousSegments.length > 0)
          yield* additions("transcripts", "transcript_segments", [["words_json", "TEXT"]]);
        yield* additions("transcripts", "transcripts", [["source_kind", "TEXT"]]);
      }),
      applyPromptRuns: Effect.gen(function* () {
        yield* exec("prompt-runs", "v1", P.PROMPT_RUN_DDL_V1);
        yield* additions("prompt-runs", "transcript_prompt_runs", [
          ["thinking", "TEXT NOT NULL DEFAULT ''"],
          ["thinking_ms", "INTEGER NOT NULL DEFAULT 0"],
          ["cloud_result_id", "TEXT"],
        ]);
      }),
    });
  })
);
