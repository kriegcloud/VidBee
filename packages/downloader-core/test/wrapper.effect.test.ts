import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Str from "effect/String";
import { advanceWrapper, initialWrapperState, wrapperError } from "../src/YtDlpWrapper.js";

it.effect("wrapper emits every progress before its bracket event and the original continuation", () =>
  Effect.sync(() => {
    const chunk = new TextEncoder().encode(
      "[download]  12.5% of ~8MiB at 2MiB/s ETA 00:03\r[Merger] done\n[download]  75% of 8MiB\n"
    );
    const result = advanceWrapper({ state: initialWrapperState(), event: { _tag: "stdout", chunk } });
    expect(result.observations).toEqual([
      { _tag: "progress", payload: { percent: 12.5, totalSize: "8MiB", currentSpeed: "2MiB/s", eta: "00:03" } },
      { _tag: "ytDlpEvent", eventType: "download", eventData: "  12.5% of ~8MiB at 2MiB/s ETA 00:03" },
      { _tag: "ytDlpEvent", eventType: "Merger", eventData: " done" },
      { _tag: "progress", payload: { percent: 75, totalSize: "8MiB", currentSpeed: undefined, eta: undefined } },
      { _tag: "ytDlpEvent", eventType: "download", eventData: "  75% of 8MiB" },
      { _tag: "stdout", chunk },
    ]);
  })
);

it.effect("wrapper retains full stderr and raw error identity until nullable close", () =>
  Effect.sync(() => {
    const original = { toString: () => "original process failure" };
    const state = advanceWrapper({ state: initialWrapperState(), event: { _tag: "rawError", error: original } }).state;
    expect(state.processError).toBe(original);
    const stderr = Str.repeat(9000)("x");
    const written = advanceWrapper({ state, event: { _tag: "stderr", chunk: new TextEncoder().encode(stderr) } }).state;
    const completed = advanceWrapper({
      state: written,
      event: { _tag: "complete", outcome: { _tag: "Raw", code: null, signal: "SIGTERM", killed: false } },
    });
    const observation = completed.observations[0];
    expect(observation?._tag).toBe("error");
    if (observation?._tag === "error")
      expect(observation.error).toEqual(wrapperError({ code: null, processError: original, stderr }));
    expect(
      advanceWrapper({
        state: written,
        event: { _tag: "complete", outcome: { _tag: "Raw", code: 7, signal: null, killed: true } },
      }).observations
    ).toEqual([{ _tag: "close", code: 7 }]);
  })
);

it.effect("wrapper decodes chunks independently without line or UTF-8 carry", () =>
  Effect.sync(() => {
    const first = advanceWrapper({
      state: initialWrapperState(),
      event: { _tag: "stdout", chunk: new TextEncoder().encode("[down") },
    });
    expect(first.observations[0]).toEqual({ _tag: "ytDlpEvent", eventType: "down", eventData: "[down" });
    const second = advanceWrapper({
      state: first.state,
      event: { _tag: "stdout", chunk: new TextEncoder().encode("load]  50% of 1MiB\n") },
    });
    expect(second.observations).toHaveLength(1);
    const invalid = advanceWrapper({ state: first.state, event: { _tag: "stderr", chunk: new Uint8Array([0xc3]) } });
    expect(invalid.state.stderr).toBe("�");
  })
);
