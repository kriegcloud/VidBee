import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Scheduler from "effect/Scheduler";
import type * as SqlClient from "effect/sql/SqlClient";

export const sqlRule2 =
  "Database access suspended while holding a permit: database access rule 2 requires SQL and pure synchronous work only";

// Depth -1 reserves without opening a transaction; an explicit inner transaction
// still emits BEGIN at depth 0. Borrow an already contextual connection.
export const sqlSegment = (sql: SqlClient.SqlClient) => {
  const reserved = Effect.fnUntraced(function* <A, E, R>(work: Effect.Effect<A, E, R>) {
    const active = yield* Effect.serviceOption(sql.transactionService);
    if (Option.isSome(active)) return yield* work;
    const connection = yield* sql.reserve;
    return yield* work.pipe(Effect.provideService(sql.transactionService, [connection, -1]));
  });
  return <A, E, R>(work: Effect.Effect<A, E, R>) =>
    reserved(work).pipe(Effect.scoped, Effect.provideService(Scheduler.PreventSchedulerYield, true));
};

// Read at the original statement position. A child still pending after immediate
// evaluation violated the host's synchronous contract. Stop it before any write.
export const readSqlHost = Effect.fnUntraced(function* <A, E>(read: Effect.Effect<A, E>) {
  const fiber = yield* read.pipe(Effect.forkChild({ startImmediately: true }));
  const exit = fiber.pollUnsafe();
  if (exit !== undefined) return yield* exit;
  yield* Fiber.interrupt(fiber);
  return yield* Effect.die(sqlRule2);
});
