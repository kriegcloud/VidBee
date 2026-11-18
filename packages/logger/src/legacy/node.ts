import * as Config from "effect/Config";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import { dual } from "effect/Function";
import * as ManagedRuntime from "effect/ManagedRuntime";
import { nodeSinkLayer } from "../Logger.layer.js";
import { NodeSink } from "../Logger.service.js";
import { nodeDriver } from "../Node.driver.js";
import type { VidbeeLoggerOptions } from "../Logger.model.js";

export { createLogger, createRequestLogger, log } from "../Node.driver.js";
export type { VidbeeLoggerOptions } from "../Logger.model.js";

const runtime = ManagedRuntime.make(nodeSinkLayer({ emit: nodeDriver.emit, initialize: nodeDriver.initialize }));
const initialize = Effect.fnUntraced(function* (options: VidbeeLoggerOptions) {
  const environment = yield* Config.String("NODE_ENV").pipe(
    Config.withDefault("development"),
    Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv({ preserveEmptyStrings: true }))
  );
  const sink = yield* NodeSink;
  yield* Effect.sync(() => sink.initialize(options, environment));
});
const caught = Effect.fnUntraced(function* (event: string, error: unknown) {
  const sink = yield* NodeSink;
  yield* Effect.sync(() =>
    sink.emit("error", [
      {
        event,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    ])
  );
});
export function initVidbeeLogger(options: VidbeeLoggerOptions): void {
  runtime.runSync(initialize(options));
}
export const logCaughtError: { (event: string, error: unknown): void; (error: unknown): (event: string) => void } =
  dual(2, (event: string, error: unknown): void => {
    runtime.runSync(caught(event, error));
  });
