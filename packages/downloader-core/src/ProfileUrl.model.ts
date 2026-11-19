import * as S from "effect/Schema";
import * as Transformation from "effect/SchemaTransformation";
import * as Str from "effect/String";

/** URL boundary matching zod URL decoding, including surrounding whitespace. */
export const ProfileUrl = S.Trim.pipe(
  S.decodeTo(
    S.String,
    Transformation.transform({
      decode: (value) => Str.replace(/[\t\n\r]/g, "")(value),
      encode: (value) => value,
    })
  )
).check(
  S.makeFilter((value) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  })
);
