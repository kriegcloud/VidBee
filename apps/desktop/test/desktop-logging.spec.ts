import { describe, expect, it } from "@effect/vitest";
import * as Arbitrary from "effect/Arbitrary";
import * as A from "effect/Array";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as References from "effect/References";
import * as S from "effect/Schema";
import { vi } from "vitest";
import { DesktopMainLoggerLive } from "../src/main/logging/DesktopLogger.layer.js";
import { receiveDesktopLog } from "../src/main/logging/ElectronLog.driver.js";
import { DesktopLogEntry, DesktopLogLevel } from "../src/shared/logging/DesktopLog.model.js";
import { DesktopLogSink } from "../src/shared/logging/DesktopLog.service.js";
import { DesktopLoggerLive, desktopLog } from "../src/shared/logging/DesktopLogger.layer.js";
import { forwardingLogger } from "../src/shared/logging/ForwardLogger.layer.js";

const fake = vi.hoisted(() => {
  const calls: Array<{ level: string; scope: string; args: ReadonlyArray<unknown> }> = [];
  const target = (scope: string) => ({
    error: (...args: ReadonlyArray<unknown>) => {
      calls.push({ level: "error", scope, args });
    },
    warn: (...args: ReadonlyArray<unknown>) => {
      calls.push({ level: "warn", scope, args });
    },
    info: (...args: ReadonlyArray<unknown>) => {
      calls.push({ level: "info", scope, args });
    },
    verbose: (...args: ReadonlyArray<unknown>) => {
      calls.push({ level: "verbose", scope, args });
    },
    debug: (...args: ReadonlyArray<unknown>) => {
      calls.push({ level: "debug", scope, args });
    },
    silly: (...args: ReadonlyArray<unknown>) => {
      calls.push({ level: "silly", scope, args });
    },
  });
  return { calls, log: { ...target(""), scope: target } };
});
vi.mock("electron-log/main", () => ({ default: fake.log }));

const allLevels = Effect.fnUntraced(function* (identity: boolean) {
  const error = new Error("original");
  const details = { count: 3 };
  yield* Effect.forEach(
    DesktopLogLevel.literals,
    (level) =>
      desktopLog(DesktopLogEntry.make({ level, scope: " foundation ", args: ["message", details, error, "tail"] })),
    { concurrency: 1 }
  );
  expect(fake.calls).toHaveLength(6);
  A.forEach(fake.calls, (call, index) => {
    expect(call.level).toBe(DesktopLogLevel.literals[index]);
    expect(call.scope).toBe(" foundation ");
    expect(call.args).toHaveLength(4);
    expect(call.args[0]).toBe("message");
    if (identity) expect(call.args[1]).toBe(details);
    else expect(call.args[1]).toEqual(details);
    if (identity) expect(call.args[2]).toBe(error);
    else expect(call.args[2]).toEqual(error);
    expect(call.args[3]).toBe("tail");
  });
});

for (const environment of ["development", "production"]) {
  for (const process of ["main", "preload", "renderer"]) {
    const live = process === "main" ? DesktopMainLoggerLive : forwardingLogger(receiveDesktopLog);
    describe(`${process} in ${environment}`, () => {
      it.layer(live)((test) => {
        test.effect(
          "keeps all six original levels, scope and argument identities",
          Effect.fnUntraced(function* () {
            fake.calls.length = 0;
            const minimum = yield* References.MinimumLogLevel;
            expect(minimum).toBe("All");
            const loggers = yield* Logger.CurrentLoggers;
            expect(loggers.size).toBe(1);
            yield* allLevels(process === "main");
          })
        );
        test.effect(
          "maps unannotated Effect severity and appends the complete Cause once",
          Effect.fnUntraced(function* () {
            fake.calls.length = 0;
            const cause = Cause.combine(Cause.fail("first failure"), Cause.die("second defect"));
            yield* Effect.logFatal("fatal", cause);
            yield* Effect.logWarning("warning");
            yield* Effect.logInfo("info");
            yield* Effect.logDebug("debug");
            yield* Effect.logTrace("trace");
            expect(A.map(fake.calls, (call) => call.level)).toEqual(["error", "warn", "info", "debug", "debug"]);
            expect(fake.calls[0]?.args[0]).toBe("fatal");
            expect(fake.calls[0]?.args[1]).toEqual({ cause: Cause.pretty(cause) });
            expect(fake.calls[0]?.args[2]).toMatchObject({
              effect: {
                reasons: [
                  { kind: "Fail", error: "first failure" },
                  { kind: "Die", defect: "second defect" },
                ],
              },
            });
            expect(Cause.pretty(cause)).toContain("first failure");
            expect(Cause.pretty(cause)).toContain("second defect");
          })
        );
      });
    });
  }
}

it("rejects malformed bridge envelopes before touching the sink", () => {
  fake.calls.length = 0;
  A.forEach(
    [
      null,
      {},
      { level: "fatal", scope: "", args: [] },
      { level: "info", scope: 1, args: [] },
      { level: "info", scope: "", args: "joined" },
    ],
    receiveDesktopLog
  );
  expect(fake.calls).toEqual([]);
  expect(S.is(DesktopLogEntry)({ level: "debug", scope: "", args: [1, null] })).toBe(true);
});

