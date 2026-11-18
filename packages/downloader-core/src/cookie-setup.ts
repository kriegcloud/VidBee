import * as A from "effect/Array";
import { dual } from "effect/Function";
import * as MutableHashSet from "effect/MutableHashSet";
import * as Str from "effect/String";
export const COOKIE_BROWSER_IDS = [
  "chrome",
  "chromium",
  "firefox",
  "edge",
  "safari",
  "brave",
  "opera",
  "vivaldi",
  "whale",
] as const;

export type {
  CookieBrowserId,
  CookieHealth,
  CookieHealthReason,
  CookieHealthSource,
  CookieHealthStatus,
  CookieSetupFailureKind,
  CookieSetupMethod,
  CookieSetupReason,
  CookieSetupRecommendation,
  CookieSiteMatch,
  InstalledCookieBrowser,
  NetscapeCookieInput,
} from "./Cookie.model.js";

import type {
  CookieBrowserId,
  CookieHealth,
  CookieSetupFailureKind,
  CookieSetupRecommendation,
  CookieSiteMatch,
  InstalledCookieBrowser,
  NetscapeCookieInput,
} from "./Cookie.model.js";
/** Canonical yt-dlp-adjacent error used when macOS TCC blocks cookie reads. */
export const MACOS_BROWSER_COOKIE_PERMISSION_MESSAGE =
  "macOS Files & Folders permission is required to read browser cookies";

export const COOKIES_GUIDE_URL = "https://vidbee.org/docs/cookies/";
export const COOKIES_CHROME_EXTENSION_URL =
  "https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc";
export const COOKIES_FIREFOX_EXTENSION_URL = "https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/";
export const VIDBEE_EXTENSION_ID = "kpelcaehdkgleenlldpipjpoopnacehk";
export const VIDBEE_EXTENSION_ORIGIN = `chrome-extension://${VIDBEE_EXTENSION_ID}`;
export const VIDBEE_EXTENSION_CHROME_URL = `https://chromewebstore.google.com/detail/${VIDBEE_EXTENSION_ID}`;

const CHROMIUM_FAMILY_BROWSERS = MutableHashSet.fromIterable<CookieBrowserId>([
  "chrome",
  "chromium",
  "edge",
  "brave",
  "opera",
  "vivaldi",
  "whale",
]);

const BROWSER_PREFERENCE: readonly CookieBrowserId[] = [
  "chrome",
  "edge",
  "brave",
  "firefox",
  "chromium",
  "vivaldi",
  "whale",
  "opera",
  "safari",
];

export const COOKIE_SITE_SPECS = [
  {
    id: "youtube",
    label: "YouTube",
    domainIncludes: ["youtube.com", "google.com"],
    cookieNames: ["SID", "LOGIN_INFO", "SAPISID", "__Secure-1PSID", "__Secure-3PSID"],
  },
  {
    id: "bilibili",
    label: "Bilibili",
    domainIncludes: ["bilibili.com"],
    cookieNames: ["SESSDATA", "DedeUserID"],
  },
  {
    id: "instagram",
    label: "Instagram",
    domainIncludes: ["instagram.com"],
    cookieNames: ["sessionid", "ds_user_id"],
  },
  {
    id: "twitter",
    label: "X",
    domainIncludes: ["x.com", "twitter.com"],
    cookieNames: ["auth_token", "ct0"],
  },
  {
    id: "tiktok",
    label: "TikTok",
    domainIncludes: ["tiktok.com"],
    cookieNames: ["sessionid", "sid_guard", "sessionid_ss"],
  },
  {
    id: "facebook",
    label: "Facebook",
    domainIncludes: ["facebook.com"],
    cookieNames: ["c_user", "xs"],
  },
  {
    id: "twitch",
    label: "Twitch",
    domainIncludes: ["twitch.tv"],
    cookieNames: ["auth-token"],
  },
  {
    id: "reddit",
    label: "Reddit",
    domainIncludes: ["reddit.com"],
    cookieNames: ["reddit_session"],
  },
  {
    id: "douyin",
    label: "Douyin",
    domainIncludes: ["douyin.com"],
    cookieNames: ["sessionid", "sid_guard"],
  },
] as const;

const HTTPONLY_DOMAIN_PREFIX = "#HttpOnly_";
const MAX_COOKIES_FILE_BYTES = 2_000_000;

