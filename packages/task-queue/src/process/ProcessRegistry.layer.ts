import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as MutableHashMap from "effect/MutableHashMap";
import * as Option from "effect/Option";
import { LegacyTiming } from "../LegacyTiming.service.js";
import { ProcessControl } from "../ProcessControl.service.js";
import { QueueTimers } from "../QueueTimers.service.js";
import { TaskPersistence } from "../TaskPersistence.service.js";
import { ProcessRegistry } from "./ProcessRegistry.service.js";
import type { JournalAppendInput } from "../Persist.model.js";
import type { ProcessHandle, ReconciledProcess } from "./ProcessRegistry.service.js";
export const make = Effect.fnUntraced(function* (killGracePeriodMs = 10000) {
  const persist = yield* TaskPersistence;
  const timing = yield* LegacyTiming;
  const timers = yield* QueueTimers;
  const processes = yield* ProcessControl;
  const handles = MutableHashMap.empty<string, ProcessHandle>();
  const key = (taskId: string, attemptId: string) => `${taskId}:${attemptId}`;
  const same = Effect.fnUntraced(function* (pid: number, startedAt: number | null) {
    if (!Number.isInteger(pid) || pid <= 0 || startedAt == null) return false;
    if (!(yield* processes.isAlive(pid))) return false;
    const current = yield* processes.startTime(pid);
    return current != null && Number.isFinite(current) && current === startedAt;
  });
  const kill = Effect.fnUntraced(function* (pid: number, pidStartedAt: number | null, onTerm: () => void) {
    let signal: "SIGTERM" | "SIGKILL" | null = null;
    if (yield* same(pid, pidStartedAt)) {
      yield* Effect.gen(function* () {
        yield* processes.kill(pid, "SIGTERM");
        onTerm();
        signal = "SIGTERM";
        yield* timers.sleep(killGracePeriodMs);
        if (yield* same(pid, pidStartedAt)) {
          yield* processes.kill(pid, "SIGKILL");
          signal = "SIGKILL";
        }
      }).pipe(Effect.ignore);
    }
    return signal;
  });
  const append = Effect.fnUntraced(function* (row: Omit<JournalAppendInput, "ts">) {
    const ts = yield* timers.now;
    yield* persist.appendJournal({ ...row, ts });
    yield* timing.turn("process.appendJournal");
  });
  return ProcessRegistry.of({
    recordSpawn: Effect.fnUntraced(function* (input) {
      const handle = { ...input, pidStartedAt: input.pidStartedAt ?? (yield* processes.startTime(input.pid)) };
      MutableHashMap.set(handles, key(handle.taskId, handle.attemptId), handle);
      yield* persist.appendJournal({
        ts: handle.spawnedAt,
        op: "spawn",
        taskId: handle.taskId,
        attemptId: handle.attemptId,
        pid: handle.pid,
        pidStartedAt: handle.pidStartedAt,
        exitCode: null,
        signal: null,
      });
    }),
    recordClose: Effect.fnUntraced(function* (taskId, attemptId, exitCode, signal) {
      const handle = Option.getOrUndefined(MutableHashMap.get(handles, key(taskId, attemptId)));
      MutableHashMap.remove(handles, key(taskId, attemptId));
      yield* append({
        op: "close",
        taskId,
        attemptId,
        pid: handle?.pid ?? -1,
        pidStartedAt: handle?.pidStartedAt ?? null,
        exitCode,
        signal,
      });
      yield* timing.turn("process.recordClose");
    }),
    cancel: Effect.fnUntraced(function* (taskId, attemptId) {
      const handle = Option.getOrUndefined(MutableHashMap.get(handles, key(taskId, attemptId)));
      if (handle === undefined) return;
      const signal = yield* kill(handle.pid, handle.pidStartedAt, () => {});
      MutableHashMap.remove(handles, key(taskId, attemptId));
      yield* append({
        op: "killed",
        taskId,
        attemptId,
        pid: handle.pid,
        pidStartedAt: handle.pidStartedAt,
        exitCode: null,
        signal,
      });
    }),
    reconcile: Effect.gen(function* () {
      const open = yield* persist.findOpenSpawns;
      const reconciled: ReconciledProcess[] = [];
      for (const row of open) {
        let killed = false;
        const signal = yield* kill(row.pid, row.pidStartedAt, () => {
          killed = true;
        });
        yield* append({
          op: "killed",
          taskId: row.taskId,
          attemptId: row.attemptId,
          pid: row.pid,
          pidStartedAt: row.pidStartedAt,
          exitCode: null,
          signal,
        });
        reconciled.push({ taskId: row.taskId, attemptId: row.attemptId, pid: row.pid, killed });
      }
      return reconciled;
    }),
    size: Effect.sync(() => MutableHashMap.size(handles)),
  });
});
export const layer = Layer.effect(ProcessRegistry, make());
