import * as Cause from "effect/Cause";
import * as HashSet from "effect/HashSet";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as MutableHashMap from "effect/MutableHashMap";
import * as Option from "effect/Option";
import * as P from "effect/Predicate";
import * as SqlError from "effect/sql/SqlError";
import { layerFromHandle } from "../BetterSqlite.driver.js";
import type BetterSqlite3 from "better-sqlite3";

const runtimes = MutableHashMap.empty<
  BetterSqlite3.Database,
  ReturnType<
    typeof ManagedRuntime.make<
      import("effect/sql/SqlClient").SqlClient | import("@effect/sql-sqlite-node/SqliteClient").SqliteClient,
      never
    >
  >
>();
export const runtimeForHandle = (handle: BetterSqlite3.Database) => {
  const cached = MutableHashMap.get(runtimes, handle);
  if (Option.isSome(cached)) return cached.value;
  const runtime = ManagedRuntime.make(layerFromHandle(handle));
  MutableHashMap.set(runtimes, handle, runtime);
  return runtime;
};
export const releaseHandle = (handle: BetterSqlite3.Database): void => {
  const cached = MutableHashMap.get(runtimes, handle);
  if (Option.isSome(cached)) {
    cached.value.runSync(cached.value.disposeEffect);
    MutableHashMap.remove(runtimes, handle);
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
