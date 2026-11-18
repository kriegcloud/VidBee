import { expect, layer } from "@effect/vitest";
import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import { layer as storeLayer } from "../src/TaskStore.layer.js";
import { TaskStore } from "../src/TaskStore.service.js";
import { task as base } from "./persistence-support.js";

const task = (id: string) => ({ ...base(id), status: "completed" as const, createdAt: 1 });
layer(storeLayer, { buildPerTest: true })((it) => {
  it.effect("cached pages preserve ordering and expose current task fields", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore;
      yield* store.insert({ ...task("c"), createdAt: 2 });
      yield* store.insert(task("b"));
      yield* store.insert(task("a"));
      const first = yield* store.list({ limit: 1 });
      expect(A.map(first.tasks, (t) => t.id)).toEqual(["a"]);
      const b = yield* store.get("b");
      expect(b).toBeDefined();
      if (b === undefined) return;
      yield* store.update({ ...b, input: { kind: "video", url: "updated" } });
      const next = yield* store.list({ cursor: first.nextCursor, limit: 1 });
      expect(next.tasks[0]?.id).toBe("b");
      expect(next.tasks[0]?.input.url).toBe("updated");
      const last = yield* store.list({ cursor: next.nextCursor });
      expect(A.map(last.tasks, (t) => t.id)).toEqual(["c"]);
    })
  );
  it.effect("membership and order changes invalidate cached listings", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore;
      yield* store.insert({ ...task("a"), parentId: "p" });
      yield* store.insert({ ...task("b"), parentId: "p" });
      const first = yield* store.list({ parentId: "p", status: "completed" });
      expect(first.tasks.length).toBe(2);
      const a = yield* store.get("a");
      expect(a).toBeDefined();
      if (a === undefined) return;
      yield* store.update({ ...a, status: "failed", parentId: "q", groupKey: "new" });
      const remaining = yield* store.list({ parentId: "p", status: "completed" });
      expect(A.map(remaining.tasks, (t) => t.id)).toEqual(["b"]);
      const grouped = yield* store.list({ groupKey: "new", status: "failed" });
      expect(grouped.tasks[0]?.id).toBe("a");
      const updated = yield* store.get("a");
      expect(updated).toBeDefined();
      if (updated === undefined) return;
      yield* store.update({ ...updated, createdAt: 3 });
      const reordered = yield* store.list();
      expect(A.map(reordered.tasks, (t) => t.id)).toEqual(["b", "a"]);
      yield* store.remove("b");
      const removed = yield* store.list();
      expect(A.map(removed.tasks, (t) => t.id)).toEqual(["a"]);
      yield* store.insert(task("c"));
      const inserted = yield* store.list();
      expect(A.map(inserted.tasks, (t) => t.id)).toEqual(["c", "a"]);
    })
  );
});
