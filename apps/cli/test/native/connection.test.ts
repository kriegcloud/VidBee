import { expect, layer } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";
import { CliFailure } from "../../src/Cli.errors.js";
import { CliAutomation } from "../../src/CliAutomation.service.js";
import { CliAutostart } from "../../src/CliAutostart.service.js";
import { CliAutostartLive, CliConnectionLive } from "../../src/CliConnection.layer.js";
import { CliConnection } from "../../src/CliConnection.service.js";
import { CliDescriptor } from "../../src/CliDescriptor.service.js";
import { CliHost } from "../../src/CliHost.service.js";
import { CliLauncher } from "../../src/CliLauncher.service.js";
import { CliLocal } from "../../src/CliLocal.service.js";
import { CliPidLiveness } from "../../src/CliPidLiveness.service.js";
import { errorEnvelope } from "../../src/envelope/index.js";
import { parseArgv } from "../../src/parser/index.js";
import { fixtureHost } from "./fixtures.js";
import type { LauncherSpec } from "../../src/Connection.model.js";

let launchFailure = false;
let localFailure = false;
let blockRead = false;
let reached: Deferred.Deferred<void> | undefined;
const launches: LauncherSpec[] = [];
const session = {
  list: () => Effect.succeed({ items: [], nextCursor: null }),
  get: () => Effect.succeed({}),
  stats: Effect.succeed({}),
  removeFromHistory: () => Effect.void,
  shutdown: Effect.void,
};
const base = Layer.mergeAll(
  Layer.succeed(CliHost, fixtureHost),
  Layer.succeed(CliDescriptor, {
    path: Effect.fn("fixture.path")(() => Effect.succeed("/fixture/descriptor")),
    read: Effect.fn("fixture.read")(() =>
      Effect.suspend(() => {
        if (reached !== undefined) Deferred.doneUnsafe(reached, Effect.void);
        return blockRead
          ? Effect.never
          : Effect.succeed({
              ok: false as const,
              path: "/fixture/descriptor",
              envelope: errorEnvelope("DESKTOP_NOT_READY", "absent"),
            });
      })
    ),
  }),
  Layer.succeed(CliPidLiveness, { isAlive: Effect.fn("fixture.alive")(() => Effect.succeed(false)) }),
  Layer.succeed(CliLauncher, {
    launch: Effect.fn("fixture.launch")((spec) =>
      Effect.suspend(() => {
        launches.push(spec);
        return launchFailure ? Effect.fail(CliFailure.make({ message: "launch failure" })) : Effect.void;
      })
    ),
  }),
  Layer.succeed(CliLocal, {
    open: Effect.fn("fixture.open")(function* () {
      if (localFailure) return yield* CliFailure.make({ message: "local failure" });
      return session;
    }),
  }),
  Layer.succeed(CliAutomation, {
    make: Effect.fn("fixture.automation")(() =>
      Effect.succeed({
        ...session,
        handshake: Effect.succeed({ token: "fixture", expiresAt: 123 }),
        ensureToken: Effect.succeed("fixture"),
      })
    ),
  })
);
const autostart = CliAutostartLive.pipe(Layer.provide(base));
layer(Layer.mergeAll(autostart, CliConnectionLive.pipe(Layer.provide(Layer.mergeAll(base, autostart)))))((it) => {
  it.effect("local success and typed startup failure preserve connection envelopes", () =>
    Effect.gen(function* () {
      const service = yield* CliConnection;
      expect((yield* service.connect(parseArgv(["--vidbee-local"]).flags)).kind).toBe("connected");
      localFailure = true;
      const failure = yield* service.connect(parseArgv(["--vidbee-local"]).flags);
      expect(failure.kind === "error" && failure.envelope.message).toBe(
        "--vidbee-local failed to start: local failure"
      );
      localFailure = false;
    })
  );
  it.effect("API requires a URL; supplied URL and token connect without local startup", () =>
    Effect.gen(function* () {
      const service = yield* CliConnection;
      expect((yield* service.connect(parseArgv(["--vidbee-target", "api"]).flags)).kind).toBe("error");
      expect(
        (yield* service.connect(
          parseArgv(["--vidbee-api", "http://fixture.invalid", "--vidbee-token", "fixture"]).flags
        )).kind
      ).toBe("connected");
    })
  );
  it.effect("absent desktop and disabled autostart preserve the no-autostart error", () =>
    Effect.gen(function* () {
      const service = yield* CliConnection;
      const before = launches.length;
      const result = yield* service.connect(parseArgv(["--vidbee-no-autostart"]).flags);
      expect(result.kind === "error" && result.envelope.code).toBe("DESKTOP_NOT_READY");
      expect(launches.length).toBe(before);
    })
  );
  it.effect("autostart distinguishes unsupported platforms, launcher failure and exact deadline", () =>
    Effect.gen(function* () {
      const service = yield* CliAutostart;
      expect((yield* service.ensure(true, { platform: "unsupported" })).kind).toBe("unsupported-platform");
      launchFailure = true;
      expect((yield* service.ensure(true)).kind).toBe("launch-failed");
      launchFailure = false;
      const waiting = yield* service.ensure(true, { timeoutMs: 100, pollIntervalMs: 25 }).pipe(Effect.forkScoped);
      yield* TestClock.adjust(100);
      const result = yield* Fiber.join(waiting);
      expect(result).toEqual({ kind: "timeout", waitedMs: 100 });
    })
  );
  it.effect("interruption at descriptor acquisition does not launch an application", () =>
    Effect.gen(function* () {
      const service = yield* CliAutostart;
      blockRead = true;
      reached = yield* Deferred.make<void>();
      const before = launches.length;
      const running = yield* service.ensure(true).pipe(Effect.forkScoped);
      yield* Deferred.await(reached);
      yield* Fiber.interrupt(running);
      expect(launches.length).toBe(before);
      blockRead = false;
      reached = undefined;
    })
  );
});
