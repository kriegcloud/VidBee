import { decodeRow } from "@vidbee/db/Row";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as S from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Str from "effect/String";
import * as Client from "effect/sql/SqlClient";
import { HostFailure } from "./Transcription.errors.js";
import { TranscriptionFiles } from "./TranscriptionFiles.service.js";
import { MigrationCount, MigrationTable } from "./TranscriptMigration.model.js";
import { TranscriptMigration, TranscriptMigrationSource } from "./TranscriptMigration.service.js";
import type * as SqlError from "effect/sql/SqlError";
import type { MergeTaskQueueDbResult } from "./TranscriptMigration.model.js";

// Finalization is masked and a finalizer failure takes precedence, as in the old finally blocks.
const finalize = <A, E, R, E2, R2>(effect: Effect.Effect<A, E, R>, cleanup: Effect.Effect<void, E2, R2>) =>
  Effect.uninterruptibleMask((restore) =>
    restore(effect).pipe(
      Effect.matchCauseEffect({
        onFailure: (cause) => cleanup.pipe(Effect.andThen(Effect.failCause(cause))),
        onSuccess: (value) => cleanup.pipe(Effect.as(value)),
      })
    )
  );
export const make = Effect.fnUntraced(function* () {
  const sql = yield* Client.SqlClient;
  const files = yield* TranscriptionFiles;
  const sources = yield* TranscriptMigrationSource;
  const count = Effect.fnUntraced(function* (table: "tasks" | "attempts" | "process_journal") {
    const raw = yield* sql.unsafe(`SELECT COUNT(*) AS n FROM ${table}`);
    const decoded = yield* decodeRow(table)(S.Array(MigrationCount))(raw);
    return Number(decoded[0]?.n ?? 0);
  });
  return TranscriptMigration.of({
    merge: Effect.fnUntraced(function* (input: { legacyPath: string }) {
      const result: MergeTaskQueueDbResult = {
        merged: false,
        tasksCopied: 0,
        attemptsCopied: 0,
        journalCopied: 0,
        backupPath: null,
      };
      const exists = yield* files.exists(input.legacyPath);
      if (!exists) return result;
      const escaped = Str.replace(/'/g, "''")(input.legacyPath);
      yield* Effect.scoped(
        Effect.gen(function* () {
          const source = yield* sources.open(input.legacyPath);
          yield* finalize(
            Effect.gen(function* () {
              const hasTasks = yield* source.hasTasks;
              if (!hasTasks) return;
              const before = yield* count("tasks");
              yield* sql.unsafe(`ATTACH DATABASE '${escaped}' AS legacy_tq`).unprepared;
              yield* finalize(
                Effect.gen(function* () {
                  yield* sql.unsafe("INSERT OR IGNORE INTO tasks SELECT * FROM legacy_tq.tasks").unprepared;
                  yield* sql.unsafe("INSERT OR IGNORE INTO attempts SELECT * FROM legacy_tq.attempts").unprepared;
                  yield* sql.unsafe(
                    "INSERT INTO process_journal (ts, op, task_id, attempt_id, pid, pid_started_at, exit_code, signal) SELECT ts, op, task_id, attempt_id, pid, pid_started_at, exit_code, signal FROM legacy_tq.process_journal"
                  ).unprepared;
                }),
                sql.unsafe("DETACH DATABASE legacy_tq").unprepared.pipe(Effect.asVoid)
              );
              const after = yield* count("tasks");
              result.tasksCopied = Math.max(0, after - before);
              result.attemptsCopied = yield* count("attempts");
              result.journalCopied = yield* count("process_journal");
              result.merged = true;
            }),
            source.close
          );
        })
      );
      if (!result.merged) return result;
      const backup = `${input.legacyPath}.migrated`;
      const hasBackup = yield* files.exists(backup);
      if (!hasBackup) {
        yield* files.rename(input.legacyPath, backup);
        result.backupPath = backup;
      }
      return result;
    }),
  });
});
export const layer = Layer.effect(TranscriptMigration, make());

/** Supply the source client factory from the same driver family as the target. */
export const sourceLayer = (openClient: (path: string) => Layer.Layer<Client.SqlClient, SqlError.SqlError>) =>
  Layer.succeed(TranscriptMigrationSource, {
    open: Effect.fnUntraced(function* (path: string) {
      const owner = yield* Effect.acquireRelease(Scope.make(), (scope) => Scope.close(scope, Exit.void));
      const context = yield* Layer.buildWithScope(openClient(path), owner).pipe(
        Effect.mapError((cause) =>
          HostFailure.make({
            operation: "openLegacy",
            legacyMessage: "Could not inspect the legacy task queue database",
            cause,
          })
        )
      );
      const source = Context.get(context, Client.SqlClient);
      return {
        hasTasks: source.unsafe("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'").pipe(
          Effect.mapError((cause) =>
            HostFailure.make({
              operation: "inspectLegacy",
              legacyMessage: "Could not inspect the legacy task queue database",
              cause,
            })
          ),
          Effect.flatMap(decodeRow("tasks")(S.Array(MigrationTable))),
          Effect.map((rows) => Boolean(rows[0]?.name))
        ),
        close: Scope.close(owner, Exit.void),
      };
    }),
  });
