import { createLogger, createRequestLogger, initLogger, log } from "evlog";
import type { LogLevel, VidbeeLoggerOptions } from "./Logger.model.js";

export const nodeDriver = {
  initialize(options: VidbeeLoggerOptions, environment: string): void {
    initLogger({
      env: { service: options.service, environment },
      pretty: options.pretty ?? environment !== "production",
    });
  },
  emit(level: typeof LogLevel.Type, args: ReadonlyArray<unknown>): void {
    const [first, ...rest] = args;
    if (typeof first === "string" && rest.length === 0) {
      log[level]("vidbee", first);
      return;
    }
    if (typeof first === "object" && first !== null && rest.length === 0) {
      log[level]({ ...first });
      return;
    }
    log[level]({ event: typeof first === "string" ? first : "vidbee", details: rest.length === 0 ? args : rest });
  },
};
export { createLogger, createRequestLogger, log };
