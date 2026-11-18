export interface BrowserCookiesSetting {
    browser: string;
    profile: string;
}
export declare const parseBrowserCookiesSetting: (value: string | undefined) => BrowserCookiesSetting;
export declare const buildBrowserCookiesSetting: (browser: string, profile: string) => string;
