import { expect, layer } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Str from "effect/String";
import { CliFailure } from "../../src/Cli.errors.js";
import { CliConnection } from "../../src/CliConnection.service.js";
import { CliOutput } from "../../src/CliOutput.service.js";
import { CliProbe } from "../../src/CliProbe.service.js";
import { CliProgramLive } from "../../src/CliProgram.layer.js";
import { CliProgram } from "../../src/CliProgram.service.js";
import { CliUpgrade } from "../../src/CliUpgrade.service.js";
import { CliVersion } from "../../src/CliVersion.service.js";

let stopped = 0;
let blocked = false;
let failOutput = false;
let entered: Deferred.Deferred<void> | undefined;
const writes: string[] = [];
const stats = Effect.suspend(() => {
  if (entered !== undefined) Deferred.doneUnsafe(entered, Effect.void);
  return blocked ? Effect.never : Effect.succeed({ queued: 0 });
});
const dependencies = Layer.mergeAll(
  Layer.succeed(CliConnection, {
    connect: Effect.fn("fixture.connect")(() =>
      Effect.succeed({
        kind: "connected" as const,
        client: {
          list: () => Effect.succeed({ items: [], nextCursor: null }),
          get: () => Effect.fail(CliFailure.make({ message: "missing" })),
          stats,
          removeFromHistory: () => Effect.void,
        },
        shutdown: Effect.sync(() => {
          stopped++;
        }),
      })
    ),
  }),
  Layer.succeed(CliOutput, {
    stdout: Effect.fn("fixture.stdout")((text) =>
      Effect.suspend(() => {
        if (failOutput) return Effect.fail(CliFailure.make({ message: "pipe closed" }));
        writes.push(text);
        return Effect.void;
      })
    ),
    stderr: Effect.fn("fixture.stderr")(() => Effect.void),
  }),
  Layer.succeed(CliVersion, {
    read: Effect.fn("fixture.version")(() => Effect.succeed({ cli: "0.1.0", contract: "1", changelog: "fixture" })),
  }),
  Layer.succeed(CliUpgrade, {
    cachePath: Effect.succeed("/fixture/cache"),
    check: Effect.fn("fixture.upgrade")(() => Effect.fail(CliFailure.make({ message: "registry unavailable" }))),
  }),
  Layer.succeed(CliProbe, {
    run: Effect.fn("fixture.probe")(() =>
      Effect.succeed({ kind: "success" as const, stdout: "fixture\n", stderr: "", exitCode: 7, binary: "yt-dlp" })
    ),
  })
);
layer(CliProgramLive.pipe(Layer.provide(dependencies)))((it) => {
  it.effect("parse errors and local version do not acquire a connection", () =>
    Effect.gen(function* () {
      const program = yield* CliProgram;
      const before = stopped;
      expect((yield* program.run(["--vidbee-typo"])).exitCode).toBe(2);
      expect((yield* program.run([":version"])).exitCode).toBe(0);
      expect(stopped).toBe(before);
      expect(Str.endsWith("\n")(writes.at(-1) ?? "")).toBe(true);
    })
  );
  it.effect("nonzero probes and registry failures retain distinct terminal codes", () =>
    Effect.gen(function* () {
      const program = yield* CliProgram;
      expect((yield* program.run(["--version"])).exitCode).toBe(1);
      expect((yield* program.run([":upgrade"])).exitCode).toBe(3);
    })
  );
  it.effect("normal command and typed command failure each stop the acquired connection once", () =>
    Effect.gen(function* () {
      const program = yield* CliProgram;
      const before = stopped;
      expect((yield* program.run([":status"])).exitCode).toBe(0);
      expect((yield* program.run([":download", "status", "missing"])).exitCode).toBe(2);
      expect(stopped).toBe(before + 2);
    })
  );
  it.effect("interruption during a suspended command finalizes its connection", () =>
    Effect.gen(function* () {
      const program = yield* CliProgram;
      entered = yield* Deferred.make<void>();
      blocked = true;
      const before = stopped;
      const running = yield* program.run([":status"]).pipe(Effect.forkScoped);
      yield* Deferred.await(entered);
      yield* Fiber.interrupt(running);
      expect(stopped).toBe(before + 1);
      blocked = false;
      entered = undefined;
    })
  );
  it.effect("output failure still finalizes the acquired connection", () =>
    Effect.gen(function* () {
      const program = yield* CliProgram;
      const before = stopped;
      failOutput = true;
      const result = yield* program.run([":status"]).pipe(Effect.result);
      expect(result._tag).toBe("Failure");
      expect(stopped).toBe(before + 1);
      failOutput = false;
    })
  );
});
