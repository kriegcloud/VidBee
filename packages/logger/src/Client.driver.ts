import * as A from "effect/Array";
import { initLog, log } from "evlog/client";
import type { LogLevel } from "./Logger.model.js";

export const initializeClient = (): void => {
  const isDev = Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);
  initLog({ service: "vidbee", pretty: isDev, console: true });
};

function serializeArg(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

/**
 * Emit a client log through evlog while keeping the console(message, ...args) API.
 */
export const clientDriver = {
  emit(level: typeof LogLevel.Type, args: ReadonlyArray<unknown>): void {
    const [first, ...rest] = args;
    if (typeof first === "string" && rest.length === 0) {
      log[level]("vidbee", first);
      return;
    }
    if (typeof first === "string") {
      log[level]({
        event: first,
        details: A.map(rest, serializeArg),
      });
      return;
    }
    if (first instanceof Error && rest.length === 0) {
      if (level === "error") {
        log.error(first);
        return;
      }
      log[level]({
        event: first.message,
        name: first.name,
        stack: first.stack,
      });
      return;
    }
    log[level]({
      event: "vidbee",
      details: A.map(args, serializeArg),
    });
  },
};
export { log };
