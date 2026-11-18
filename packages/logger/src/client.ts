import * as Layer from "effect/Layer";
import { clientDriver, initializeClient } from "./Client.driver.js";
import { clientLoggerLayer, clientSinkLayer } from "./Logger.layer.js";

initializeClient();

export { clientLoggerLayer, clientSinkLayer } from "./Logger.layer.js";
export { LoggerOptions, LogLevel } from "./Logger.model.js";
export { ClientSink } from "./Logger.service.js";
export const layer = clientLoggerLayer.pipe(Layer.provide(clientSinkLayer({ emit: clientDriver.emit })));
