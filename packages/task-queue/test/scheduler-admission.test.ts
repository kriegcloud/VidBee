import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { LegacyTiming } from "../src/LegacyTiming.service.js";
import { layer as admissionLayer } from "../src/SourceAdmission.layer.js";
import { SourceAdmission } from "../src/SourceAdmission.service.js";
import { layer as storeLayer } from "../src/TaskStore.layer.js";
import { TaskStore } from "../src/TaskStore.service.js";

const timingLayer = LegacyTiming.layer;

import { make } from "../src/scheduler/Scheduler.layer.js";
import { task } from "./persistence-support.js";

const dependencies = Layer.mergeAll(storeLayer, admissionLayer, timingLayer);
layer(dependencies, { buildPerTest: true })((it) => {
  it.effect("a map blocks same-platform downloads without consuming unrelated download slots", () =>
    Effect.gen(function* () {
      const admission = yield* SourceAdmission;
      const store = yield* TaskStore;
      const releaseMap = yield* admission.acquire("https://instagram.com/profile/");
      expect(releaseMap).toBeDefined();
      yield* store.insert({ ...task("first"), input: { kind: "video", url: "https://www.instagram.com/p/one/" } });
      yield* store.insert({ ...task("second"), input: { kind: "video", url: "https://instagram.com/reel/two/" } });
      yield* store.insert({ ...task("other"), input: { kind: "video", url: "https://www.youtube.com/watch?v=three" } });
      const started: string[] = [];
      const scheduler = yield* make({
        maxConcurrency: 2,
        dispatch: Effect.fn("test.dispatch")((id) =>
          Effect.sync(() => {
            started.push(id);
            return true;
          })
        ),
        demote: () => Effect.void,
      });
      yield* scheduler.enqueue("first", 0);
      yield* scheduler.enqueue("second", 0);
      yield* scheduler.enqueue("other", 0);
      expect(started).toEqual(["other"]);
      yield* releaseMap;
      yield* Effect.yieldNow;
      expect(started).toEqual(["other", "first"]);
      yield* scheduler.releaseSlot("first");
      expect(started).toEqual(["other", "first", "second"]);
      yield* scheduler.releaseSlot("second");
      yield* scheduler.releaseSlot("other");
    })
  );
  it.effect("failed dispatch releases platform admission for following work", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore;
      yield* store.insert(task("failed"));
      yield* store.insert(task("next"));
      const started: string[] = [];
      const scheduler = yield* make({
        maxConcurrency: 2,
        dispatch: Effect.fn("test.dispatch")((id) =>
          Effect.sync(() => {
            started.push(id);
            return id !== "failed";
          })
        ),
        demote: () => Effect.void,
      });
      yield* scheduler.enqueue("failed", 0);
      yield* scheduler.enqueue("next", 0);
      expect(started).toEqual(["failed", "next"]);
      yield* scheduler.releaseSlot("next");
    })
  );
  it.effect("sweeping dead slots releases platform admission and preserves live group counts", () =>
    Effect.gen(function* () {
      const admission = yield* SourceAdmission;
      const store = yield* TaskStore;
      yield* store.insert({
        ...task("dead"),
        groupKey: "instagram",
        input: { kind: "video", url: "https://instagram.com/p/one/" },
      });
      yield* store.insert({
        ...task("live"),
        groupKey: "youtube",
        input: { kind: "video", url: "https://youtu.be/two" },
      });
      const scheduler = yield* make({
        maxConcurrency: 2,
        dispatch: () => Effect.succeed(true),
        demote: () => Effect.void,
      });
      yield* scheduler.enqueue("dead", 0);
      yield* scheduler.enqueue("live", 0);
      const unavailable = yield* admission.tryAcquire("https://instagram.com/p/three/");
      expect(Option.isNone(unavailable)).toBe(true);
      yield* store.remove("dead");
      yield* scheduler.sweepDeadSlots((id) => id === "live");
      const stats = yield* scheduler.stats;
      expect(stats.perGroup).toEqual({ youtube: 1 });
      const release = yield* admission.tryAcquire("https://instagram.com/p/three/");
      expect(Option.isSome(release)).toBe(true);
      if (Option.isSome(release)) yield* release.value;
      yield* scheduler.releaseSlot("live");
    })
  );
  it.effect("ASR waits for download capacity while source admission still serializes downloads", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore;
      yield* store.insert({ ...task("first"), input: { kind: "video", url: "https://instagram.com/p/one/" } });
      yield* store.insert({ ...task("second"), input: { kind: "video", url: "https://instagram.com/p/two/" } });
      yield* store.insert({ ...task("asr"), kind: "transcription", groupKey: "transcription" });
      const dispatched: string[] = [];
      const scheduler = yield* make({
        maxConcurrency: 3,
        dispatch: Effect.fn("test.dispatch")((id) =>
          Effect.sync(() => {
            dispatched.push(id);
            return true;
          })
        ),
        demote: () => Effect.void,
      });
      yield* scheduler.setMaxConcurrentDownloads(1);
      yield* scheduler.enqueue("first", 0);
      yield* scheduler.enqueue("second", 0);
      yield* scheduler.enqueue("asr", 1);
      expect(dispatched).toEqual(["first"]);
      yield* scheduler.releaseSlot("first");
      expect(dispatched).toEqual(["first", "second"]);
      yield* scheduler.releaseSlot("second");
      expect(dispatched).toEqual(["first", "second", "asr"]);
      yield* scheduler.releaseSlot("asr");
    })
  );
});
