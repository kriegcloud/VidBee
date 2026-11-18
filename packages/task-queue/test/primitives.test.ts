import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { layer as admissionLayer } from "../src/SourceAdmission.layer.js";
import { SourceAdmission } from "../src/SourceAdmission.service.js";
import { layer as eventsLayer } from "../src/TaskEvents.layer.js";
import { TaskEvents } from "../src/TaskEvents.service.js";
import { layer as storeLayer } from "../src/TaskStore.layer.js";
import { TaskStore } from "../src/TaskStore.service.js";
import { EMPTY_PROGRESS } from "../src/types.js";
import type { Task } from "../src/types.js";

function task(id: string, createdAt: number): Task {
  return {
    id,
    createdAt,
    updatedAt: createdAt,
    enteredStatusAt: createdAt,
    kind: "video",
    parentId: null,
    input: { url: `https://example.com/${id}`, kind: "video" },
    priority: 10,
    groupKey: "primitive",
    status: "queued",
    prevStatus: null,
    statusReason: null,
    attempt: 0,
    maxAttempts: 3,
    nextRetryAt: null,
    progress: { ...EMPTY_PROGRESS },
    output: null,
    lastError: null,
    pid: null,
    pidStartedAt: null,
  };
}

layer(Layer.mergeAll(storeLayer, eventsLayer, admissionLayer))((it) => {
  it.effect("store preserves ordering, cursor fallback, identity and index transitions", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore;
      const first = task("primitives-first", 10);
      const second = task("primitives-second", 20);
      yield* store.insert(second);
      yield* store.insert(first);
      const stored = yield* store.get(first.id);
      expect(stored).toBe(first);
      const page = yield* store.list({ groupKey: "primitive", limit: 1 });
      expect(page.tasks).toEqual([first]);
      expect(page.nextCursor).toBe(first.id);
      expect((yield* store.list({ groupKey: "primitive", cursor: "absent", limit: 1 })).tasks).toEqual([first]);
      yield* store.update({ ...first, status: "running", groupKey: "active" });
      expect((yield* store.stats(4)).byStatus.running).toBe(1);
      expect((yield* store.list({ groupKey: "primitive" })).tasks).toEqual([second]);
      expect((yield* store.list({ query: "PRIMITIVES-SECOND" })).tasks).toEqual([second]);
      yield* store.remove(first.id);
      yield* store.remove(second.id);
    })
  );

  it.effect("store keeps cached ids and old index semantics for directly mutated records", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore;
      const original = task("primitives-mutable", 1);
      yield* store.insert(original);
      yield* store.list({ status: "queued" });
      original.status = "running";
      expect((yield* store.stats(1)).byStatus.queued).toBe(1);
      expect((yield* store.stats(1)).byStatus.running).toBe(0);
      expect((yield* store.list({ status: "queued" })).tasks).toEqual([original]);
      original.status = "queued";
      yield* store.remove(original.id);
    })
  );

  it.effect("events deliver typed listeners before wildcard, skip removals and survive a throw", () =>
    Effect.gen(function* () {
      const events = yield* TaskEvents;
      const seen: string[] = [];
      let removeLater = () => {};
      const removeFirst = yield* events.on("task-removed", () => {
        seen.push("first");
        removeLater();
      });
      removeLater = yield* events.on("task-removed", () => {
        seen.push("removed");
      });
      const removeThrow = yield* events.on("task-removed", () => {
        throw new Error("primitive listener fixture");
      });
      const removeWildcard = yield* events.subscribe(() => {
        seen.push("wildcard");
      });
      yield* events.emit({ type: "task-removed", taskId: "primitive", at: 1 });
      expect(seen).toEqual(["first", "wildcard"]);
      removeFirst();
      removeLater();
      removeThrow();
      removeWildcard();
    })
  );

  it.effect("admission reserves the queued waiter before notifying subscribers and deduplicates listeners", () =>
    Effect.gen(function* () {
      const admission = yield* SourceAdmission;
      const release = yield* admission.acquire("https://youtube.com/watch?v=first");
      const pending = yield* admission
        .acquire("https://youtu.be/second")
        .pipe(Effect.forkChild({ startImmediately: true }));
      let notifications = 0;
      let heldDuringNotification = false;
      const listener = Effect.gen(function* () {
        notifications++;
        const probe = yield* admission.tryAcquire("https://m.youtube.com/watch?v=probe");
        heldDuringNotification = Option.isNone(probe);
      });
      const unsubscribe = yield* admission.subscribe(listener);
      const unsubscribeAgain = yield* admission.subscribe(listener);
      yield* release;
      expect(notifications).toBe(1);
      expect(heldDuringNotification).toBe(true);
      const nextRelease = yield* Fiber.join(pending);
      unsubscribe();
      unsubscribeAgain();
      yield* nextRelease;
      const invalid = yield* admission.tryAcquire("invalid-url");
      expect(Option.isSome(invalid)).toBe(true);
      if (Option.isSome(invalid)) yield* invalid.value;
    })
  );
  it.effect("event unsubscribe keeps Set identity semantics after removal and re-registration", () =>
    Effect.gen(function* () {
      const events = yield* TaskEvents;
      const seen: string[] = [];
      const anchor = yield* events.on("task-removed", () => {
        seen.push("anchor");
      });
      const listener = () => {
        seen.push("target");
      };
      const oldUnsubscribe = yield* events.on("task-removed", listener);
      oldUnsubscribe();
      const newUnsubscribe = yield* events.on("task-removed", listener);
      oldUnsubscribe();
      yield* events.emit({ type: "task-removed", taskId: "reregister", at: 1 });
      expect(seen).toEqual(["anchor"]);
      newUnsubscribe();
      anchor();
    })
  );

  it.effect("admission unsubscribe removes re-registered effect identity", () =>
    Effect.gen(function* () {
      const admission = yield* SourceAdmission;
      let calls = 0;
      const listener = Effect.sync(() => {
        calls++;
      });
      const oldUnsubscribe = yield* admission.subscribe(listener);
      oldUnsubscribe();
      const newUnsubscribe = yield* admission.subscribe(listener);
      oldUnsubscribe();
      const release = yield* admission.acquire("https://example.com/unsubscribe");
      yield* release;
      expect(calls).toBe(0);
      newUnsubscribe();
    })
  );
});
