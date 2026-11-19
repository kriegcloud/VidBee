import { dual } from "effect/Function";
import * as Option from "effect/Option";
import * as Str from "effect/String";
export interface BrowserCookiesSetting {
  browser: string;
  profile: string;
}

const normalizeProfileInput = (value: string): string => Str.replace(/^['"]|['"]$/g, "")(Str.trim(value));

export const parseBrowserCookiesSetting = (value: string | undefined): BrowserCookiesSetting => {
  const hasValue = Boolean(value);
  if (value === undefined || !hasValue || value === "none") {
    return { browser: "none", profile: "" };
  }

  const separatorIndex = Option.getOrElse(Str.indexOf(":")(value), () => -1);
  if (separatorIndex === -1) {
    return { browser: value, profile: "" };
  }

  const browser = Str.trim(Str.slice(0, separatorIndex)(value));
  const profile = normalizeProfileInput(Str.slice(separatorIndex + 1)(value));
  return { browser: browser || "none", profile };
};

export const buildBrowserCookiesSetting: {
  (profile: string): (browser: string) => string;
  (browser: string, profile: string): string;
} = dual(2, (browser: string, profile: string): string => {
  const trimmedBrowser = Str.trim(browser);
  if (
    !(trimmedBrowser !== undefined && trimmedBrowser !== null && trimmedBrowser !== "") ||
    trimmedBrowser === "none"
  ) {
    return "none";
  }

  const trimmedProfile = normalizeProfileInput(profile);
  return trimmedProfile !== undefined && trimmedProfile !== null && trimmedProfile !== ""
    ? `${trimmedBrowser}:${trimmedProfile}`
    : trimmedBrowser;
});
