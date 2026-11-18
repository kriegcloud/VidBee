import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as S from "effect/Schema";
export const CookieBrowserId = LiteralKit([
  "chrome",
  "chromium",
  "firefox",
  "edge",
  "safari",
  "brave",
  "opera",
  "vivaldi",
  "whale",
]);
export type CookieBrowserId = typeof CookieBrowserId.Type;

export const CookieSetupMethod = LiteralKit(["browser", "file"]);
export type CookieSetupMethod = typeof CookieSetupMethod.Type;

export const CookieSetupReason = LiteralKit(["windows-firefox", "windows-file", "detected-browser", "file-fallback"]);
export type CookieSetupReason = typeof CookieSetupReason.Type;

export const CookieHealthStatus = LiteralKit(["unconfigured", "ok", "expired", "empty", "invalid"]);
export type CookieHealthStatus = typeof CookieHealthStatus.Type;

export const CookieHealthSource = LiteralKit(["none", "browser", "file", "extension"]);
export type CookieHealthSource = typeof CookieHealthSource.Type;

export const CookieHealthReason = LiteralKit([
  "missing-file",
  "invalid-format",
  "expired",
  "no-session",
  "missing-profile",
  "missing-cookie-db",
  "macos-files-permission",
  "unsupported-browser",
]);
export type CookieHealthReason = typeof CookieHealthReason.Type;

export const CookieSetupFailureKind = LiteralKit([
  "needed",
  "browser-locked",
  "browser-decrypt",
  "file-invalid",
  "linux-keyring",
  "macos-files-permission",
  "stale",
]);
export type CookieSetupFailureKind = typeof CookieSetupFailureKind.Type;

export const InstalledCookieBrowser = S.Struct({
  id: CookieBrowserId.pipe(S.mutableKey),
  supported: S.Boolean.pipe(S.mutableKey),
});
export type InstalledCookieBrowser = typeof InstalledCookieBrowser.Type;

export const CookieSetupRecommendation = S.Struct({
  method: CookieSetupMethod.pipe(S.mutableKey),
  browser: CookieBrowserId.pipe(S.optional, S.mutableKey),
  reason: CookieSetupReason.pipe(S.mutableKey),
});
export type CookieSetupRecommendation = typeof CookieSetupRecommendation.Type;

export const CookieSiteMatch = S.Struct({
  id: S.String.pipe(S.mutableKey),
  label: S.String.pipe(S.mutableKey),
  expired: S.Boolean.pipe(S.mutableKey),
});
export type CookieSiteMatch = typeof CookieSiteMatch.Type;

export const CookieHealth = S.Struct({
  status: CookieHealthStatus.pipe(S.mutableKey),
  source: CookieHealthSource.pipe(S.mutableKey),
  browser: S.String.pipe(S.optional, S.mutableKey),
  cookiesPath: S.String.pipe(S.optional, S.mutableKey),
  sites: S.Array(CookieSiteMatch).pipe(S.mutable, S.mutableKey),
  reason: CookieHealthReason.pipe(S.optional, S.mutableKey),
});
export type CookieHealth = typeof CookieHealth.Type;

export const NetscapeCookieInput = S.Struct({
  domain: S.String.pipe(S.mutableKey),
  name: S.String.pipe(S.mutableKey),
  value: S.String.pipe(S.mutableKey),
  path: S.String.pipe(S.optional, S.mutableKey),
  secure: S.Boolean.pipe(S.optional, S.mutableKey),
  httpOnly: S.Boolean.pipe(S.optional, S.mutableKey),
  hostOnly: S.Boolean.pipe(S.optional, S.mutableKey),
  session: S.Boolean.pipe(S.optional, S.mutableKey),
  expirationDate: S.Finite.pipe(S.optional, S.mutableKey),
});
export type NetscapeCookieInput = typeof NetscapeCookieInput.Type;
