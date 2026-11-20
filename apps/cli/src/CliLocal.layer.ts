import * as Migrations from "@vidbee/db/Migrations.layer";
import { DbSchema } from "@vidbee/db/Migrations.service";
import { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import * as Output from "@vidbee/task-queue/OutputProbe.layer";
import * as Processes from "@vidbee/task-queue/ProcessControl.driver";
import * as Random from "@vidbee/task-queue/QueueRandom.layer";
import * as Timers from "@vidbee/task-queue/QueueTimers.layer";
import * as Admission from "@vidbee/task-queue/SourceAdmission.layer";
import * as Events from "@vidbee/task-queue/TaskEvents.layer";
import { TaskExecutor } from "@vidbee/task-queue/TaskExecutor.service";
import * as Persistence from "@vidbee/task-queue/TaskPersistence.layer";
import * as Queue from "@vidbee/task-queue/TaskQueue.layer";
import { TaskQueue } from "@vidbee/task-queue/TaskQueue.service";
import * as Store from "@vidbee/task-queue/TaskStore.layer";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as S from "effect/Schema";
import * as Scope from "effect/Scope";
import * as SqlClient from "effect/sql/SqlClient";
import { CliFailure } from "./Cli.errors.js";
import { CliLocal } from "./CliLocal.service.js";
import { executorLayer } from "./CliLocalExecutor.layer.js";
import { originalMessage } from "./transport/descriptor.js";
import type { DownloadHost } from "@vidbee/downloader-core/DownloadHost.service";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import type { CliHost } from "./CliHost.service.js";
import type { LocalSession } from "./Connection.model.js";

const failure = (cause: unknown) => CliFailure.make({ message: originalMessage(cause), cause });
/** Each open owns a new kernel/store/events scope and a default native executor.
 * Callers may supply an executor and, for SQLite, their already owned SqlClient. */
export const CliLocalLive = Layer.effect(
  CliLocal,
  Effect.gen(function* () {
    const dependencies = yield* Effect.context<
      DownloadHost | CliHost | Path.Path | FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner
    >();
    const suppliedExecutor = yield* Effect.serviceOption(TaskExecutor);
    const sql = yield* Effect.serviceOption(SqlClient.SqlClient);
    const parent = yield* Effect.scope;
    return CliLocal.of({
      open: Effect.fn("CliLocal.open")(function* (options = {}) {
        if (options.persist === "sqlite" && sql._tag === "None")
          return yield* CliFailure.make({ message: "native SQLite requires a supplied SqlClient" });
        if (options.persist === "sqlite" && sql._tag === "Some") {
          const initialized = yield* Layer.buildWithScope(
            Migrations.layer.pipe(Layer.provide(Layer.succeed(SqlClient.SqlClient, sql.value))),
            parent
          );
          yield* Context.get(initialized, DbSchema).applyTaskQueue.pipe(Effect.mapError(failure));
          yield* Effect.gen(function* () {
            yield* sql.value.unsafe("PRAGMA journal_mode = WAL");
            yield* sql.value.unsafe("PRAGMA synchronous = NORMAL");
            yield* sql.value.unsafe("PRAGMA foreign_keys = ON");
          }).pipe(Effect.ignore);
        }

        const persistence =
          options.persist === "sqlite" && sql._tag === "Some"
            ? Persistence.layerSql.pipe(Layer.provide(Layer.succeed(SqlClient.SqlClient, sql.value)))
            : Persistence.layerMemory;
        const base = Layer.mergeAll(
          Admission.layer,
          Store.layer,
          Events.layer,
          persistence,
          Timers.layer,
          Random.layer,
          Output.layer,
          Processes.layer,
          LegacyTiming.layer,
          suppliedExecutor._tag === "Some"
            ? Layer.succeed(TaskExecutor, suppliedExecutor.value)
            : executorLayer(options)
        );
        const internal = Queue.internalLayers({ maxConcurrency: options.maxConcurrency ?? 4 });
        const graph = Queue.layer({ maxConcurrency: options.maxConcurrency ?? 4 }).pipe(
          Layer.provide(Layer.mergeAll(base, internal.pipe(Layer.provide(base))))
        );
        const scope = yield* Effect.acquireRelease(Scope.make(), (scope) => Scope.close(scope, Exit.void)).pipe(
          Effect.provideService(Scope.Scope, parent)
        );
        const close = Scope.close(scope, Exit.void);
        const context = yield* Layer.buildWithScope(graph, scope).pipe(
          Effect.provide(dependencies),
          Effect.onError(() => close)
        );
        const queue = Context.get(context, TaskQueue);
        const stop = yield* Effect.cached(queue.stop.pipe(Effect.ignore, Effect.uninterruptible));
        yield* Scope.addFinalizer(scope, stop);
        yield* queue.start.pipe(
          Effect.mapError(failure),
          Effect.onError(() => close)
        );
        const shutdown = stop.pipe(Effect.ensuring(close));
        const id = (value: unknown) => S.decodeUnknownEffect(S.String)(value).pipe(Effect.mapError(failure));
        const get = Effect.fn("CliLocal.get")(function* (value: unknown) {
          const key = yield* id(value);
          const task = yield* queue.get(key);
          if (task === undefined) return yield* CliFailure.make({ message: `task ${key} not found` });
          return task;
        });
        const session: LocalSession = {
          shutdown,
          get,
          stats: queue.stats,
          list: Effect.fn("CliLocal.list")(function* (input) {
            const page = yield* queue.list({ ...input, cursor: input.cursor ?? null });
            return { items: [...page.tasks], nextCursor: page.nextCursor ?? null };
          }),
          add: Effect.fn("CliLocal.add")(function* (request) {
            const { id } = yield* queue.add(request).pipe(Effect.mapError(failure));
            return { id, task: yield* get(id) };
          }),
          removeFromHistory: (value) =>
            id(value).pipe(Effect.flatMap(queue.removeFromHistory), Effect.mapError(failure)),
          cancel: (value) => id(value).pipe(Effect.flatMap(queue.cancel), Effect.mapError(failure)),
          pause: (value, reason) =>
            id(value).pipe(
              Effect.flatMap((id) => queue.pause(id, reason)),
              Effect.mapError(failure)
            ),
          resume: (value) => id(value).pipe(Effect.flatMap(queue.resume), Effect.mapError(failure)),
          retry: (value) => id(value).pipe(Effect.flatMap(queue.retryManual), Effect.mapError(failure)),
        };
        return session;
      }),
    });
  })
);
