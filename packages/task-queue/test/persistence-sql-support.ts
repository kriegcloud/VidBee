import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as S from "effect/Schema";
import * as Client from "effect/sql/SqlClient";
import { layerSql } from "../src/TaskPersistence.layer.js";
import { TaskPersistence } from "../src/TaskPersistence.service.js";
import { task } from "./persistence-support.js";
import type { SqlClient } from "effect/sql/SqlClient";
export const persistenceSqlSuite = <E>(sqlLayer: Layer.Layer<SqlClient, E>) => {
  const Json = S.fromJsonString(S.Record(S.String, S.Unknown));
  layer(layerSql.pipe(Layer.provideMerge(sqlLayer)), { buildPerTest: true })((it) => {
    it.effect("SQL serializes host values without semantic write validation", () =>
      Effect.gen(function* () {
        const persistence = yield* TaskPersistence;
        const sql = yield* Client.SqlClient;
        const original = task("host-write");
        yield* persistence.insertTask({
          ...original,
          input: { ...original.input, playlistIndex: Number.NaN },
          progress: { ...original.progress, percent: Number.POSITIVE_INFINITY },
        });
        const rows = yield* sql.unsafe("SELECT input_json,progress_json FROM tasks WHERE id='host-write'");
        const row = yield* S.decodeUnknownEffect(S.Struct({ input_json: S.String, progress_json: S.String }))(rows[0]);
        const input = yield* S.decodeEffect(Json)(row.input_json);
        const progress = yield* S.decodeEffect(Json)(row.progress_json);
        expect(input.playlistIndex).toBe(null);
        expect(progress.percent).toBe(null);
      })
    );
    it.effect("SQL preserves unknown nested JSON through a rewrite", () =>
      Effect.gen(function* () {
        const p = yield* TaskPersistence;
        const sql = yield* Client.SqlClient;
        const t = task("roundtrip");
        yield* p.insertTask(t);
        const json = yield* S.encodeEffect(Json)({
          filePath: "synthetic",
          size: 1,
          durationMs: null,
          sha256: null,
          future: { retained: true },
          cookieSources: [{ type: "browser", future: 1 }],
          transcript: { resultKind: "transcript", transcriptId: "synthetic", future: 2 },
        });
        yield* sql.unsafe("UPDATE tasks SET output_json = ? WHERE id = ?", [json, t.id]);
        const loaded = yield* p.loadAllTasks;
        const first = loaded[0];
        expect(first).toBeDefined();
        if (first === undefined) return;
        yield* p.upsertTask({ task: first, progress: first.progress });
        const again = yield* p.loadAllTasks;
        expect(again[0]?.output).toEqual({
          filePath: "synthetic",
          size: 1,
          durationMs: null,
          sha256: null,
          future: { retained: true },
          cookieSources: [{ type: "browser", future: 1 }],
          transcript: { resultKind: "transcript", transcriptId: "synthetic", future: 2 },
        });
      })
    );
    it.effect("SQL rejects malformed JSON in typed channel", () =>
      Effect.gen(function* () {
        const p = yield* TaskPersistence;
        const sql = yield* Client.SqlClient;
        yield* p.insertTask(task("malformed"));
        yield* sql.unsafe("UPDATE tasks SET input_json = '{' WHERE id = 'malformed'");
        const error = yield* p.loadAllTasks.pipe(Effect.flip);
        expect(error._tag).toBe("TaskRowDecodeError");
      })
    );
    it.effect("SQL skips wrong-shaped rows while keeping valid rows", () =>
      Effect.gen(function* () {
        const p = yield* TaskPersistence;
        const sql = yield* Client.SqlClient;
        yield* p.insertTask(task("valid"));
        yield* p.insertTask(task("wrong-shape"));
        yield* sql.unsafe("UPDATE tasks SET input_json = 'null' WHERE id='wrong-shape'");
        const rows = yield* p.loadAllTasks;
        expect(rows.length).toBe(1);
        expect(rows[0]?.id).toBe("valid");
      })
    );
    it.effect("SQL attempts, journal matching, lifecycle backfill and recursive deletion", () =>
      Effect.gen(function* () {
        const p = yield* TaskPersistence;
        const sql = yield* Client.SqlClient;
        yield* p.insertTask(task("parent"));
        yield* p.insertTask({ ...task("child"), parentId: "parent" });
        yield* p.insertTask({ ...task("grandchild"), parentId: "child" });
        const observed1 = yield* p.hasTask("parent");
        expect(observed1).toBe(true);
        const observed2 = yield* p.hasTask("absent");
        expect(observed2).toBe(false);
        yield* p.insertAttempt({
          taskId: "parent",
          attemptId: "a1",
          pid: 7,
          pidStartedAt: 1,
          startedAt: 11,
          rawArgsHash: "h",
        });
        yield* p.closeAttempt({
          taskId: "parent",
          attemptId: "a1",
          endedAt: 15,
          exitCode: 0,
          errorCategory: null,
          stdoutTail: "out",
          stderrTail: null,
        });
        const observed3 = yield* p.loadLatestAttempt("parent");
        expect(observed3).toEqual({
          id: "a1",
          taskId: "parent",
          attemptNumber: 1,
          startedAt: 11,
          endedAt: 15,
          exitCode: 0,
          errorCategory: null,
          stdoutTail: "out",
          stderrTail: null,
          rawArgsHash: "h",
        });
        const spawn = {
          ts: 1,
          op: "spawn" as const,
          taskId: "parent",
          attemptId: "a1",
          pid: 7,
          pidStartedAt: 1,
          exitCode: null,
          signal: null,
        };
        yield* p.appendJournal(spawn);
        expect((yield* p.findOpenSpawns).length).toBe(1);
        yield* p.appendJournal({ ...spawn, op: "close" });
        const observed4 = yield* p.findOpenSpawns;
        expect(observed4).toEqual([]);
        yield* p.appendJournal(spawn);
        expect((yield* p.findOpenSpawns).length).toBe(1);
        yield* sql.unsafe("UPDATE tasks SET progress_json=NULL WHERE id='parent'");
        const tasks = yield* p.loadAllTasks;
        expect(tasks[0]?.input.options?.startedAt).toBe(11);
        expect(tasks[0]?.progress.ticks).toBe(0);
        yield* p.upsertProgress("parent", { ...task("p").progress, ticks: 3 });
        const updated = yield* p.loadAllTasks;
        expect(updated[0]?.progress.ticks).toBe(3);
        yield* p.deleteTask("parent");
        const observed5 = yield* p.loadAllTasks;
        expect(observed5).toEqual([]);
        const observed6 = yield* p.loadLatestAttempt("parent");
        expect(observed6).toBe(null);
        yield* p.maintenance;
        yield* p.close;
      })
    );
    it.effect("SQL batch rollback leaves earlier rows untouched", () =>
      Effect.gen(function* () {
        const p = yield* TaskPersistence;
        const sql = yield* Client.SqlClient;
        yield* sql.unsafe("PRAGMA foreign_keys = ON");
        const original = task("parent");
        yield* p.insertTask(original);
        const changed = { ...original, status: "paused" as const };
        const invalid = { ...task("invalid"), parentId: "missing-parent" };
        yield* p
          .upsertTasks([
            { task: changed, progress: changed.progress },
            { task: invalid, progress: invalid.progress },
          ])
          .pipe(Effect.flip);
        const loaded = yield* p.loadAllTasks;
        expect(loaded.length).toBe(1);
        expect(loaded[0]?.status).toBe("queued");
      })
    );
  });
};
