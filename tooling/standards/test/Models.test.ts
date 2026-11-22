import { describe, expect, it } from "@effect/vitest";
import * as Arbitrary from "effect/Arbitrary";
import * as Effect from "effect/Effect";
import * as S from "effect/Schema";
import { SourceRange } from "../src/Standards.model.js";

describe("production model properties", () => {
  it.effect.prop(
    "round-trips ordered source ranges through JSON",
    [Arbitrary.schema(SourceRange)],
    Effect.fnUntraced(function* ([range]) {
      expect(range.start.offset).toBeLessThanOrEqual(range.end.offset);
      const json = yield* S.encodeEffect(S.fromJsonString(SourceRange))(range);
      const decoded = yield* S.decodeEffect(S.fromJsonString(SourceRange))(json);
      expect(decoded).toEqual(range);
      return true;
    }),
    { arbitrary: { runs: 25 } }
  );
});
