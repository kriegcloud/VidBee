import * as Context from "effect/Context";
import type { LogLevel, VidbeeLoggerOptions } from "./Logger.model.js";

export interface LogSink {
  readonly emit: (level: typeof LogLevel.Type, args: ReadonlyArray<unknown>) => void;
}
export class NodeSink extends Context.Service<
  NodeSink,
  LogSink & {
    readonly initialize: (options: VidbeeLoggerOptions, environment: string) => void;
  }
>()("@vidbee/logger/Logger.service/NodeSink") {}
export class ClientSink extends Context.Service<ClientSink, LogSink>()("@vidbee/logger/Logger.service/ClientSink") {}
