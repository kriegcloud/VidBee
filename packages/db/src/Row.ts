import * as Effect from "effect/Effect";
import * as S from "effect/Schema";
import { DbRowDecodeError } from "./Db.errors.js";
import type { TableName } from "./Db.errors.js";
/** Decode without placing private row values in the error issue. */
export const decodeRow =
  (table: typeof TableName.Type) =>
  <Schema extends S.Constraint>(schema: Schema) =>
  (input: unknown) =>
    S.decodeUnknownEffect(schema)(input).pipe(
      Effect.mapError(() => DbRowDecodeError.make({ table, issue: "Stored row does not match the table schema" }))
    );
