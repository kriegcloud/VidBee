import { toPlaywrightCookies as convert } from "../../browser-capture/src/cookies.js";
import type { NetscapeCookieRow, PlaywrightCookie } from "../../browser-capture/src/Cookies.model.js";
export { parseNetscapeCookieFile } from "../../browser-capture/src/cookies.js";
export type { NetscapeCookieRow, PlaywrightCookie } from "../../browser-capture/src/Cookies.model.js";
export const toPlaywrightCookies = (rows: readonly NetscapeCookieRow[]): PlaywrightCookie[] => convert(rows, Math.floor(Date.now() / 1000));
