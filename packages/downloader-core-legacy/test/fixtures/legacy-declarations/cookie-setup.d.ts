export declare const COOKIE_BROWSER_IDS: readonly ['chrome', 'chromium', 'firefox', 'edge', 'safari', 'brave', 'opera', 'vivaldi', 'whale'];
export type CookieBrowserId = (typeof COOKIE_BROWSER_IDS)[number];
export type CookieSetupMethod = 'browser' | 'file';
export type CookieSetupReason = 'windows-firefox' | 'windows-file' | 'detected-browser' | 'file-fallback';
export type CookieHealthStatus = 'unconfigured' | 'ok' | 'expired' | 'empty' | 'invalid';
export type CookieHealthSource = 'none' | 'browser' | 'file' | 'extension';
export type CookieHealthReason = 'missing-file' | 'invalid-format' | 'expired' | 'no-session' | 'missing-profile' | 'missing-cookie-db' | 'macos-files-permission' | 'unsupported-browser';
export type CookieSetupFailureKind = 'needed' | 'browser-locked' | 'browser-decrypt' | 'file-invalid' | 'linux-keyring' | 'macos-files-permission' | 'stale';
/** Canonical yt-dlp-adjacent error used when macOS TCC blocks cookie reads. */
export declare const MACOS_BROWSER_COOKIE_PERMISSION_MESSAGE = "macOS Files & Folders permission is required to read browser cookies";
export interface InstalledCookieBrowser {
    id: CookieBrowserId;
    supported: boolean;
}
export interface CookieSetupRecommendation {
    method: CookieSetupMethod;
    browser?: CookieBrowserId;
    reason: CookieSetupReason;
}
export interface CookieSiteMatch {
    id: string;
    label: string;
    expired: boolean;
}
export interface CookieHealth {
    status: CookieHealthStatus;
    source: CookieHealthSource;
    browser?: string;
    cookiesPath?: string;
    sites: CookieSiteMatch[];
    reason?: CookieHealthReason;
}
/** Browser cookie row used to build a Netscape cookies.txt for yt-dlp. */
export interface NetscapeCookieInput {
    domain: string;
    name: string;
    value: string;
    path?: string;
    secure?: boolean;
    httpOnly?: boolean;
    hostOnly?: boolean;
    session?: boolean;
    expirationDate?: number;
}
export declare const COOKIES_GUIDE_URL = "https://vidbee.org/docs/cookies/";
export declare const COOKIES_CHROME_EXTENSION_URL = "https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc";
export declare const COOKIES_FIREFOX_EXTENSION_URL = "https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/";
export declare const VIDBEE_EXTENSION_ID = "kpelcaehdkgleenlldpipjpoopnacehk";
export declare const VIDBEE_EXTENSION_ORIGIN = "chrome-extension://kpelcaehdkgleenlldpipjpoopnacehk";
export declare const VIDBEE_EXTENSION_CHROME_URL = "https://chromewebstore.google.com/detail/kpelcaehdkgleenlldpipjpoopnacehk";
export declare const COOKIE_SITE_SPECS: readonly [{
    readonly id: 'youtube';
    readonly label: 'YouTube';
    readonly domainIncludes: readonly ['youtube.com', 'google.com'];
    readonly cookieNames: readonly ['SID', 'LOGIN_INFO', 'SAPISID', '__Secure-1PSID', '__Secure-3PSID'];
}, {
    readonly id: 'bilibili';
    readonly label: 'Bilibili';
    readonly domainIncludes: readonly ['bilibili.com'];
    readonly cookieNames: readonly ['SESSDATA', 'DedeUserID'];
}, {
    readonly id: 'instagram';
    readonly label: 'Instagram';
    readonly domainIncludes: readonly ['instagram.com'];
    readonly cookieNames: readonly ['sessionid', 'ds_user_id'];
}, {
    readonly id: 'twitter';
    readonly label: 'X';
    readonly domainIncludes: readonly ['x.com', 'twitter.com'];
    readonly cookieNames: readonly ['auth_token', 'ct0'];
}, {
    readonly id: 'tiktok';
    readonly label: 'TikTok';
    readonly domainIncludes: readonly ['tiktok.com'];
    readonly cookieNames: readonly ['sessionid', 'sid_guard', 'sessionid_ss'];
}, {
    readonly id: 'facebook';
    readonly label: 'Facebook';
    readonly domainIncludes: readonly ['facebook.com'];
    readonly cookieNames: readonly ['c_user', 'xs'];
}, {
    readonly id: 'twitch';
    readonly label: 'Twitch';
    readonly domainIncludes: readonly ['twitch.tv'];
    readonly cookieNames: readonly ['auth-token'];
}, {
    readonly id: 'reddit';
    readonly label: 'Reddit';
    readonly domainIncludes: readonly ['reddit.com'];
    readonly cookieNames: readonly ['reddit_session'];
}, {
    readonly id: 'douyin';
    readonly label: 'Douyin';
    readonly domainIncludes: readonly ['douyin.com'];
    readonly cookieNames: readonly ['sessionid', 'sid_guard'];
}];
/**
 * True when yt-dlp can read cookies from this browser on the given OS.
 *
 * @param platform Node `os.platform()` value.
 * @param browser Browser id from settings.
 */