let failedSendAttempts = 0;
it.layer(
  forwardingLogger(() => {
    failedSendAttempts++;
    throw new Error("closed bridge");
  })
)((test) => {
  test.effect(
    "does not recurse or retry a failed forwarding send",
    Effect.fnUntraced(function* () {
      fake.calls.length = 0;
      failedSendAttempts = 0;
      yield* desktopLog(DesktopLogEntry.make({ level: "warn", scope: "", args: ["lost"] }));
      expect(failedSendAttempts).toBe(1);
      expect(fake.calls).toEqual([]);
    })
  );
});

const acquisition: unknown[] = [];
const acquired = Layer.effectDiscard(Effect.logDebug("acquire")).pipe(
  Layer.provide(
    DesktopLoggerLive.pipe(
      Layer.provide(
        Layer.succeed(DesktopLogSink, {
          emit: (entry) => {
            acquisition.push(entry);
          },
        })
      )
    )
  )
);
it.layer(acquired)((test) => {
  test.effect(
    "provides minimum All while acquiring a logging consumer",
    Effect.fnUntraced(function* () {
      yield* Effect.void;
      expect(acquisition).toEqual([{ level: "debug", scope: "", args: ["acquire"] }]);
    })
  );
});

const representations: Array<ReadonlyArray<unknown>> = [];
const representationLogger = Logger.make<unknown, void>((options) => {
  const annotations = Context.get(options.fiber.context, References.CurrentLogAnnotations);
  representations.push([
    options.logLevel,
    annotations["electron-log.level"],
    annotations["electron-log.scope"],
    options.message,
  ]);
});
it.layer(Layer.mergeAll(Logger.layer([representationLogger]), Layer.succeed(References.MinimumLogLevel, "All")))(
  (test) => {
    test.effect(
      "represents each original level with its exact Effect severity and annotations",
      Effect.fnUntraced(function* () {
        representations.length = 0;
        yield* Effect.forEach(
          DesktopLogLevel.literals,
          (level) => desktopLog(DesktopLogEntry.make({ level, scope: "scope", args: ["first", "second"] })),
          { concurrency: 1 }
        );
        expect(representations).toEqual([
          ["Error", "error", "scope", ["first", "second"]],
          ["Warn", "warn", "scope", ["first", "second"]],
          ["Info", "info", "scope", ["first", "second"]],
          ["Debug", "verbose", "scope", ["first", "second"]],
          ["Debug", "debug", "scope", ["first", "second"]],
          ["Trace", "silly", "scope", ["first", "second"]],
        ]);
      })
    );
  }
);
it.prop("the severity schema generates valid bridge severities", [Arbitrary.schema(DesktopLogLevel)], ([level]) => {
  expect(S.is(DesktopLogLevel)(level)).toBe(true);
});

it.prop("the entry schema generates valid ordered envelopes", [Arbitrary.schema(DesktopLogEntry)], ([entry]) => {
  expect(S.is(DesktopLogEntry)(entry)).toBe(true);
});

it.layer(DesktopMainLoggerLive)((test) => {
  test.effect(
    "retains mixed reasons, every annotated stack frame and log context",
    Effect.fnUntraced(function* () {
      fake.calls.length = 0;
      const chain: References.StackFrame = A.reduce<number, References.StackFrame>(
        A.range(1, 14),
        { name: "root", stack: () => "root-stack", parent: undefined },
        (parent, n) => ({ name: `frame-${n}`, stack: () => `full-stack-${n}`, parent })
      );
      const cause = Cause.combine(
        Cause.combine(Cause.fail("failure"), Cause.die("defect")),
        Cause.interrupt(424242)
      ).pipe(
        Cause.annotate(Context.make(Cause.StackTrace, chain).pipe(Context.add(Cause.InterruptorStackTrace, chain)))
      );
      yield* Effect.logError("context", cause).pipe(
        Effect.annotateLogs({ requestId: "request-1" }),
        Effect.withLogSpan("request-span")
      );
      expect(fake.calls).toHaveLength(1);
      expect(fake.calls[0]?.args[0]).toBe("context");
      expect(fake.calls[0]?.args[1]).toEqual({ cause: Cause.pretty(cause) });
      expect(fake.calls[0]?.args[2]).toMatchObject({
        effect: {
          annotations: { requestId: "request-1" },
          spans: [["request-span", expect.any(Number)]],
          reasons: [
            {
              kind: "Fail",
              error: "failure",
              stack: expect.arrayContaining([
                { name: "frame-14", stack: "full-stack-14" },
                { name: "frame-1", stack: "full-stack-1" },
              ]),
            },
            { kind: "Die", defect: "defect" },
            {
              kind: "Interrupt",
              fiberId: 424242,
              interruptorStack: expect.arrayContaining([{ name: "frame-14", stack: "full-stack-14" }]),
            },
          ],
        },
      });
    })
  );
});
