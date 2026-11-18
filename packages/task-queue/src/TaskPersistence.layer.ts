import * as A from "effect/Array";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as M from "effect/MutableHashMap";
import * as Option from "effect/Option";
import * as S from "effect/Schema";
import * as Issue from "effect/SchemaIssue";
import * as SqlClient from "effect/sql/SqlClient";
import * as R from "./persist/Rows.model.js";
import * as SQL from "./persist/Sql.js";
import { TaskPersistence } from "./TaskPersistence.service.js";
import { HostFailure, TaskRowDecodeError } from "./TaskQueue.errors.js";
import type { PersistTransitionInput } from "./Persist.model.js";
import type { AttemptRow, ProcessJournalRow, Task, TaskProgress } from "./Task.model.js";

export const JournalAgeMs = Context.Reference<number>("@vidbee/task-queue/TaskPersistence.layer/JournalAgeMs", {
  defaultValue: () => 30 * 24 * 60 * 60 * 1000,
});

const issuePaths = (error: S.SchemaError): string => {
  const issues = Issue.makeFormatterStandardSchemaV1()(error.issue).issues;
  return (
    A.join(
      A.map(issues, (item) =>
        A.join(
          A.map(item.path ?? [], (segment) => (typeof segment === "object" ? String(segment.key) : String(segment))),
          "."
        )
      ),
      ", "
    ) || "root"
  );
};
const Json = S.fromJsonString(S.Unknown);
const readJson = Effect.fnUntraced(function* <A>(schema: S.Codec<A>, value: string, taskId: string, column: string) {
  const parsed = yield* S.decodeEffect(Json)(value).pipe(
    Effect.mapError(() =>
      TaskRowDecodeError.make({
        taskId,
        column,
        issue: "Malformed JSON",
        legacyMessage: `Cannot decode task ${taskId} column ${column}`,
      })
    )
  );
  return yield* decode(schema, parsed, taskId, column);
});
const decode = <A, E>(schema: S.Codec<A, E>, value: unknown, taskId: string, column: string) =>
  S.decodeUnknownEffect(schema)(value).pipe(
    Effect.mapError((error) =>
      TaskRowDecodeError.make({
        taskId,
        column,
        issue: issuePaths(error),
        legacyMessage: `Cannot decode task ${taskId} column ${column}`,
      })
    )
  );
const encode = (value: unknown, taskId: string, column: string) =>
  S.encodeEffect(Json)(value).pipe(
    Effect.mapError(() =>
      TaskRowDecodeError.make({
        taskId,
        column,
        issue: "Task value cannot be encoded",
        legacyMessage: `Cannot encode task ${taskId} column ${column}`,
      })
    )
  );
const emptyProgress: TaskProgress = {
  percent: null,
  bytesDownloaded: null,
  bytesTotal: null,
  speedBps: null,
  etaMs: null,
  ticks: 0,
};
const readTask = Effect.fnUntraced(function* (raw: unknown) {
  const id = yield* decode(R.Id, raw, "unknown", "id");
  const r = yield* decode(R.RawTask, raw, id.id, "row");
  const input = yield* readJson(R.Input, r.input_json, r.id, "input_json");
  if (input.options?.startedAt == null && r.first_started_at != null)
    input.options = { ...input.options, startedAt: r.first_started_at };
  const progress =
    r.progress_json !== null && r.progress_json !== ""
      ? yield* readJson(R.Progress, r.progress_json, r.id, "progress_json")
      : { ...emptyProgress };
  const output =
    r.output_json !== null && r.output_json !== ""
      ? yield* readJson(S.NullOr(R.Output), r.output_json, r.id, "output_json")
      : null;
  const lastError =
    r.last_error_json !== null && r.last_error_json !== ""
      ? yield* readJson(S.NullOr(R.Error), r.last_error_json, r.id, "last_error_json")
      : null;
  return {
    id: r.id,
    kind: r.kind,
    parentId: r.parent_id,
    input,
    priority: r.priority,
    groupKey: r.group_key,
    status: r.status,
    prevStatus: r.prev_status,
    statusReason: r.status_reason,
    enteredStatusAt: r.entered_status_at,
    attempt: r.attempt,
    maxAttempts: r.max_attempts,
    nextRetryAt: r.next_retry_at,
    progress,
    output,
    lastError,
    pid: r.pid,
    pidStartedAt: r.pid_started_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  } satisfies Task;
});
const bindTask = Effect.fnUntraced(function* (t: Task) {
  const input = yield* encode(t.input, t.id, "input_json");
  const progress = yield* encode(t.progress, t.id, "progress_json");
  const output = t.output !== null ? yield* encode(t.output, t.id, "output_json") : null;
  const error = t.lastError !== null ? yield* encode(t.lastError, t.id, "last_error_json") : null;
  return [
    t.id,
    t.kind,
    t.parentId,
    t.status,
    t.prevStatus,
    t.statusReason,
    t.enteredStatusAt,
    t.priority,
    t.groupKey,
    t.attempt,
    t.maxAttempts,
    t.nextRetryAt,
    t.pid,
    t.pidStartedAt,
    t.createdAt,
    t.updatedAt,
    input,
    progress,
    output,
    error,
  ];
});

