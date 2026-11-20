import * as Option from "effect/Option";
import * as Str from "effect/String";

const CONTROL_ESCAPE: Record<number, string> = {
  8: "\\b",
  9: "\\t",
  10: "\\n",
  12: "\\f",
  13: "\\r",
};
export const isJsonControlCharError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /control character in string literal/i.test(message);
};
export const escapeJsonStringControlChars = (raw: string): string => {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const char of raw) {
    const code = Option.getOrElse(Str.charCodeAt(0)(char), () => Number.NaN);
    if (!inString) {
      if (char === '"') {
        inString = true;
      }
      out += char;
      continue;
    }
    if (escaped) {
      out += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      out += char;
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = false;
      out += char;
      continue;
    }
    if (code <= 0x1f) {
      out += CONTROL_ESCAPE[code] ?? `\\u${Str.padStart(4, "0")(code.toString(16))}`;
      continue;
    }
    out += char;
  }
  return out;
};
