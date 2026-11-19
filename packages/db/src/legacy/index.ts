import { DrizzleQueryError } from "drizzle-orm/errors";
import * as A from "effect/Array";
import * as Cause from "effect/Cause";
import * as HashSet from "effect/HashSet";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Option from "effect/Option";
import * as P from "effect/Predicate";
import * as SqlError from "effect/sql/SqlError";
import { layerFromHandle } from "../BetterSqlite.driver.js";
import type BetterSqlite3 from "better-sqlite3";

type HandleRuntime = ReturnType<
  typeof ManagedRuntime.make<
    import("effect/sql/SqlClient").SqlClient | import("@effect/sql-sqlite-node/SqliteClient").SqliteClient,
    never
  >
>;
const runtimes: Array<{ readonly handle: BetterSqlite3.Database; readonly runtime: HandleRuntime }> = [];
export const runtimeForHandle = (handle: BetterSqlite3.Database) => {
  const cached = Option.getOrUndefined(A.findFirst(runtimes, (entry) => entry.handle === handle));
  if (cached !== undefined) return cached.runtime;
  const runtime = ManagedRuntime.make(layerFromHandle(handle));
  runtimes.push({ handle, runtime });
  return runtime;
};
export const releaseHandle = (handle: BetterSqlite3.Database): void => {
  const index = Option.getOrElse(
    A.findFirstIndex(runtimes, (entry) => entry.handle === handle),
    () => -1
  );
  const cached = runtimes[index];
  if (cached !== undefined) {
    cached.runtime.runSync(cached.runtime.disposeEffect);
    runtimes.splice(index, 1);
  }
};
export const rethrowDriverError = (cause: Cause.Cause<unknown>): never => {
  const pending: unknown[] = [cause];
  let seen = HashSet.empty<unknown>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (HashSet.has(seen, current)) continue;
    seen = HashSet.add(seen, current);
    if (Cause.isCause(current)) {
      for (const reason of current.reasons)
        pending.push(Cause.isFailReason(reason) ? reason.error : Cause.isDieReason(reason) ? reason.defect : undefined);
    } else if (SqlError.isSqlError(current)) {
      if (current.reason.cause instanceof Error && !SqlError.isSqlError(current.reason.cause))
        throw current.reason.cause;
      pending.push(current.reason.cause);
    } else if (P.hasProperty(current, "cause")) pending.push(current.cause);
  }
  throw Cause.squash(cause);
};

export const rethrowQueryError = (error: unknown): never => {
  if (error instanceof DrizzleQueryError && error.cause instanceof Error) throw error.cause;
  throw error;
};
