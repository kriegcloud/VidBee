import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import { DownloadHost } from "@vidbee/downloader-core/DownloadHost.service";
import { layer as nativeProcess } from "@vidbee/downloader-core/Process.driver";
import { requestLayer } from "@vidbee/task-queue/ProcessControl.driver";
import { TaskExecutor } from "@vidbee/task-queue/TaskExecutor.service";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as P from "effect/Predicate";
import { CliHost } from "../../src/CliHost.service.js";
import { CliLauncherLive } from "../../src/CliLauncher.layer.js";
import { CliLauncher } from "../../src/CliLauncher.service.js";
import { CliLocalLive } from "../../src/CliLocal.layer.js";
import { CliLocal } from "../../src/CliLocal.service.js";
import { CliPidLiveness } from "../../src/CliPidLiveness.service.js";
import { CliProbeLive, CliProbeProcessLive } from "../../src/CliProbe.layer.js";
import { CliProbe } from "../../src/CliProbe.service.js";
import { CliPidLivenessLive } from "../../src/PidLiveness.driver.js";
import { fixtureHost } from "./fixtures.js";

const host = Layer.succeed(CliHost, fixtureHost);
const executor = Layer.succeed(TaskExecutor, {
  run: Effect.fn("fixture.executor")(() =>
    Effect.succeed({ cancel: Effect.fn("fixture.cancel")(() => Effect.void), pause: Effect.void })
  ),
});
const downloadHost = Layer.succeed(DownloadHost, {
  platform: () => fixtureHost.platform,
  homeDirectory: () => fixtureHost.homeDirectory,
  tempDirectory: () => fixtureHost.homeDirectory,
  environment: () => ({}),
  setEnvironment: Effect.fn("fixture.setEnvironment")(() => Effect.void),
  makeAbortController: () => new AbortController(),
  uuid: () => "fixture-id",
});
const node = Layer.mergeAll(NodeServices.layer, host, executor, downloadHost);
const probeProcess = CliProbeProcessLive.pipe(
  Layer.provide(nativeProcess.pipe(Layer.provide(requestLayer))),
  Layer.provide(node)
);
layer(
  Layer.mergeAll(
    CliProbeLive.pipe(Layer.provide(Layer.mergeAll(host, probeProcess))),
    CliLauncherLive.pipe(Layer.provide(node)),
    CliPidLivenessLive,
    CliLocalLive.pipe(Layer.provide(node))
  )
)((it) => {
  it.effect("native probe drains both streams before completion", () =>
    Effect.gen(function* () {
      const probe = yield* CliProbe;
      const result = yield* probe.run({ argv: ["--version"] });
      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.stdout).toBe("native fixture");
        expect(result.stderr).toBe("");
        expect(result.exitCode).toBe(0);
      }
    })
  );
  it.effect("native missing executable exposes native acquisition failure", () =>
    Effect.gen(function* () {
      const probe = yield* CliProbe;
      const result = yield* probe.run({ argv: [], ytDlpPath: "/fixture/no-executable" });
      expect(result.kind).toBe("error");
      if (result.kind === "error") expect(result.envelope.code).toBe("NOT_IMPLEMENTED");
    })
  );
  it.effect("native launcher acquires/unrefs its scoped child and types spawn failures", () =>
    Effect.gen(function* () {
      const launcher = yield* CliLauncher;
      yield* launcher.launch({ command: "vidbee-desktop", argv: ["--background", "--from-cli"] });
      const missing = yield* launcher.launch({ command: "/fixture/no-launcher", argv: [] }).pipe(Effect.result);
      expect(missing._tag).toBe("Failure");
    })
  );
  it.effect("qualified signal-zero driver maps every thrown probe to false", () =>
    Effect.gen(function* () {
      const liveness = yield* CliPidLiveness;
      const missing = yield* liveness.isAlive(2147483647);
      const invalid = yield* liveness.isAlive(Number.NaN);
      expect(missing).toBe(false);
      expect(invalid).toBe(false);
    })
  );
  it.effect("native local opens separate queues and shutdown is idempotent", () =>
    Effect.gen(function* () {
      const local = yield* CliLocal;
      const first = yield* local.open({ persist: "memory" });
      const second = yield* local.open({ persist: "memory" });
      const missing = yield* first.get("missing").pipe(Effect.result);
      expect(missing._tag).toBe("Failure");
      if (missing._tag === "Failure") expect(missing.failure.message).toBe("task missing not found");
      const page = yield* second.list({});
      expect(page.items).toEqual([]);
      yield* first.shutdown;
      yield* first.shutdown;
      yield* second.shutdown;
    })
  );
  it.effect("native SQLite requires the caller's owned SqlClient", () =>
    Effect.gen(function* () {
      const local = yield* CliLocal;
      const result = yield* local.open({ persist: "sqlite" }).pipe(Effect.result);
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") expect(P.isTruthy(result.failure.message)).toBe(true);
    })
  );
});
