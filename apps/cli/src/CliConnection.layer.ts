import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CliAutostart } from "./CliAutostart.service.js";
import { CliConnection } from "./CliConnection.service.js";
import { ensureDesktopReadyNative } from "./transport/autostart.js";
import { connectNative } from "./transport/connect.js";
import type { CliAutomation } from "./CliAutomation.service.js";
import type { CliDescriptor } from "./CliDescriptor.service.js";
import type { CliHost } from "./CliHost.service.js";
import type { CliLauncher } from "./CliLauncher.service.js";
import type { CliLocal } from "./CliLocal.service.js";
import type { CliPidLiveness } from "./CliPidLiveness.service.js";
export const CliConnectionLive = Layer.effect(
  CliConnection,
  Effect.gen(function* () {
    const dependencies = yield* Effect.context<
      CliLocal | CliAutomation | CliDescriptor | CliPidLiveness | CliAutostart
    >();
    return CliConnection.of({
      connect: Effect.fn("CliConnection.connect")((flags) => connectNative(flags).pipe(Effect.provide(dependencies))),
    });
  })
);
export const CliAutostartLive = Layer.effect(
  CliAutostart,
  Effect.gen(function* () {
    const dependencies = yield* Effect.context<CliDescriptor | CliPidLiveness | CliLauncher | CliHost>();
    return CliAutostart.of({
      ensure: Effect.fn("CliAutostart.ensure")((enabled, options) =>
        ensureDesktopReadyNative(enabled, options).pipe(Effect.provide(dependencies))
      ),
    });
  })
);
