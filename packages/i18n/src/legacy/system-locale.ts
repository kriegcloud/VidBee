import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import { detectSystemProfile as detect } from "../system-locale.js";
import type { SystemProfile, SystemProfileInput } from "../I18n.model.js";

export { isMainlandChineseLocale, languageFromTag } from "../system-locale.js";
export type { SystemProfile, SystemProfileInput } from "../I18n.model.js";

const runtime = ManagedRuntime.make(Layer.empty);
const readDefaultIntl = (key: "timeZone" | "locale"): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions()[key] ?? "";
  } catch {
    return "";
  }
};
export const detectSystemProfile = (input: SystemProfileInput = {}): SystemProfile =>
  runtime.runSync(
    Effect.sync(() =>
      detect({
        ...input,
        env: input.env ?? process.env,
        timeZone: input.timeZone ?? readDefaultIntl("timeZone"),
        defaultLocale: input.locales !== undefined && input.locales.length > 0 ? "" : readDefaultIntl("locale"),
      })
    )
  );
