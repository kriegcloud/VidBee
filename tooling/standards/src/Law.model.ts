import { $StandardsId } from "@vidbee/identity/packages";
import * as S from "effect/Schema";
import { SourceRange } from "./Standards.model.js";

const $I = $StandardsId.create("Law.model");
/** Snapshot-owned argument provenance transferred as plain data.
 * @category schemas
 * @since 0.0.0
 */
export class ArgumentFact extends S.Opaque<ArgumentFact, { readonly brand: unique symbol }>()(
  S.Struct({
    text: S.String,
    type: S.String,
    parameter: S.String,
    parameterDeclarations: S.Array(S.String),
    numeric: S.Boolean,
    duration: S.Boolean,
    range: SourceRange,
  }).pipe($I.annoteSchema("ArgumentFact", { description: "Instantiated argument and original parameter provenance." }))
) {}
/** Plain semantic evidence for one smallest AST subject; no upstream object escapes.
 * @category schemas
 * @since 0.0.0
 */
export class LawFact extends S.Opaque<LawFact, { readonly brand: unique symbol }>()(
  S.Struct({
    kind: S.String,
    owner: S.String,
    text: S.String,
    range: SourceRange,
    parentKind: S.String,
    parentText: S.String,
    operation: S.String,
    origins: S.Array(S.String),
    type: S.String,
    module: S.String,
    binding: S.String,
    traits: S.Array(S.String),
    arguments: S.Array(ArgumentFact),
  }).pipe(
    $I.annoteSchema("LawFact", { description: "Owned AST and resolved declaration evidence for law predicates." })
  )
) {}
/** A raw observation remains counted whether recognition is certain or requires review.
 * @category schemas
 * @since 0.0.0
 */
export class LawObservation extends S.Opaque<LawObservation, { readonly brand: unique symbol }>()(
  S.Struct({
    rule: S.String,
    code: S.String,
    kind: S.Literals(["violation", "candidate"]),
    range: SourceRange,
    subject: S.String,
    evidence: S.Array(S.String),
    message: S.String,
  }).pipe(
    $I.annoteSchema("LawObservation", { description: "Raw observations precede classification and debt accounting." })
  )
) {}
