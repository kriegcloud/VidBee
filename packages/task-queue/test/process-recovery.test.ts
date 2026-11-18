import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { LegacyTiming } from "../src/LegacyTiming.service.js";
import { ProcessControl } from "../src/ProcessControl.service.js";
import { layer as registryLayer } from "../src/process/ProcessRegistry.layer.js";
import { ProcessRegistry } from "../src/process/ProcessRegistry.service.js";
import { QueueTimers } from "../src/QueueTimers.service.js";
import { layerMemory } from "../src/TaskPersistence.layer.js";
import { TaskPersistence } from "../src/TaskPersistence.service.js";

const dependencies = (signals: string[], changing = false) => {
  let start = 2000;
  return Layer.mergeAll(
    layerMemory,
    LegacyTiming.layer,
    Layer.succeed(ProcessControl)({
      kill: Effect.fn("test.kill")((_pid, signal) =>
        Effect.sync(() => {
          signals.push(signal);
        })
      ),
      isAlive: Effect.fn("test.isAlive")(() => Effect.succeed(true)),
      startTime: Effect.fn("test.startTime")(() => Effect.sync(() => start)),
    }),
    Layer.succeed(QueueTimers)({
      now: Effect.succeed(0),
      sleep: Effect.fn("test.sleep")((_ms) =>
        Effect.sync(() => {
          if (changing) start = 3000;
        })
      ),
      after: Effect.fn("test.after")(() => Effect.succeed(Effect.void)),
    })
  );
};
for (const recorded of [null, 1000, 1999]) {
  const signals: string[] = [];
  layer(registryLayer.pipe(Layer.provideMerge(dependencies(signals))))((it) => {
    it.effect(`recovery does not signal an unverified process (${recorded})`, () =>
      Effect.gen(function* () {
        const persist = yield* TaskPersistence;
        const registry = yield* ProcessRegistry;
        yield* persist.appendJournal({
          ts: 0,
          op: "spawn",
          taskId: "a",
          attemptId: "one",
          pid: 1,
          pidStartedAt: recorded,
          exitCode: null,
          signal: null,
        });
        const rows = yield* registry.reconcile;
        expect(signals).toEqual([]);
        expect(rows[0]?.killed).toBe(false);
        const open = yield* persist.findOpenSpawns;
        expect(open.length).toBe(0);
      })
    );
  });
}
for (const mode of ["reconcile", "cancel"] as const) {
  const signals: string[] = [];
  layer(registryLayer.pipe(Layer.provideMerge(dependencies(signals, true))))((it) => {
    it.effect(`${mode} rechecks PID identity before escalating`, () =>
      Effect.gen(function* () {
        const registry = yield* ProcessRegistry;
        yield* registry.recordSpawn({
          taskId: "a",
          attemptId: "one",
          pid: 1,
          pidStartedAt: 2000,
          kind: "yt-dlp",
          spawnedAt: 0,
        });
        if (mode === "reconcile") yield* registry.reconcile;
        else yield* registry.cancel("a", "one");
        expect(signals).toEqual(["SIGTERM"]);
      })
    );
  });
}
const signals: string[] = [];
layer(registryLayer.pipe(Layer.provideMerge(dependencies(signals))))((it) => {
  it.effect("verified surviving orphan receives escalation", () =>
    Effect.gen(function* () {
      const registry = yield* ProcessRegistry;
      yield* registry.recordSpawn({
        taskId: "a",
        attemptId: "one",
        pid: 1,
        pidStartedAt: 2000,
        kind: "yt-dlp",
        spawnedAt: 0,
      });
      const rows = yield* registry.reconcile;
      expect(signals).toEqual(["SIGTERM", "SIGKILL"]);
      expect(rows[0]?.killed).toBe(true);
    })
  );
});