const NEEDED_PATTERNS = [
  "sign in to confirm your age",
  "sign in to confirm you're not a bot",
  "sign in to confirm you’re not a bot",
  "login required",
  "private video",
  "members-only",
  "please log in",
  "please sign in",
];
const STALE_PATTERNS = ["cookies are no longer valid", "http error 403: forbidden"];
const BROWSER_LOCKED_PATTERNS = [
  "could not copy chrome cookie database",
  "could not copy chromium cookie database",
  "could not copy edge cookie database",
];
const COOKIE_DB_MISSING_PATTERN = /could not find [a-z]+ cookies database/;
const COOKIE_DB_MISSING_PATTERNS = [
  "custom safari cookies database not found",
  "could not find chrome cookies database",
  "could not find chromium cookies database",
  "could not find firefox cookies database",
  "could not find edge cookies database",
  "could not find safari cookies database",
  "could not find brave cookies database",
  "could not find opera cookies database",
  "could not find vivaldi cookies database",
  "could not find whale cookies database",
];
const BROWSER_DECRYPT_PATTERNS = ["failed to decrypt with dpapi"];
const FILE_INVALID_PATTERNS = [
  "utf-8' codec can't decode byte",
  "cookies file must be netscape formatted",
  "does not look like a netscape format cookies file",
];
const LINUX_KEYRING_PATTERNS = ["secretstorage not available"];

/**
 * True when yt-dlp can read cookies from this browser on the given OS.
 *
 * @param platform Node `os.platform()` value.
 * @param browser Browser id from settings.
 */
export const isBrowserCookieReadSupported: {
  (browser: string): (platform: string) => boolean;
  (platform: string, browser: string): boolean;
} = dual(2, (platform: string, browser: string): boolean => {
  if (!(browser !== undefined && browser !== null && browser !== "") || browser === "none") {
    return false;
  }
  if (!isCookieBrowserId(browser)) {
    return false;
  }
  if (browser === "safari") {
    return platform === "darwin";
  }
  if (platform === "win32") {
    return browser === "firefox";
  }
  return true;
});

/**
 * True when the id is a known cookies-from-browser target.
 *
 * @param value Candidate browser id.
 */
export const isCookieBrowserId = (value: string): value is CookieBrowserId =>
  (COOKIE_BROWSER_IDS as readonly string[]).includes(value);

const COOKIE_BROWSER_LABELS: Record<CookieBrowserId, string> = {
  chrome: "Chrome",
  chromium: "Chromium",
  firefox: "Firefox",
  edge: "Edge",
  safari: "Safari",
  brave: "Brave",
  opera: "Opera",
  vivaldi: "Vivaldi",
  whale: "Whale",
};

/**
 * Display name of the browser a `browserForCookies` setting reads, such as
 * `Brave` for `brave+kwallet:/path/Default`; undefined when none is set.
 *
 * @param browserForCookies Raw `browserForCookies` setting.
 */
export const cookieBrowserLabel = (browserForCookies: string | undefined): string | undefined => {
  const id = Str.toLowerCase(Str.split(Str.trim(browserForCookies ?? ""), /[+:]/)[0] ?? "");
  return isCookieBrowserId(id) ? COOKIE_BROWSER_LABELS[id] : undefined;
};

/**
 * Browsers the settings picker should offer for `--cookies-from-browser`.
 *
 * @param platform Node `os.platform()` value.
 */
export const listSelectableCookieBrowsers = (platform: string): CookieBrowserId[] =>
  A.filter(COOKIE_BROWSER_IDS, (id) => isBrowserCookieReadSupported(platform, id));

/**
 * True when the value is a Chromium-family browser that Windows cannot read.
 *
 * @param browser Browser id from settings.
 */
export const isWindowsBlockedCookieBrowser = (browser: string): boolean =>
  isCookieBrowserId(browser) && MutableHashSet.has(CHROMIUM_FAMILY_BROWSERS, browser);

/**
 * Recommend a single cookie setup path from OS and installed browsers.
 *
 * @param input Platform plus browsers detected on disk.
 */
export const recommendCookieSetup = (input: {
  platform: string;
  installedBrowsers: readonly InstalledCookieBrowser[];
}): CookieSetupRecommendation => {
  const supportedInstalled = A.map(
    A.filter(
      input.installedBrowsers,
      (entry) => entry.supported && isBrowserCookieReadSupported(input.platform, entry.id)
    ),
    (entry) => entry.id
  );

  if (input.platform === "win32") {
    if (supportedInstalled.includes("firefox")) {
      return { method: "browser", browser: "firefox", reason: "windows-firefox" };
    }
    return { method: "file", reason: "windows-file" };
  }

  for (const browser of BROWSER_PREFERENCE) {
    if (supportedInstalled.includes(browser)) {
      return { method: "browser", browser, reason: "detected-browser" };
    }
  }

  return { method: "file", reason: "file-fallback" };
};

