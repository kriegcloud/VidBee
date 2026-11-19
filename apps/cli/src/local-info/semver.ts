import * as A from "effect/Array";
import { dual } from "effect/Function";
import * as Str from "effect/String";
export const compareSemver: {
  (a: string, b: string): number;
  (b: string): (a: string) => number;
} = dual(2, (a: string, b: string): number => {
  const [aMain = "", aPre = ""] = Str.split("-")(a);
  const [bMain = "", bPre = ""] = Str.split("-")(b);
  const aParts = A.map(Str.split(".")(aMain), (p) => Number.parseInt(p, 10) || 0);
  const bParts = A.map(Str.split(".")(bMain), (p) => Number.parseInt(p, 10) || 0);
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const av = aParts[i] ?? 0;
    const bv = bParts[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  if (aPre === bPre) return 0;
  if (aPre === "") return 1; // 0.1.0 > 0.1.0-rc.1
  if (bPre === "") return -1;
  return aPre < bPre ? -1 : 1;
});
