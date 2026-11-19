import { expect, it, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Str from "effect/String";
import {
  classify,
  classifyWithDateParser,
  parseRetryAfter,
  parseRetryAfterWithDateParser,
  takeStderrTail,
  virtualError,
} from "../src/classifier/index.js";
import { isOutputComplete } from "../src/complete.js";
import { isLegalTransition, transition } from "../src/fsm/index.js";
import { projectTaskToLegacy } from "../src/projection/index.js";
import { computeBackoffMs } from "../src/scheduler/RetryScheduler.layer.js";
import { layer as eventLayer } from "../src/TaskEvents.layer.js";
import { TaskEvents } from "../src/TaskEvents.service.js";
import { layer as storeLayer } from "../src/TaskStore.layer.js";
import { TaskStore } from "../src/TaskStore.service.js";
import { canAdmitTranscription } from "../src/types.js";
import { hashRawArgs } from "../src/util/sha256.js";
import { task } from "./fixtures.js";

const falsy: ReadonlyArray<unknown> = [null, 0, "", Number.NaN, false, undefined];
it("M2: raw argument hashing preserves every old falsy sentinel", () => {
  for (const value of falsy) expect(Reflect.apply(hashRawArgs, undefined, [value])).toBe("sha256:none");
});
layer(storeLayer, { buildPerTest: true })((it) => {
  it.effect("M3: all old falsy optional filters are absent; only nullish query skips trim", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore;
      yield* store.insert(task("a", { status: "queued" }));
      yield* store.insert(task("b", { status: "completed", parentId: "a" }));
      for (const value of falsy) {
        for (const key of ["status", "groupKey", "parentId", "kind"]) {
          const result = yield* store.list({ [key]: value });
          expect(result.tasks.length).toBe(2);
        }
      }
      for (const value of [null, undefined, ""]) {
        const key: string = "query";
        const result = yield* store.list({ [key]: value });
        expect(result.tasks.length).toBe(2);
      }
    })
  );
});
layer(eventLayer)((it) => {
  it.effect("M5/M10: old stale unsubscribe removes a replacement bucket", () =>
    Effect.gen(function* () {
      const bus = yield* TaskEvents;
      const calls: string[] = [];
      const off = yield* bus.subscribe(() => calls.push("first"));
      off();
      yield* bus.subscribe(() => calls.push("replacement"));
      off();
      yield* bus.emit({ type: "task-removed", taskId: "a", at: 0 });
      expect(calls).toEqual([]);
    })
  );
});

it("sweep: projection ignores all old falsy optional output, error and metadata values", () => {
  for (const value of falsy) {
    const base = task("projection", { status: "failed" });
    for (const key of ["output", "lastError"]) {
      const projected = projectTaskToLegacy({ ...base, [key]: value });
      expect(projected.errorCategory).toBeUndefined();
      expect(projected.fileSize).toBeUndefined();
    }
    const projected = projectTaskToLegacy({ ...base, input: { ...base.input, options: { tags: value } } });
    expect(projected.tags).toBeUndefined();
  }
});
it("sweep: FSM rejects falsy success output and ignores falsy classified errors", () => {
  for (const value of falsy) {
    const base = task("fsm", { status: "running" });
    const outputKey: string = "output";
    expect(
      Result.isFailure(transition(base, "completed", { trigger: "finalize-success", now: 0, [outputKey]: value }))
    ).toBe(true);
    const errorKey: string = "error";
    const result = transition(base, "failed", { trigger: "finalize-error", now: 0, [errorKey]: value });
    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result)) expect(result.success.lastError).toBe(null);
  }
});
it("dual sweep: pure classifier, FSM, completion, hashing-independent capacity and retry overloads agree", () => {
  const input = { stderr: "HTTP Error 429", retryAfterHeader: "12" };
  expect(classify(0)(input)).toEqual(classify(input, 0));
  expect(parseRetryAfter(0)("12")).toBe(parseRetryAfter("12", 0));
  expect(parseRetryAfterWithDateParser(0, () => 10)("date")).toBe(parseRetryAfterWithDateParser("date", 0, () => 10));
  expect(classifyWithDateParser(0, () => 10)(input)).toEqual(classifyWithDateParser(input, 0, () => 10));
  expect(virtualError("message")("stalled")).toEqual(virtualError("stalled", "message"));
  expect(takeStderrTail(20)(Str.repeat(100)("x"))).toBe(takeStderrTail(Str.repeat(100)("x"), 20));
  expect(takeStderrTail()("short")).toBe("short");
  expect(takeStderrTail(undefined)("short")).toBe("short");
  expect(isLegalTransition("running")("queued")).toBe(isLegalTransition("queued", "running"));
  const base = task("dual", { status: "queued" });
  expect(transition("running", { trigger: "dispatch", now: 0 })(base)).toEqual(
    transition(base, "running", { trigger: "dispatch", now: 0 })
  );
  const output = { filePath: "/fixture", size: 1, durationMs: null, sha256: null };
  const check = { filePresent: () => true };
  expect(isOutputComplete(output, check)("video")).toBe(isOutputComplete("video", output, check));
  expect(canAdmitTranscription(2)(1)).toBe(canAdmitTranscription(1, 2));
  expect(computeBackoffMs(null, () => 0.5)(2)).toBe(computeBackoffMs(2, null, () => 0.5));
});