/**
 * True when settings currently point at a browser or cookies file.
 *
 * @param browserForCookies Raw `browserForCookies` setting.
 * @param cookiesPath Raw `cookiesPath` setting.
 */
export const hasConfiguredCookieSettings: {
  (cookiesPath: string | undefined): (browserForCookies: string | undefined) => boolean;
  (browserForCookies: string | undefined, cookiesPath: string | undefined): boolean;
} = dual(2, (browserForCookies: string | undefined, cookiesPath: string | undefined): boolean => {
  const trimmedPath = cookiesPath === undefined || cookiesPath === null ? undefined : Str.trim(cookiesPath);
  if (trimmedPath !== undefined && trimmedPath !== null && trimmedPath !== "") {
    return true;
  }
  const trimmedBrowser =
    browserForCookies === undefined || browserForCookies === null ? undefined : Str.trim(browserForCookies);
  return Boolean(trimmedBrowser && trimmedBrowser !== "none");
});

/**
 * Health record used when nothing is configured yet.
 */
export const unconfiguredCookieHealth = (): CookieHealth => ({
  source: "none",
  status: "unconfigured",
  sites: [],
});

/**
 * Parse a Netscape cookies.txt body and report login-cookie health.
 *
 * @param text File contents.
 * @param cookiesPath Optional path to echo back.
 */
export const inspectNetscapeCookies: {
  (now: number, cookiesPath?: string): (text: string) => CookieHealth;
  (text: string, now: number, cookiesPath?: string): CookieHealth;
} = dual(
  (args) => args.length >= 2,
  (text: string, now: number, cookiesPath?: string): CookieHealth => {
    if (!looksLikeNetscapeCookies(text)) {
      return {
        cookiesPath,
        reason: "invalid-format",
        source: "file",
        status: "invalid",
        sites: [],
      };
    }

    const cookies = parseNetscapeCookieLines(text);
    if (cookies.length === 0) {
      return {
        cookiesPath,
        reason: "no-session",
        source: "file",
        status: "empty",
        sites: [],
      };
    }

    const sites = matchCookieSites(cookies, now);
    if (A.some(sites, (site) => !site.expired)) {
      return {
        cookiesPath,
        source: "file",
        status: "ok",
        sites: A.filter(sites, (site) => !site.expired),
      };
    }
    if (A.some(sites, (site) => site.expired)) {
      return {
        cookiesPath,
        reason: "expired",
        source: "file",
        status: "expired",
        sites,
      };
    }

    return {
      cookiesPath,
      reason: "no-session",
      source: "file",
      status: "empty",
      sites: [],
    };
  }
);

/**
 * Map cookie domain/name rows onto the supported signed-in sites.
 *
 * @param cookies Domain, name, and expiry rows.
 */
export const matchCookieSites: {
  (now: number): (cookies: readonly { domain: string; name: string; expires: number }[]) => CookieSiteMatch[];
  (cookies: readonly { domain: string; name: string; expires: number }[], now: number): CookieSiteMatch[];
} = dual(2, (cookies: readonly { domain: string; name: string; expires: number }[], now: number): CookieSiteMatch[] => {
  const nowSeconds = Math.floor(now / 1000);
  const sites: CookieSiteMatch[] = [];
  for (const spec of COOKIE_SITE_SPECS) {
    const matches = A.filter(
      cookies,
      (cookie) =>
        A.some(spec.domainIncludes, (domain) => cookieDomainMatches(cookie.domain, domain)) &&
        A.some(spec.cookieNames, (name) => name === cookie.name)
    );
    if (matches.length === 0) {
      continue;
    }
    const hasFresh = A.some(matches, (cookie) => cookie.expires === 0 || cookie.expires > nowSeconds);
    sites.push({ expired: !hasFresh, id: spec.id, label: spec.label });
  }
  return sites;
});

/**
 * Cookie lookup domains for a download URL, including sibling auth hosts.
 *
 * @param url Download or watch URL.
 */
