// Frozen pre-port compiler-emitted declaration closure; kept for compile-time compatibility checks.
export interface PlaywrightCookie {
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'Lax' | 'Strict' | 'None';
}
export interface NetscapeCookieRow {
    domain: string;
    path: string;
    secure: boolean;
    expires: number;
    name: string;
    value: string;
    httpOnly: boolean;
}
/** Parse a Netscape cookies.txt body into cookie rows. */
export declare const parseNetscapeCookieFile: (text: string) => NetscapeCookieRow[];
/** Convert Netscape rows into Playwright cookie objects. */
export declare const toPlaywrightCookies: (rows: readonly NetscapeCookieRow[]) => PlaywrightCookie[];