export const layerSql = Layer.effect(TaskPersistence)(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const transaction = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      sql.withTransaction(effect).pipe(Effect.provideService(SqlClient.BeginTransaction, "BEGIN IMMEDIATE"));
    const upsertProgress = Effect.fnUntraced(function* (id: string, progress: TaskProgress) {
      const json = yield* encode(progress, id, "progress_json");
      yield* sql.unsafe(SQL.SQL_UPSERT_PROGRESS, [json, id]);
    });
    const upsert = Effect.fnUntraced(function* (input: PersistTransitionInput) {
      const params = yield* bindTask(input.task);
      yield* sql.unsafe(SQL.SQL_UPSERT_TASK, params);
      yield* upsertProgress(input.task.id, input.progress);
    });
    const remove = Effect.fnUntraced(function* (
      id: string
    ): Effect.fn.Return<void, import("./TaskPersistence.service.js").PersistenceError> {
      const children = yield* sql.unsafe("SELECT id FROM tasks WHERE parent_id = ?", [id]);
      for (const child of children) {
        const row = yield* decode(R.Id, child, id, "id");
        yield* remove(row.id);
      }
      yield* sql.unsafe("DELETE FROM attempts WHERE task_id = ?", [id]);
      yield* sql.unsafe("DELETE FROM tasks WHERE id = ?", [id]);
    });
    return TaskPersistence.of({
      hasTask: Effect.fnUntraced(function* (id) {
        const rows = yield* sql.unsafe(SQL.SQL_HAS_TASK, [id]);
        if (rows.length === 0) return false;
        yield* decode(R.Exists, rows[0], id, "present");
        return true;
      }),
      insertTask: Effect.fn("TaskPersistence")((task) =>
        transaction(
          bindTask(task).pipe(
            Effect.flatMap((params) => sql.unsafe(SQL.SQL_INSERT_TASK, params)),
            Effect.asVoid
          )
        )
      ),
      upsertTask: Effect.fn("TaskPersistence")((input) => transaction(upsert(input))),
      upsertTasks: Effect.fn("TaskPersistence")((inputs) =>
        transaction(Effect.forEach(inputs, upsert, { discard: true, concurrency: 1 }))
      ),
      upsertProgress,
      deleteTask: Effect.fn("TaskPersistence")((id) => transaction(remove(id))),
      insertAttempt: Effect.fnUntraced(function* (input) {
        const rows = yield* sql.unsafe("SELECT COUNT(*) AS n FROM attempts WHERE task_id = ?", [input.taskId]);
        const row = yield* decode(R.Count, rows[0], input.taskId, "attempt_count");
        yield* sql.unsafe(SQL.SQL_INSERT_ATTEMPT, [
          input.attemptId,
          input.taskId,
          Number(row.n) + 1,
          input.startedAt,
          input.rawArgsHash,
        ]);
      }),
      closeAttempt: Effect.fn("TaskPersistence")((i) =>
        sql
          .unsafe(SQL.SQL_CLOSE_ATTEMPT, [
            i.endedAt,
            i.exitCode,
            i.errorCategory,
            i.stdoutTail,
            i.stderrTail,
            i.attemptId,
          ])
          .pipe(Effect.asVoid)
      ),
      appendJournal: Effect.fn("TaskPersistence")((i) =>
        sql
          .unsafe(SQL.SQL_APPEND_JOURNAL, [
            i.ts,
            i.op,
            i.taskId,
            i.attemptId,
            i.pid,
            i.pidStartedAt,
            i.exitCode,
            i.signal,
          ])
          .pipe(Effect.asVoid)
      ),
      findOpenSpawns: Effect.gen(function* () {
        const rows = yield* sql.unsafe(SQL.SQL_FIND_OPEN_SPAWNS);
        const result: ProcessJournalRow[] = [];
        for (const raw of rows) {
          const r = yield* decode(R.RawJournal, raw, "unknown", "process_journal");
          result.push({
            seq: Number(r.seq),
            ts: r.ts,
            op: r.op,
            taskId: r.task_id,
            attemptId: r.attempt_id,
            pid: r.pid,
            pidStartedAt: r.pid_started_at,
            exitCode: r.exit_code,
            signal: r.signal,
          });
        }
        return result;
      }),
      loadAllTasks: Effect.gen(function* () {
        const rows = yield* sql.unsafe(SQL.SQL_LOAD_ALL_TASKS);
        const tasks: Task[] = [];
        for (const row of rows) {
          const decoded = yield* readTask(row).pipe(Effect.result);
          if (decoded._tag === "Success") tasks.push(decoded.success);
          else {
            if (decoded.failure.issue === "Malformed JSON") return yield* decoded.failure;
            yield* Effect.logError("task_queue_row_decode_failed", {
              taskId: decoded.failure.taskId,
              column: decoded.failure.column,
              issue: decoded.failure.issue,
            });
          }
        }
        return tasks;
      }),
      loadLatestAttempt: Effect.fnUntraced(function* (id) {
        const rows = yield* sql.unsafe(SQL.SQL_LOAD_LATEST_ATTEMPT, [id]);
        if (rows.length === 0) return null;
        const r = yield* decode(R.RawAttempt, rows[0], id, "attempt");
        return {
          id: r.id,
          taskId: r.task_id,
          attemptNumber: r.attempt_number,
          startedAt: r.started_at,
          endedAt: r.ended_at,
          exitCode: r.exit_code,
          errorCategory: r.error_category,
          stdoutTail: r.stdout_tail,
          stderrTail: r.stderr_tail,
          rawArgsHash: r.raw_args_hash,
        };
      }),
      maintenance: Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        const journalAgeMs = yield* JournalAgeMs;
        yield* sql.unsafe(SQL.SQL_AGE_JOURNAL, [now - journalAgeMs]);
        yield* sql.unsafe("PRAGMA wal_checkpoint(TRUNCATE)").pipe(Effect.ignore);
      }),
      close: Effect.void,
    });
  })
);

