import * as Effect from "effect/Effect";
import * as ManagedRuntime from "effect/ManagedRuntime";
import { clientDriver, initializeClient } from "../Client.driver.js";
import { clientSinkLayer } from "../Logger.layer.js";
import { ClientSink } from "../Logger.service.js";
import type { LogLevel } from "../Logger.model.js";

initializeClient();

export { log } from "../Client.driver.js";

const runtime = ManagedRuntime.make(clientSinkLayer({ emit: clientDriver.emit }));
const emit = Effect.fnUntraced(function* (level: typeof LogLevel.Type, args: ReadonlyArray<unknown>) {
  const sink = yield* ClientSink;
  yield* Effect.sync(() => sink.emit(level, args));
});
export const logger = {
  info: (...args: unknown[]) => runtime.runSync(emit("info", args)),
  warn: (...args: unknown[]) => runtime.runSync(emit("warn", args)),
  error: (...args: unknown[]) => runtime.runSync(emit("error", args)),
  debug: (...args: unknown[]) => runtime.runSync(emit("debug", args)),
};
