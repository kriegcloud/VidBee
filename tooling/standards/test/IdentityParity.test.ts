import { describe, expect, it } from "@effect/vitest";
import { $DbId, $I18nId, $LoggerId } from "@vidbee/identity/packages";
import * as Arbitrary from "effect/Arbitrary";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as S from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";
import * as SchemaIssue from "effect/SchemaIssue";
import { TranscriptRow } from "../../../packages/db/src/Transcripts.model.js";
import { I18nInitializationError } from "../../../packages/i18n/src/I18n.errors.js";
import { LoggerOptions } from "../../../packages/logger/src/Logger.model.js";
import { ClientSink, NodeSink } from "../../../packages/logger/src/Logger.service.js";

const retainedLogger = LoggerOptions.pipe(
  $LoggerId
    .create("Logger.model")
    .annoteSchema("LoggerOptions", { description: "Logger options retain their original failure formatter identity." })
);
const errorAnnotations = $I18nId
  .create("I18n.errors")
  .annoteError<RetainedError>("I18nInitializationError", { description: "Preserved omitted constructor identity." });
class RetainedError extends S.TaggedError<RetainedError, { readonly brand: unique symbol }>()(
  "I18nInitializationError",
  { cause: S.Unknown },
  errorAnnotations
) {}
const rowAnnotations = $DbId
  .create("Transcripts.model")
  .annoteClass<RetainedRow>("TranscriptRow", { description: "Preserved persisted-row constructor identity." });
class RetainedRow extends S.Class<RetainedRow, { readonly brand: unique symbol }>(TranscriptRow.identifier)(
  TranscriptRow.fields,
  rowAnnotations
) {}
const render = (schema: S.ConstraintDecoder<unknown>, input: unknown) => {
  const result = S.decodeUnknownResult(schema)(input);
  return Result.isFailure(result)
    ? { message: result.failure.message, standard: SchemaIssue.makeFormatterStandardSchemaV1()(result.failure.issue) }
    : { message: "success", standard: [] };
};
describe("real frozen package identities", () => {
  it.effect("preserves default and Standard Schema failure text for old identifier absence", () =>
    Effect.sync(() => {
      expect(SchemaAST.resolveIdentifier(retainedLogger.ast)).toBeUndefined();
      for (const input of [null, 1, "wrong", {}, { service: 1 }, { service: "test", pretty: "wrong" }]) {
        expect(render(retainedLogger, input)).toEqual(render(LoggerOptions, input));
      }
    })
  );
  it.effect("keeps omitted tagged-error identity, marker, tag and emitted string surfaces", () =>
    Effect.gen(function* () {
      const old = I18nInitializationError.make({ cause: "fixture" });
      const current = RetainedError.make({ cause: "fixture" });
      expect("identifier" in errorAnnotations).toBe(false);
      expect(RetainedError.identifier).toBe(I18nInitializationError.identifier);
      expect(current.name).toBe(old.name);
      expect(current._tag).toBe(old._tag);
      expect(current.toString()).toBe(old.toString());
      expect("~effect/Schema/Class/I18nInitializationError" in current).toBe(
        "~effect/Schema/Class/I18nInitializationError" in old
      );
      expect(SchemaAST.resolveIdentifier(RetainedError.ast)).toBe(
        SchemaAST.resolveIdentifier(I18nInitializationError.ast)
      );
      const oldEncoded = yield* S.encodeEffect(I18nInitializationError)(old);
      const currentEncoded = yield* S.encodeEffect(RetainedError)(current);
      expect(currentEncoded).toEqual(oldEncoded);
    })
  );
  it.effect("keeps real service runtime keys equal to frozen composer values", () =>
    Effect.sync(() => {
      expect($LoggerId.create("Logger.service")`NodeSink`).toBe(NodeSink.key);
      expect($LoggerId.create("Logger.service")`ClientSink`).toBe(ClientSink.key);
    })
  );
  it.effect.prop(
    "preserves explicit persisted-class identity and encoded rows",
    [Arbitrary.schema(TranscriptRow)],
    Effect.fnUntraced(function* ([old]) {
      const current = RetainedRow.make(old);
      expect(RetainedRow.identifier).toBe(TranscriptRow.identifier);
      expect(rowAnnotations.identifier).toBe(TranscriptRow.identifier);
      expect(SchemaAST.resolveIdentifier(RetainedRow.ast)).toBe(SchemaAST.resolveIdentifier(TranscriptRow.ast));
      const oldEncoded = yield* S.encodeEffect(TranscriptRow)(old);
      const currentEncoded = yield* S.encodeEffect(RetainedRow)(current);
      expect(currentEncoded).toEqual(oldEncoded);
      return true;
    }),
    { arbitrary: { runs: 25 } }
  );
});