const memoryOperation = <A>(operation: () => A) =>
  Effect.try({
    try: operation,
    catch: (original) =>
      HostFailure.make({ original, legacyMessage: original instanceof Error ? original.message : String(original) }),
  });

export const makeMemory = () => {
  const tasks = M.empty<string, Task>();
  const progress = M.empty<string, TaskProgress>();
  const attempts = M.empty<string, AttemptRow>();
  const journal: ProcessJournalRow[] = [];
  let seq = 0;
  const get = (id: string) => Option.getOrUndefined(M.get(tasks, id));
  const upsert = (input: PersistTransitionInput) => {
    M.set(tasks, input.task.id, structuredClone(input.task));
    M.set(progress, input.task.id, structuredClone(input.progress));
  };
  const remove = (id: string): void => {
    for (const task of M.values(tasks)) if (task.parentId === id) remove(task.id);
    M.remove(tasks, id);
    M.remove(progress, id);
  };
  const key = (row: ProcessJournalRow) => `${row.taskId}:${row.attemptId ?? "null"}:${row.pid}`;
  const service = TaskPersistence.of({
    hasTask: Effect.fn("TaskPersistence")((id) => Effect.sync(() => M.has(tasks, id))),
    insertTask: Effect.fn("TaskPersistence")((task) =>
      memoryOperation(() => {
        M.set(tasks, task.id, structuredClone(task));
        M.set(progress, task.id, structuredClone(task.progress));
      })
    ),
    upsertTask: Effect.fn("TaskPersistence")((input) => memoryOperation(() => upsert(input))),
    upsertTasks: Effect.fn("TaskPersistence")((inputs) =>
      memoryOperation(() => {
        for (const input of structuredClone(inputs)) upsert(input);
      })
    ),
    upsertProgress: Effect.fn("TaskPersistence")((id, snapshot) =>
      memoryOperation(() => {
        M.set(progress, id, structuredClone(snapshot));
        const t = get(id);
        if (t !== undefined) t.progress = structuredClone(snapshot);
      })
    ),
    deleteTask: Effect.fn("TaskPersistence")((id) => Effect.sync(() => remove(id))),
    insertAttempt: Effect.fn("TaskPersistence")((i) =>
      Effect.sync(() => {
        M.set(attempts, i.attemptId, {
          id: i.attemptId,
          taskId: i.taskId,
          attemptNumber: get(i.taskId)?.attempt ?? 1,
          startedAt: i.startedAt,
          endedAt: null,
          exitCode: null,
          errorCategory: null,
          stdoutTail: null,
          stderrTail: null,
          rawArgsHash: i.rawArgsHash,
        });
      })
    ),
    closeAttempt: Effect.fn("TaskPersistence")((i) =>
      Effect.sync(() => {
        const a = Option.getOrUndefined(M.get(attempts, i.attemptId));
        if (a !== undefined)
          M.set(attempts, i.attemptId, {
            ...a,
            endedAt: i.endedAt,
            exitCode: i.exitCode,
            errorCategory: i.errorCategory,
            stdoutTail: i.stdoutTail,
            stderrTail: i.stderrTail,
          });
      })
    ),
    appendJournal: Effect.fn("TaskPersistence")((i) =>
      Effect.sync(() => {
        journal.push({ seq: ++seq, ...i });
      })
    ),
    findOpenSpawns: Effect.sync(() =>
      A.filter(
        journal,
        (row) =>
          row.op === "spawn" &&
          !A.some(journal, (close) => (close.op === "close" || close.op === "killed") && key(close) === key(row))
      )
    ),
    loadAllTasks: memoryOperation(() => Array.from(M.values(tasks), (t) => structuredClone(t))),
    loadLatestAttempt: Effect.fn("TaskPersistence")((id) =>
      Effect.sync(() => {
        let best: AttemptRow | null = null;
        for (const a of M.values(attempts))
          if (a.taskId === id && (best === null || a.attemptNumber > best.attemptNumber)) best = a;
        return best;
      })
    ),
    maintenance: Effect.void,
    close: Effect.void,
  });
  return { service, journalSnapshot: (): readonly ProcessJournalRow[] => journal };
};
export const layerMemory = Layer.sync(TaskPersistence)(() => makeMemory().service);
