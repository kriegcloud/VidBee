import * as A from "effect/Array";
import { dual } from "effect/Function";
import * as P from "effect/Predicate";
import * as Str from "effect/String";

const HTTPONLY_PREFIX = "#HttpOnly_";

import type { NetscapeCookieRow, PlaywrightCookie } from "./Cookies.model.js";

export type { NetscapeCookieRow, PlaywrightCookie } from "./Cookies.model.js";

/** Parse a Netscape cookies.txt body into cookie rows. */
export const parseNetscapeCookieFile = (text: string): NetscapeCookieRow[] => {
  const cookies: NetscapeCookieRow[] = [];
  for (const rawLine of Str.split(text, /\r?\n/)) {
    const line = Str.trim(rawLine);
    if (line.length === 0 || (Str.startsWith("#")(line) && !Str.startsWith(HTTPONLY_PREFIX)(line))) {
      continue;
    }
    const httpOnly = Str.startsWith(HTTPONLY_PREFIX)(line);
    const fields = Str.split(httpOnly ? Str.slice(HTTPONLY_PREFIX.length)(line) : line, "\t");
    if (fields.length < 7) {
      continue;
    }
    const [domainField, , pathField, secureField, expiresField, name, ...rest] = fields;
    if (domainField === undefined || domainField.length === 0 || name === undefined || name.length === 0) {
      continue;
    }
    const value = A.join(rest, "\t");
    const expires = Number.parseInt(expiresField ?? "", 10);
    cookies.push({
      domain: domainField,
      path: P.isTruthy(pathField) ? (pathField ?? "/") : "/",
      secure: Str.toUpperCase(secureField ?? "") === "TRUE",
      expires: Number.isFinite(expires) ? expires : 0,
      name,
      value,
      httpOnly,
    });
  }
  return cookies;
};

/** Convert Netscape rows into Playwright cookie objects. */
const toPlaywrightCookiesDataFirst = (rows: readonly NetscapeCookieRow[], nowSeconds: number): PlaywrightCookie[] => {
  const now = nowSeconds;
  return A.map(rows, (row) => {
    const session = row.expires <= 0 || row.expires <= now;
    const domain = Str.replace(/^\./, "")(row.domain);
    return {
      name: row.name,
      value: row.value,
      domain,
      path: P.isTruthy(row.path) ? row.path : "/",
      expires: session ? -1 : row.expires,
      httpOnly: row.httpOnly,
      secure: row.secure,
      sameSite: "Lax",
    };
  });
};
export const toPlaywrightCookies: {
  (nowSeconds: number): (rows: readonly NetscapeCookieRow[]) => PlaywrightCookie[];
  (rows: readonly NetscapeCookieRow[], nowSeconds: number): PlaywrightCookie[];
} = dual(2, toPlaywrightCookiesDataFirst);
