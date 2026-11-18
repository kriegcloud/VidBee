/**
 * Default profile root directories for a browser on this OS.
 *
 * @param platform Node `os.platform()` value.
 * @param homeDir User home directory.
 * @param browser Browser id.
 */
export declare const getBrowserProfileBaseDirs: (platform: string, homeDir: string, browser: string) => string[];
/**
 * Candidate profile folders to probe for a browser.
 *
 * @param platform Node `os.platform()` value.
 * @param homeDir User home directory.
 * @param browser Browser id.
 */
export declare const getBrowserProfileCandidates: (platform: string, homeDir: string, browser: string) => string[];
/**
 * Cookie database filename expected inside a browser profile.
 *
 * @param browser Browser id.
 */
export declare const getBrowserCookieDatabaseName: (browser: string) => string;
/**
 * Relative path segments for cookie databases inside a browser profile.
 * Chromium 96+ may keep cookies at `Network/Cookies` instead of `Cookies`.
 *
 * @param browser Browser id.
 */
export declare const getBrowserCookieDatabaseRelativeSegments: (browser: string) => string[][];
