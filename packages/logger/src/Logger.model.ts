import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as S from "effect/Schema";

export const LogLevel = LiteralKit(["info", "warn", "error", "debug"]);
export const LoggerOptions = S.Struct({ service: S.String, pretty: S.optionalKey(S.Boolean) });
export type VidbeeLoggerOptions = typeof LoggerOptions.Type;
export const CaughtErrorEvent = S.Struct({
  event: S.String,
  error: S.String,
  stack: S.String.pipe(S.UndefinedOr, S.optionalKey),
});
