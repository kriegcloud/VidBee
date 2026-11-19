import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import { CliAutostart } from "../CliAutostart.service.js";
import { CliDescriptor } from "../CliDescriptor.service.js";
import { CliHost } from "../CliHost.service.js";
import { CliLauncher } from "../CliLauncher.service.js";
import { CliPidLiveness } from "../CliPidLiveness.service.js";
import type { AutostartOptions, AutostartResult, LauncherSpec } from "../Connection.model.js";

export type { AutostartOptions, AutostartResult } from "../Connection.model.js";
export const ensureDesktopReadyNative = Effect.fn("ensureDesktopReadyNative")(function* (
  enabled: boolean,
  options: AutostartOptions = {}
) {
  const descriptor = yield* CliDescriptor;
  const liveness = yield* CliPidLiveness;
  const launcher = yield* CliLauncher;
  const host = yield* CliHost;
  const ready = Effect.gen(function* () {
    const r = yield* descriptor.read();
    return r.ok && (yield* liveness.isAlive(r.descriptor.pid));
  });
  if (yield* ready) return { kind: "ready" } satisfies AutostartResult;
  if (!enabled) return { kind: "autostart-disabled" } satisfies AutostartResult;
  const platform = options.platform ?? host.platform;
  const spec = launcherForPlatform(platform);
  if (spec === null) return { kind: "unsupported-platform", platform } satisfies AutostartResult;
  const launched = yield* launcher.launch(spec).pipe(Effect.result);
  if (launched._tag === "Failure")
    return { kind: "launch-failed", reason: launched.failure.message } satisfies AutostartResult;
  const start = yield* Clock.currentTimeMillis;
  while ((yield* Clock.currentTimeMillis) - start < (options.timeoutMs ?? 10000)) {
    if (yield* ready) return { kind: "ready" } satisfies AutostartResult;
    yield* Effect.sleep(options.pollIntervalMs ?? 200);
  }
  return { kind: "timeout", waitedMs: (yield* Clock.currentTimeMillis) - start } satisfies AutostartResult;
});
function launcherForPlatform(platform: string): LauncherSpec | null {
  if (platform === "darwin")
    return { command: "open", argv: ["-ga", "VidBeep", "--args", "--background", "--from-cli"] };
  if (platform === "win32")
    return { command: "cmd", argv: ["/c", "start", '""', "VidBeep", "--background", "--from-cli"] };
  if (platform === "linux") return { command: "vidbee-desktop", argv: ["--background", "--from-cli"] };
  return null;
}
export const ensureDesktopReady = Effect.fn("ensureDesktopReady")(function* (
  enabled: boolean,
  options?: AutostartOptions
) {
  return yield* (yield* CliAutostart).ensure(enabled, options);
});
