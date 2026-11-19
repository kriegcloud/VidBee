import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as S from "effect/Schema";

export const SameSite = LiteralKit(["Lax", "Strict", "None"]);
export const NetscapeCookieRow = S.Struct({
  domain: S.String.pipe(S.mutableKey),
  path: S.String.pipe(S.mutableKey),
  secure: S.Boolean.pipe(S.mutableKey),
  expires: S.Finite.pipe(S.mutableKey),
  name: S.String.pipe(S.mutableKey),
  value: S.String.pipe(S.mutableKey),
  httpOnly: S.Boolean.pipe(S.mutableKey),
});
export type NetscapeCookieRow = typeof NetscapeCookieRow.Type;
export const PlaywrightCookie = S.Struct({
  ...NetscapeCookieRow.fields,
  sameSite: SameSite.pipe(S.mutableKey),
});
export type PlaywrightCookie = typeof PlaywrightCookie.Type;
