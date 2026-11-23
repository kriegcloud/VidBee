import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import { logArguments } from "./LogArguments.js";
import { ClientSink, NodeSink } from "./Logger.service.js";
import type { LogLevel } from "./Logger.model.js";
import type { LogSink } from "./Logger.service.js";

const sinkLogger = (sink: LogSink) =>
  Logger.make<unknown, void>((options) => {
    const level: typeof LogLevel.Type =
      options.logLevel === "Fatal" || options.logLevel === "Error"
        ? "error"
        : options.logLevel === "Warn"
          ? "warn"
          : options.logLevel === "Debug" || options.logLevel === "Trace"
            ? "debug"
            : "info";
    sink.emit(level, logArguments(options.message, options.cause));
  });
export const nodeLoggerLayer = Logger.layer([Effect.map(NodeSink, sinkLogger)]);
export const clientLoggerLayer = Logger.layer([Effect.map(ClientSink, sinkLogger)]);
export const nodeSinkLayer = (sink: typeof NodeSink.Service) => Layer.succeed(NodeSink, sink);
export const clientSinkLayer = (sink: LogSink) => Layer.succeed(ClientSink, sink);