export const cookieDomainsForUrl = (url: string): string[] => {
  let hostname = "";
  try {
    const parsed = new URL(url);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      (parsed.username !== undefined && parsed.username !== null && parsed.username !== "") ||
      (parsed.password !== undefined && parsed.password !== null && parsed.password !== "")
    ) {
      return [];
    }
    hostname = Str.toLowerCase(parsed.hostname);
  } catch {
    return [];
  }
  if (!(hostname !== undefined && hostname !== null && hostname !== "")) {
    return [];
  }

  const domains: string[] = [];
  const seen = MutableHashSet.empty<string>();
  for (const spec of COOKIE_SITE_SPECS) {
    if (A.some(spec.domainIncludes, (domain) => cookieDomainMatches(hostname, domain))) {
      for (const fragment of spec.domainIncludes) {
        if (!MutableHashSet.has(seen, fragment)) {
          MutableHashSet.add(seen, fragment);
          domains.push(fragment);
        }
      }
    }
  }
  if (domains.length > 0) {
    return domains;
  }

  // Keep unknown hosts exact; guessing a registrable domain can expose sibling sites.
  return [hostname];
};

/** Match a cookie host to a domain boundary, never an arbitrary substring. */
export const cookieDomainMatches: {
  (domain: string): (host: string) => boolean;
  (host: string, domain: string): boolean;
} = dual(2, (host: string, domain: string): boolean => {
  const normalized = Str.replace(/^\./, "")(Str.toLowerCase(host));
  const normalizedDomain = Str.replace(/^\./, "")(Str.toLowerCase(domain));
  return (
    Boolean(normalizedDomain) && (normalized === normalizedDomain || Str.endsWith(`.${normalizedDomain}`)(normalized))
  );
});

/** Accept configured auth hosts and parent-domain cookies applicable to the requested URL. */
export const cookieMatchesUrlScope: {
  (url: string): (cookieDomain: string) => boolean;
  (cookieDomain: string, url: string): boolean;
} = dual(2, (cookieDomain: string, url: string): boolean => {
  const domains = cookieDomainsForUrl(url);
  if (domains.length === 0) {
    return false;
  }
  return (
    A.some(domains, (domain) => cookieDomainMatches(cookieDomain, domain)) ||
    cookieDomainMatches(new URL(url).hostname, cookieDomain)
  );
});

/**
 * Serialize browser cookie rows to a Netscape cookies.txt body for yt-dlp.
 *
 * @param cookies Cookie rows from the browser extension.
 */
export const serializeNetscapeCookies = (cookies: readonly NetscapeCookieInput[]): string => {
  const lines = ["# Netscape HTTP Cookie File", "# This file was generated by VidBeep", ""];
  for (const cookie of cookies) {
    const name = sanitizeNetscapeField(cookie.name);
    const value = sanitizeNetscapeField(cookie.value);
    if (!(name !== undefined && name !== null && name !== "")) {
      continue;
    }
    const rawDomain = Str.toLowerCase(Str.trim(cookie.domain));
    if (!(rawDomain !== undefined && rawDomain !== null && rawDomain !== "")) {
      continue;
    }
    const hostOnly = Boolean(cookie.hostOnly);
    const httpOnly = Boolean(cookie.httpOnly);
    const session = Boolean(cookie.session);
    const isSecure = Boolean(cookie.secure);
    const hasExpirationDate = Boolean(cookie.expirationDate);
    const dotted = hostOnly || Str.startsWith(".")(rawDomain) ? rawDomain : `.${rawDomain}`;
    const includeSubdomains = Str.startsWith(".")(dotted) ? "TRUE" : "FALSE";
    const domainField = httpOnly ? `${HTTPONLY_DOMAIN_PREFIX}${dotted}` : dotted;
    const expires = session || !hasExpirationDate ? "0" : String(Math.floor(cookie.expirationDate ?? 0));
    const path = (cookie.path === undefined || cookie.path === null ? undefined : Str.trim(cookie.path)) || "/";
    const secure = isSecure ? "TRUE" : "FALSE";
    lines.push(A.join([domainField, includeSubdomains, path, secure, expires, name, value], "\t"));
  }
  return `${A.join(lines, "\n")}\n`;
};

/**
 * Strip Netscape field separators from a cookie name or value.
 *
 * @param value Raw cookie field.
 */
const sanitizeNetscapeField = (value: string): string => Str.replace(/[\t\r\n]/g, "")(value);

/**
 * True when the sample looks like a Netscape cookies export rather than a DB.
 *
 * @param text File text sample.
 */
