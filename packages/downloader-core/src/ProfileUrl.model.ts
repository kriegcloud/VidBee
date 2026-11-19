import * as S from "effect/Schema";

/** URL boundary matching zod URL decoding, including surrounding whitespace. */
export const ProfileUrl = S.Trim.check(
  S.makeFilter((value) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  })
);
