import { expect, layer } from "@effect/vitest";
import Database from "better-sqlite3";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as R from "effect/Record";
import * as Str from "effect/String";
import * as Client from "effect/sql/SqlClient";
import { layerFromHandle } from "../src/BetterSqlite.driver.js";
import { Drizzle, layer as drizzleLayer } from "../src/Drizzle.service.js";
import * as P from "../src/legacy/prompt-runs.js";
import * as U from "../src/legacy/subscriptions.js";
import * as Trans from "../src/legacy/transcripts.js";
import { layer as nodeLayer } from "../src/NodeSqlite.layer.js";
import { decodeRow } from "../src/Row.js";
import * as T from "../src/task-queue.js";
import { testDriver } from "./legacy/io.js";
import { snapshot, tables } from "./support.js";

const driver = testDriver;
const borrowedLayer = Layer.unwrap(
  Effect.acquireRelease(
    Effect.sync(() => new Database(":memory:")),
    (handle) =>
      Effect.sync(() => {
        handle.close();
      })
  ).pipe(Effect.map((handle) => layerFromHandle(handle)))
);
const clientLayer = driver === "borrowed" ? borrowedLayer : nodeLayer(":memory:");
const withClient = <A, E>(program: Effect.Effect<A, E, Client.SqlClient | Drizzle>) => program;
layer(drizzleLayer.pipe(Layer.provideMerge(clientLayer)), { buildPerTest: true })((it) => {
  const run = driver === "node" || driver === "borrowed" ? it.effect : it.effect.skip;
  const execute = Effect.fnUntraced(function* (ddl: string) {
    const sql = yield* Client.SqlClient;
    for (const statement of Str.split(ddl, ";"))
      if (Str.trim(statement).length > 0) yield* sql.unsafe(statement).unprepared;
  });
  const columnNames = Effect.fnUntraced(function* (table: string) {
    const sql = yield* Client.SqlClient;
    const rows = yield* sql.unsafe<{
      name: string;
    }>(`PRAGMA table_info(${table})`);
    return A.map(rows, (row) => row.name);
  });
  const apply = Effect.fnUntraced(function* (
    callback: (exec: (ddl: string) => void, columns: string[], segments: string[]) => void,
    table: string
  ) {
    const names = yield* columnNames(table);
    const segments = yield* columnNames("transcript_segments");
    const statements: string[] = [];
    callback((ddl) => statements.push(ddl), names, segments);
    for (const ddl of statements) yield* execute(ddl);
  });
  const readSchema = Effect.fnUntraced(function* () {
    const sql = yield* Client.SqlClient;
    const rows = yield* sql.unsafe<Record<string, unknown>>(
      "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name"
    );
    const result: Record<string, unknown>[] = [];
    for (const row of rows) {
      const normalized = {
        ...row,
        sql:
          typeof row.sql === "string"
            ? Str.trim(Str.replace(/ \)/g, ")")(Str.replace(/\( /g, "(")(Str.replace(/\s+/g, " ")(row.sql))))
            : row.sql,
      };
      if (row.type === "table")
        result.push({
          ...normalized,
          columns: yield* sql.unsafe(`PRAGMA table_info("${row.name}")`),
          foreignKeys: yield* sql.unsafe(`PRAGMA foreign_key_list("${row.name}")`),
        });
      else
        result.push({
          ...normalized,
          columns: yield* sql.unsafe(`PRAGMA index_info("${row.name}")`),
        });
    }
    return result;
  });
  for (const [name, ddl] of [
    ["task-queue-v1", T.TASK_QUEUE_DDL_V1],
    ["subscriptions-v1", U.SUBSCRIPTIONS_DDL_V1],
    ["transcripts-v1", Trans.TRANSCRIPT_DDL_V1],
    ["prompt-runs-v1", P.PROMPT_RUN_DDL_V1],
  ] as const) {
    run(`${driver}: ${name} schema and idempotence match immutable baseline`, () =>
      withClient(
        Effect.gen(function* () {
          yield* execute(ddl);
          const first = yield* readSchema();
          expect(first).toEqual(snapshot(name));
          yield* execute(ddl);
          const second = yield* readSchema();
          expect(second).toEqual(first);
        })
      )
    );
  }
  run(`${driver}: all 512 subscription missing-column combinations preserve rows/defaults`, () =>
    withClient(
      Effect.gen(function* () {
        const sql = yield* Client.SqlClient;
        const added = [
          "auto_download",
          "download_type",
          "download_quality",
          "download_container",
          ...A.map(U.SUBSCRIPTIONS_V3_COLUMNS, ([name]) => name),
        ];
        for (let mask = 0; mask < 512; mask++) {
          yield* apply(U.applySubscriptionsMigrations, "subscriptions");
          const missing = A.filter(added, (_, bit) => (mask & (1 << bit)) !== 0);
          for (const column of missing) yield* sql.unsafe(`ALTER TABLE subscriptions DROP COLUMN ${column}`);
          yield* sql.unsafe(
            "INSERT INTO subscriptions (id,title,source_url,feed_url,platform,keywords,tags,only_latest,enabled,status,created_at,updated_at) VALUES ('synthetic','title','source','feed','platform','[]','[]',1,1,'active',1,2)"
          );
          const before = (yield* sql.unsafe<Record<string, unknown>>("SELECT * FROM subscriptions"))[0];
          yield* apply(U.applySubscriptionsMigrations, "subscriptions");
          const after = (yield* sql.unsafe<Record<string, unknown>>("SELECT * FROM subscriptions"))[0];
          expect(after).toMatchObject(before ?? {});
          const defaults: Record<string, unknown> = {
            auto_download: 1,
            source_kind: "feed",
            categories: "[]",
          };
          for (const column of missing) expect(after?.[column]).toBe(defaults[column] ?? null);
          const columns = yield* sql.unsafe<Record<string, unknown>>("PRAGMA table_info(subscriptions)");
          expect(
            A.map(columns, ({ cid: _cid, ...row }) => row).sort((a, b) =>
              Str.localeCompare(String(b.name))(String(a.name))
            )
          ).toEqual(snapshot("subscriptions-current-columns"));
          yield* sql.unsafe("DROP TABLE subscriptions; ").unprepared;
        }
      })
    )
  );
  for (const kind of ["transcripts", "prompt-runs"] as const)
    run(`${driver}: ${kind} all eight additive states preserve row values`, () =>
      withClient(
        Effect.gen(function* () {
          const sql = yield* Client.SqlClient;
          const ddls =
            kind === "transcripts"
              ? [Trans.TRANSCRIPT_DDL_V2, Trans.TRANSCRIPT_DDL_V3, Trans.TRANSCRIPT_DDL_V4]
              : [P.PROMPT_RUN_DDL_V2, P.PROMPT_RUN_DDL_V3, P.PROMPT_RUN_DDL_V4];
          for (let mask = 0; mask < 8; mask++) {
            yield* execute(kind === "transcripts" ? Trans.TRANSCRIPT_DDL_V1 : P.PROMPT_RUN_DDL_V1);
            for (const [bit, ddl] of ddls.entries()) if ((mask & (1 << bit)) !== 0) yield* execute(ddl);
            if (kind === "transcripts") {
              yield* sql.unsafe(
                "INSERT INTO transcripts (id,download_task_id,transcription_task_id,result_kind,model_version,created_at,updated_at) VALUES ('synthetic','download','task','transcript','v1',1,2)"
              );
              yield* sql.unsafe(
                "INSERT INTO transcript_segments (id,transcript_id,start_ms,end_ms,text,sort_index) VALUES ('segment','synthetic',0,1,'雪',0)"
              );
              yield* apply(Trans.applyTranscriptMigrations, "transcripts");
              const rows = yield* sql.unsafe("SELECT * FROM transcripts");
              expect(rows[0]).toMatchObject({
                id: "synthetic",
                asr_tier: null,
                source_kind: null,
                created_at: 1,
                updated_at: 2,
              });
              const segments = yield* sql.unsafe("SELECT * FROM transcript_segments");
              expect(segments[0]).toMatchObject({
                text: "雪",
                words_json: null,
              });
              yield* execute("DROP TABLE transcript_segments; DROP TABLE transcript_speakers; DROP TABLE transcripts;");
            } else {
              yield* sql.unsafe(
                "INSERT INTO transcript_prompt_runs (download_id,prompt_id,status,text,created_at,updated_at) VALUES ('download','prompt','done','雪',1,2)"
              );
              yield* apply(P.applyPromptRunMigrations, "transcript_prompt_runs");
              const rows = yield* sql.unsafe("SELECT * FROM transcript_prompt_runs");
              expect(rows[0]).toMatchObject({
                download_id: "download",
                thinking: "",
                thinking_ms: 0,
                cloud_result_id: null,
                text: "雪",
              });
              yield* execute("DROP TABLE transcript_prompt_runs;");
            }
          }
        })
      )
    );
  run(`${driver}: stored non-finite numbers fail row decoding without leaking values`, () =>
    withClient(
      Effect.gen(function* () {
        const sql = yield* Client.SqlClient;
        const db = yield* Drizzle;
        yield* execute(T.TASK_QUEUE_DDL_V1);
        yield* sql.unsafe(
          "INSERT INTO tasks (id,kind,status,entered_status_at,priority,group_key,max_attempts,created_at,updated_at,input_json) VALUES ('synthetic','video','done',0,0,'g',1,0,0,'{}')"
        );
        for (const [literal, expected] of [
          ["1e999", Number.POSITIVE_INFINITY],
          ["-1e999", Number.NEGATIVE_INFINITY],
        ] as const) {
          yield* sql.unsafe(`UPDATE tasks SET priority = ${literal}`);
          const raw = (yield* sql.unsafe<Record<string, unknown>>("SELECT * FROM tasks"))[0];
          const property = (yield* db.select().from(T.tasksTable))[0];
          expect(raw?.priority).toBe(expected);
          expect(property?.priority).toBe(expected);
          const rawError = yield* decodeRow("tasks")(T.TaskRowFromSql)(raw).pipe(Effect.flip);
          const propertyError = yield* decodeRow("tasks")(T.TaskRow)(property).pipe(Effect.flip);
          for (const error of [rawError, propertyError]) {
            expect(error._tag).toBe("DbRowDecodeError");
            expect(error.table).toBe("tasks");
            expect(error.issue).toBe("Stored row does not match the table schema");
          }
        }
        yield* sql.unsafe("UPDATE tasks SET priority = 1.5");
        const finite = (yield* sql.unsafe<Record<string, unknown>>("SELECT * FROM tasks"))[0];
        const decoded = yield* decodeRow("tasks")(T.TaskRowFromSql)(finite);
        expect(decoded).toBeInstanceOf(T.TaskRow);
        expect(decoded.priority).toBe(1.5);
      })
    )
  );
  for (const table of tables)
    run(`${driver}: ${getTableConfig(table).name} raw and Effect Drizzle round trips match pinning values`, () =>
      withClient(
        Effect.gen(function* () {
          const sql = yield* Client.SqlClient;
          const db = yield* Drizzle;
          const schema = snapshot("current-schema") as ReadonlyArray<{
            type: string;
            name: string;
            sql: string;
          }>;
          for (const row of A.filter(schema, (row) => row.type === "table" && row.name !== "__drizzle_migrations"))
            yield* execute(row.sql);
          for (const row of A.filter(schema, (row) => row.type === "index")) yield* execute(row.sql);
          yield* sql.unsafe(
            "INSERT INTO tasks (id,kind,status,entered_status_at,priority,group_key,max_attempts,created_at,updated_at,input_json) VALUES ('synthetic-id','video','done',0,0,'g',1,0,0,'{}')"
          );
          yield* sql.unsafe(
            "INSERT INTO transcripts (id,download_task_id,transcription_task_id,result_kind,model_version,created_at,updated_at) VALUES ('synthetic-id','d','t','transcript','v1',0,0)"
          );
          const rows = snapshot(`roundtrip-${getTableConfig(table).name}`) as ReadonlyArray<{
            drizzle: Record<string, unknown>;
            raw: Record<string, unknown>;
          }>;
          for (const row of rows) {
            const columns = R.keys(row.raw);
            yield* sql.unsafe(
              `INSERT INTO ${getTableConfig(table).name} (${A.join(columns, ",")}) VALUES (${A.join(
                A.map(columns, () => "?"),
                ","
              )})`,
              R.values(row.raw)
            );
            const raw = yield* sql.unsafe<Record<string, unknown>>(`SELECT * FROM ${getTableConfig(table).name}`);
            expect(A.some(raw, (candidate) => A.every(R.toEntries(row.raw), ([k, v]) => candidate[k] === v))).toBe(
              true
            );
            const property = yield* db.select().from(table);
            expect(
              A.some(property, (candidate) => A.every(R.toEntries(row.drizzle), ([k, v]) => candidate[k] === v))
            ).toBe(true);
          }
        })
      )
    );
});
