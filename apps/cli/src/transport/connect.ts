import * as Effect from "effect/Effect";
import * as P from "effect/Predicate";
import { CliAutomation } from "../CliAutomation.service.js";
import { CliAutostart } from "../CliAutostart.service.js";
import { CliConnection } from "../CliConnection.service.js";
import { CliDescriptor } from "../CliDescriptor.service.js";
import { CliLocal } from "../CliLocal.service.js";
import { CliPidLiveness } from "../CliPidLiveness.service.js";
import { errorEnvelope } from "../envelope/index.js";
import type { AutostartResult, ConnectResult } from "../Connection.model.js";
import type { Flags } from "../Parser.model.js";

export type { ConnectResult } from "../Connection.model.js";
export const connectNative = Effect.fn("connectNative")(function* (flags: Flags) {
  const local = yield* CliLocal;
  const automation = yield* CliAutomation;
  const descriptorService = yield* CliDescriptor;
  const liveness = yield* CliPidLiveness;
  const autostart = yield* CliAutostart;

  if (flags.local || flags.target === "local") {
    return yield* local.open({}).pipe(
      Effect.map((handle): ConnectResult => ({ kind: "connected", client: handle, shutdown: handle.shutdown })),
      Effect.catch((err) =>
        Effect.succeed({
          kind: "error",
          envelope: errorEnvelope("NOT_IMPLEMENTED", `--vidbee-local failed to start: ${err.message}`),
        } satisfies ConnectResult)
      )
    );
  }

  if (flags.api !== undefined || flags.target === "api") {
    const url = flags.api;
    if (!P.isTruthy(url) || url === undefined) {
      return {
        kind: "error" as const,
        envelope: errorEnvelope("API_UNREACHABLE", "--vidbee-target api requires --vidbee-api <url>"),
      };
    }
    const client = yield* automation.make({
      baseUrl: url,
      ...(P.isTruthy(flags.token) ? { token: flags.token, skipHandshake: true } : {}),
    });
    return { kind: "connected", client, shutdown: Effect.void } satisfies ConnectResult;
  }

  let descriptor = yield* descriptorService.read({});
  let needsAutostart = false;
  if (!descriptor.ok) {
    needsAutostart = true;
  } else if (!(yield* liveness.isAlive(descriptor.descriptor.pid))) {
    needsAutostart = true;
  }

  if (needsAutostart) {
    const result: AutostartResult = yield* autostart.ensure(!flags.noAutostart, {
      ...(flags.timeoutMs !== undefined ? { timeoutMs: flags.timeoutMs } : {}),
    });
    if (result.kind === "autostart-disabled") {
      return {
        kind: "error" as const,
        envelope: errorEnvelope("DESKTOP_NOT_READY", "Desktop is not running and --vidbee-no-autostart was set"),
      };
    }
    if (result.kind === "unsupported-platform") {
      return {
        kind: "error" as const,
        envelope: errorEnvelope(
          "DESKTOP_NOT_READY",
          `autostart not supported on platform ${result.platform}; pass --vidbee-api or run Desktop manually`
        ),
      };
    }
    if (result.kind === "launch-failed") {
      return {
        kind: "error" as const,
        envelope: errorEnvelope("DESKTOP_NOT_READY", `failed to launch Desktop: ${result.reason}`),
      };
    }
    if (result.kind === "timeout") {
      return {
        kind: "error" as const,
        envelope: errorEnvelope("DESKTOP_NOT_READY", `Desktop did not become ready within ${result.waitedMs}ms`),
      };
    }
    descriptor = yield* descriptorService.read({});
    if (!descriptor.ok) return { kind: "error" as const, envelope: descriptor.envelope };
  }

  if (!descriptor.ok) return { kind: "error" as const, envelope: descriptor.envelope };
  const baseUrl = `http://${descriptor.descriptor.host}:${descriptor.descriptor.port}`;
  const client = yield* automation.make({
    baseUrl,
    ...(P.isTruthy(flags.token) ? { token: flags.token, skipHandshake: true } : {}),
  });
  return { kind: "connected", client, shutdown: Effect.void } satisfies ConnectResult;
});

export const connect = Effect.fn("connect")(function* (flags: Flags) {
  return yield* (yield* CliConnection).connect(flags);
});
