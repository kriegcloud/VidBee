import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { layerMemory } from "../src/TaskPersistence.layer.js";
import { TaskPersistence } from "../src/TaskPersistence.service.js";
import { task } from "./persistence-support.js";

layer(layerMemory, { buildPerTest: true })((it) => {
  it.effect("memory clones snapshots and deletes descendants", () =>
    Effect.gen(function* () {
      const p = yield* TaskPersistence;
      const original = task("parent");
      yield* p.insertTask(original);
      yield* p.insertTask({ ...task("child"), parentId: "parent" });
      original.input.url = "changed";
      const loaded = yield* p.loadAllTasks;
      expect(loaded[0]?.input.url).toBe("synthetic");
      expect(loaded[0]?.input.options).toEqual({ future: { retained: true } });
      yield* p.deleteTask("parent");
      const observed1 = yield* p.loadAllTasks;
      expect(observed1).toEqual([]);
    })
  );
  it.effect("memory clones an entire batch before mutation and types clone failures", () =>
    Effect.gen(function* () {
      const p = yield* TaskPersistence;
      const original = task("parent");
      yield* p.insertTask(original);
      const changed = { ...original, status: "paused" as const };
      const invalid = { ...task("invalid"), input: { ...original.input, options: { uncloneable: () => undefined } } };
      const failure = yield* p
        .upsertTasks([
          { task: changed, progress: changed.progress },
          { task: invalid, progress: invalid.progress },
        ])
        .pipe(Effect.flip);
      expect(failure._tag).toBe("HostFailure");
      const rows = yield* p.loadAllTasks;
      expect(rows.length).toBe(1);
      expect(rows[0]?.status).toBe("queued");
    })
  );
});