export const looksLikeNetscapeCookies = (text: string): boolean => {
  const sample = Str.slice(0, 4096)(text);
  return (
    Str.includes("# Netscape HTTP Cookie File")(sample) ||
    Str.includes("# HTTP Cookie File")(sample) ||
    /^(?:#HttpOnly_)?[^\s\t]+\t(?:TRUE|FALSE)\t/im.test(sample)
  );
};

/**
 * Maximum cookies.txt size we will inspect.
 */
export const getMaxCookiesFileBytes = (): number => MAX_COOKIES_FILE_BYTES;

/**
 * True when the error text points at a macOS browser-cookie path.
 *
 * @param normalized Lowercased error text.
 */
const looksLikeMacosCookiePath = (normalized: string): boolean =>
  Str.includes("/library/application support/")(normalized) ||
  Str.includes("/library/containers/")(normalized) ||
  Str.includes("/library/safari")(normalized) ||
  Str.includes("/library/cookies")(normalized);

/**
 * True when yt-dlp could not locate a browser cookies database.
 *
 * @param normalized Lowercased error text.
 */
const isCookieDatabaseMissingError = (normalized: string): boolean =>
  COOKIE_DB_MISSING_PATTERN.test(normalized) ||
  A.some(COOKIE_DB_MISSING_PATTERNS, (pattern) => Str.includes(pattern)(normalized));

/**
 * Map a yt-dlp error to a cookie-setup recovery kind, or null when unrelated.
 *
 * @param rawError Raw stderr or stored download error.
 */
export const getCookieSetupFailureKind = (rawError: string | null | undefined): CookieSetupFailureKind | null => {
  const normalized = Str.toLowerCase(Str.trim(rawError ?? "")) ?? "";
  if (!(normalized !== undefined && normalized !== null && normalized !== "")) {
    return null;
  }
  if (A.some(LINUX_KEYRING_PATTERNS, (pattern) => Str.includes(pattern)(normalized))) {
    return "linux-keyring";
  }
  if (A.some(BROWSER_DECRYPT_PATTERNS, (pattern) => Str.includes(pattern)(normalized))) {
    return "browser-decrypt";
  }
  if (
    Str.includes("files & folders permission is required")(normalized) ||
    (isCookieDatabaseMissingError(normalized) && looksLikeMacosCookiePath(normalized))
  ) {
    return "macos-files-permission";
  }
  if (
    A.some(BROWSER_LOCKED_PATTERNS, (pattern) => Str.includes(pattern)(normalized)) ||
    isCookieDatabaseMissingError(normalized)
  ) {
    return "browser-locked";
  }
  if (A.some(FILE_INVALID_PATTERNS, (pattern) => Str.includes(pattern)(normalized))) {
    return "file-invalid";
  }
  if (A.some(STALE_PATTERNS, (pattern) => Str.includes(pattern)(normalized))) {
    return "stale";
  }
  if (A.some(NEEDED_PATTERNS, (pattern) => Str.includes(pattern)(normalized))) {
    return "needed";
  }
  return null;
};

interface ParsedNetscapeCookie {
  domain: string;
  expires: number;
  name: string;
}

/**
 * Parse Netscape cookie rows from a cookies.txt body.
 *
 * @param text File contents.
 */
export const parseNetscapeCookieLines = (text: string): ParsedNetscapeCookie[] => {
  const cookies: ParsedNetscapeCookie[] = [];
  for (const rawLine of Str.split(text, /\r?\n/)) {
    const line = Str.trim(rawLine);
    if (
      !(line !== undefined && line !== null && line !== "") ||
      (Str.startsWith("#")(line) && !Str.startsWith(HTTPONLY_DOMAIN_PREFIX)(line))
    ) {
      continue;
    }
    const fields = Str.split(line, "\t");
    const domainField = fields[0];
    const expiresField = fields[4];
    const nameField = fields[5];
    if (fields.length < 7 || domainField === undefined || nameField === undefined) {
      continue;
    }
    const domain = Str.startsWith(HTTPONLY_DOMAIN_PREFIX)(domainField)
      ? Str.slice(HTTPONLY_DOMAIN_PREFIX.length)(domainField)
      : domainField;
    const expires = Number.parseInt(expiresField ?? "", 10);
    cookies.push({
      domain: Str.toLowerCase(domain),
      expires: Number.isFinite(expires) ? expires : 0,
      name: nameField,
    });
  }
  return cookies;
};