export declare const isBrowserCookieReadSupported: (platform: string, browser: string) => boolean;
/**
 * True when the id is a known cookies-from-browser target.
 *
 * @param value Candidate browser id.
 */
export declare const isCookieBrowserId: (value: string) => value is CookieBrowserId;
/**
 * Display name of the browser a `browserForCookies` setting reads, such as
 * `Brave` for `brave+kwallet:/path/Default`; undefined when none is set.
 *
 * @param browserForCookies Raw `browserForCookies` setting.
 */
export declare const cookieBrowserLabel: (browserForCookies: string | undefined) => string | undefined;
/**
 * Browsers the settings picker should offer for `--cookies-from-browser`.
 *
 * @param platform Node `os.platform()` value.
 */
export declare const listSelectableCookieBrowsers: (platform: string) => CookieBrowserId[];
/**
 * True when the value is a Chromium-family browser that Windows cannot read.
 *
 * @param browser Browser id from settings.
 */
export declare const isWindowsBlockedCookieBrowser: (browser: string) => boolean;
/**
 * Recommend a single cookie setup path from OS and installed browsers.
 *
 * @param input Platform plus browsers detected on disk.
 */
export declare const recommendCookieSetup: (input: {
    platform: string;
    installedBrowsers: readonly InstalledCookieBrowser[];
}) => CookieSetupRecommendation;
/**
 * True when settings currently point at a browser or cookies file.
 *
 * @param browserForCookies Raw `browserForCookies` setting.
 * @param cookiesPath Raw `cookiesPath` setting.
 */
export declare const hasConfiguredCookieSettings: (browserForCookies: string | undefined, cookiesPath: string | undefined) => boolean;
/**
 * Health record used when nothing is configured yet.
 */
export declare const unconfiguredCookieHealth: () => CookieHealth;
/**
 * Parse a Netscape cookies.txt body and report login-cookie health.
 *
 * @param text File contents.
 * @param cookiesPath Optional path to echo back.
 */
export declare const inspectNetscapeCookies: (text: string, cookiesPath?: string) => CookieHealth;
/**
 * Map cookie domain/name rows onto the supported signed-in sites.
 *
 * @param cookies Domain, name, and expiry rows.
 */
export declare const matchCookieSites: (cookies: readonly {
    domain: string;
    name: string;
    expires: number;
}[]) => CookieSiteMatch[];
/**
 * Cookie lookup domains for a download URL, including sibling auth hosts.
 *
 * @param url Download or watch URL.
 */
export declare const cookieDomainsForUrl: (url: string) => string[];
/** Match a cookie host to a domain boundary, never an arbitrary substring. */
export declare function cookieDomainMatches(host: string, domain: string): boolean;
/** Accept configured auth hosts and parent-domain cookies applicable to the requested URL. */
export declare function cookieMatchesUrlScope(cookieDomain: string, url: string): boolean;
/**
 * Serialize browser cookie rows to a Netscape cookies.txt body for yt-dlp.
 *
 * @param cookies Cookie rows from the browser extension.
 */
export declare const serializeNetscapeCookies: (cookies: readonly NetscapeCookieInput[]) => string;
/**
 * True when the sample looks like a Netscape cookies export rather than a DB.
 *
 * @param text File text sample.
 */
export declare const looksLikeNetscapeCookies: (text: string) => boolean;
/**
 * Maximum cookies.txt size we will inspect.
 */
export declare const getMaxCookiesFileBytes: () => number;
/**
 * Map a yt-dlp error to a cookie-setup recovery kind, or null when unrelated.
 *
 * @param rawError Raw stderr or stored download error.
 */
export declare const getCookieSetupFailureKind: (rawError: string | null | undefined) => CookieSetupFailureKind | null;
