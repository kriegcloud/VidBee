import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as References from "effect/References";
import * as S from "effect/Schema";
import { vi } from "vitest";
import { clientLoggerLayer, clientSinkLayer, nodeLoggerLayer, nodeSinkLayer } from "../src/Logger.layer.js";
import { CaughtErrorEvent } from "../src/Logger.model.js";
import { logger } from "../src/legacy/client.js";
import { initVidbeeLogger, logCaughtError } from "../src/legacy/node.js";

const fake = vi.hoisted(() => {
  const initialization: unknown[] = [];
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    init: vi.fn(),
    initClient: vi.fn((options: unknown) => {
      initialization.push(options);
    }),
    initialization,
  };
});
vi.mock("evlog", () => ({ log: fake, initLogger: fake.init, createLogger: vi.fn(), createRequestLogger: vi.fn() }));
vi.mock("evlog/client", () => ({ log: fake, initLog: fake.initClient }));

const logAll = Effect.fnUntraced(function* () {
  yield* Effect.logInfo("info");
  yield* Effect.logWarning("warn");
  yield* Effect.logError("error");
  yield* Effect.logDebug("debug");
  yield* Effect.logFatal("fatal");
  yield* Effect.logTrace("trace");
});

describe("Effect log layers", () => {
  const calls: Array<readonly [string, ReadonlyArray<unknown>]> = [];
  const sink = {
    emit: (level: string, args: ReadonlyArray<unknown>): void => {
      calls.push([level, args]);
    },
    initialize: (): void => {},
  };
  const expected = [
    ["info", ["info"]],
    ["warn", ["warn"]],
    ["error", ["error"]],
    ["debug", ["debug"]],
    ["error", ["fatal"]],
    ["debug", ["trace"]],
  ];
  const nodeLayer = nodeLoggerLayer.pipe(Layer.provide(nodeSinkLayer(sink)));
  const browserLayer = clientLoggerLayer.pipe(Layer.provide(clientSinkLayer(sink)));
  it.layer(nodeLayer)((test) => {
    test.effect(
      "routes every node level to the sink",
      Effect.fnUntraced(function* () {
        calls.length = 0;
        yield* logAll().pipe(Effect.provideService(References.MinimumLogLevel, "All"));
        expect(calls).toEqual(expected);
      })
    );
  });
  it.layer(browserLayer)((test) => {
    test.effect(
      "routes every browser level to the sink",
      Effect.fnUntraced(function* () {
        calls.length = 0;
        yield* logAll().pipe(Effect.provideService(References.MinimumLogLevel, "All"));
        expect(calls).toEqual(expected);
      })
    );
  });
  it.effect(
    "decodes the caught-error boundary event",
    Effect.fnUntraced(function* () {
      const decoded = yield* S.decodeEffect(CaughtErrorEvent)({
        event: "failed",
        error: "boom",
        stack: undefined,
      });
      expect(decoded).toEqual({ event: "failed", error: "boom", stack: undefined });
    })
  );
});

describe("legacy parity", () => {
  it("initializes the browser sink on import", () => {
    expect(fake.initialization).toEqual([{ service: "vidbee", pretty: true, console: true }]);
  });
  it("preserves all browser argument shapes and levels", () => {
    const error = new Error("boom");
    for (const level of ["info", "warn", "error", "debug"] as const) {
      const sink = fake[level];
      sink.mockClear();
      logger[level]("hello");
      expect(sink).toHaveBeenLastCalledWith("vidbee", "hello");
      logger[level]("event", error, 2);
      expect(sink).toHaveBeenLastCalledWith({
        event: "event",
        details: [{ name: error.name, message: error.message, stack: error.stack }, 2],
      });
      logger[level](error);
      expect(sink).toHaveBeenLastCalledWith(
        level === "error" ? error : { event: "boom", name: "Error", stack: error.stack }
      );
      logger[level]({ ok: true }, error);
      expect(sink).toHaveBeenLastCalledWith({
        event: "vidbee",
        details: [{ ok: true }, { name: "Error", message: "boom", stack: error.stack }],
      });
      logger[level]();
      expect(sink).toHaveBeenLastCalledWith({ event: "vidbee", details: [] });
    }
  });
  it("reads NODE_ENV afresh and preserves empty strings", () => {
    try {
      vi.stubEnv("NODE_ENV", "first");
      initVidbeeLogger({ service: "test" });
      expect(fake.init).toHaveBeenLastCalledWith({ env: { service: "test", environment: "first" }, pretty: true });
      vi.stubEnv("NODE_ENV", "second");
      initVidbeeLogger({ service: "test" });
      expect(fake.init).toHaveBeenLastCalledWith({ env: { service: "test", environment: "second" }, pretty: true });
      vi.stubEnv("NODE_ENV", "");
      initVidbeeLogger({ service: "test" });
      expect(fake.init).toHaveBeenLastCalledWith({ env: { service: "test", environment: "" }, pretty: true });
      vi.stubEnv("NODE_ENV", "production");
      initVidbeeLogger({ service: "test" });
      expect(fake.init).toHaveBeenLastCalledWith({
        env: { service: "test", environment: "production" },
        pretty: false,
      });
      vi.stubEnv("NODE_ENV", undefined);
      initVidbeeLogger({ service: "test" });
      expect(fake.init).toHaveBeenLastCalledWith({
        env: { service: "test", environment: "development" },
        pretty: true,
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("preserves node initialization and caught errors", () => {
    initVidbeeLogger({ service: "test", pretty: false });
    expect(fake.init).toHaveBeenLastCalledWith({ env: { service: "test", environment: "test" }, pretty: false });
    const error = new Error("boom");
    logCaughtError("failed", error);
    expect(fake.error).toHaveBeenLastCalledWith({ event: "failed", error: "boom", stack: error.stack });
    logCaughtError("failed", 42);
    expect(fake.error).toHaveBeenLastCalledWith({ event: "failed", error: "42", stack: undefined });
  });
});
