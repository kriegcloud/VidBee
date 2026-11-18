import * as Layer from "effect/Layer";
import { nodeLoggerLayer, nodeSinkLayer } from "./Logger.layer.js";
import { nodeDriver } from "./Node.driver.js";

export { nodeLoggerLayer, nodeSinkLayer } from "./Logger.layer.js";
export { CaughtErrorEvent, LoggerOptions, LogLevel } from "./Logger.model.js";
export { NodeSink } from "./Logger.service.js";
export const layer = nodeLoggerLayer.pipe(
  Layer.provide(nodeSinkLayer({ emit: nodeDriver.emit, initialize: nodeDriver.initialize }))
);
