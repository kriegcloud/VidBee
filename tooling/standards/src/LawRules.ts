import * as A from "effect/Array";
import { dual } from "effect/Function";
import * as Str from "effect/String";
import { LawObservation } from "./Law.model.js";
import type { LawFact } from "./Law.model.js";
import type { SourceRange } from "./Standards.model.js";

const counterparts = [
  "fs",
  "fs/promises",
  "path",
  "path/posix",
  "path/win32",
  "child_process",
  "http",
  "https",
  "console",
  "timers",
  "timers/promises",
  "stream",
  "stream/promises",
  "stream/web",
  "crypto",
];
const canonical = [
  ["effect/Array", "A"],
  ["effect/Option", "O"],
  ["effect/Predicate", "P"],
  ["effect/Record", "R"],
  ["effect/Schema", "S"],
];
const nativeErrors = [
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "ReferenceError",
  "EvalError",
  "URIError",
  "AggregateError",
];
const collections = ["Map", "Set", "WeakMap", "WeakSet"];
const staticFamilies = [
  ["assign", "ObjectConstructor"],
  ["freeze", "ObjectConstructor"],
  ["seal", "ObjectConstructor"],
  ["create", "ObjectConstructor"],
  ["from", "ArrayConstructor"],
  ["of", "ArrayConstructor"],
  ["parse", "DateConstructor"],
  ["UTC", "DateConstructor"],
];
const has = (fact: LawFact, trait: string) => A.contains(fact.traits, trait);
const effect = (fact: LawFact, name: string) =>
  A.some(
    fact.origins,
    (file) => Str.includes(`/effect/dist/${name}.d.ts`)(file) || Str.includes(`/effect/src/${name}.ts`)(file)
  );
const native = (fact: LawFact) =>
  A.some(fact.origins, (file) =>
    /\/(?:typescript|@typescript\/typescript-[^/]+)\/(?:.*\/)?lib\.[^/]+\.d\.ts$/.test(file)
  );
const reference = (fact: LawFact) =>
  A.contains(["PropertyAccessExpression", "ElementAccessExpression", "Identifier"], fact.kind);
const call = (fact: LawFact) => fact.kind === "CallExpression" || fact.kind === "NewExpression";
const namePosition = (fact: LawFact) =>
  A.contains(
    [
      "ImportSpecifier",
      "ExportSpecifier",
      "NamespaceImport",
      "NamespaceExport",
      "ImportClause",
      "VariableDeclaration",
      "BindingElement",
      "PropertyAccessExpression",
      "TypeReference",
      "TypeQuery",
      "QualifiedName",
      "PropertySignature",
    ],
    fact.parentKind
  );
const valueReference = (fact: LawFact) => reference(fact) && !(fact.kind === "Identifier" && namePosition(fact));

/** Recognize raw AST/type observations; downstream classifications cannot disable a predicate.
 * @category utilities
 * @since 0.0.0
 */
export const inspectLaws: {
  (file: string, facts: ReadonlyArray<LawFact>): ReadonlyArray<LawObservation>;
  (facts: ReadonlyArray<LawFact>): (file: string) => ReadonlyArray<LawObservation>;
} = dual(2, (file: string, facts: ReadonlyArray<LawFact>): ReadonlyArray<LawObservation> => {
  let result: ReadonlyArray<LawObservation> = [];
  const add = (
    fact: LawFact,
    rule: string,
    code: string,
    message: string,
    candidate = false,
    range: SourceRange = fact.range
  ) => {
    result = A.append(
      result,
      LawObservation.make({
        rule,
        code,
        kind: candidate ? "candidate" : "violation",
        range,
        subject: `${fact.owner}/${fact.binding === "" ? fact.text : fact.binding}`,
        evidence: [fact.kind, fact.operation, ...fact.origins],
        message,
      })
    );
  };
  for (const fact of facts) {
    if (has(fact, "module-reference")) {
      const module = Str.replace(/^node:/, "")(fact.module);
      if (A.contains(counterparts, module))
        add(fact, "R01", "node-module", `Use the Effect counterpart for ${module}.`);
      if (fact.module === "effect")
        add(fact, "R01", "effect-root", "Use dedicated Effect modules, including re-exports.");
      if (Str.startsWith("@beep/")(module))
        add(fact, "R01", "private-module", "Private reference-repository modules cannot enter the public workspace.");
      if (
        (module === "typescript" || Str.startsWith("typescript/")(module)) &&
        !Str.startsWith("tooling/standards/src/compiler/")(file)
      )
        add(fact, "R01", "compiler-boundary", "Only the owned compiler adapter may reference TypeScript.");
      if (module === "")
        add(fact, "R01", "unresolved-module", "Resolve all possible targets of nonliteral loading.", true);
      for (const [moduleName, alias] of canonical) {
        if (moduleName === module && fact.binding !== "" && fact.binding !== alias && !has(fact, "type-only-module"))
          add(fact, "R01", "namespace-alias", `Use the canonical ${alias} namespace for ${module}.`);
      }
    }
    if (fact.kind === "AnyKeyword") add(fact, "R02", "explicit-any", "Model this type without explicit any.");
    if ((fact.kind === "AsExpression" || fact.kind === "TypeAssertionExpression") && !has(fact, "const-assertion"))
      add(fact, "R02", "type-assertion", "Replace the assertion with a checked protocol or schema.");
    if (fact.kind === "NonNullExpression") add(fact, "R02", "non-null", "Narrow absence explicitly.");
    if (
      (fact.kind === "Comment" || fact.kind === "JSDoc") &&
      /^\s*(?:\/\/|\/\*+|\*)\s*(?:@ts-(?:ignore|expect-error|nocheck)|@effect-diagnostics\b|biome-ignore\b|eslint-disable(?:-next-line|-line)?\b)/m.test(
        fact.text
      )
    )
      add(fact, "R02", "suppression", "Disabling directives are prohibited.");
    if (fact.kind === "TypeOfExpression" && !has(fact, "availability-guard"))
      add(fact, "R03", "runtime-typeof", "Use the Predicate-covered runtime classification.");
    if (call(fact) && native(fact) && A.contains(nativeErrors, fact.operation))
      add(
        fact,
        "R04",
        "native-error",
        "Use a directly schema-backed tagged error; retain boundary bytes in the formatter."
      );
    if (fact.kind === "ThrowStatement" && !has(fact, "schema-error"))
      add(
        fact,
        "R04",
        has(fact, "unresolved-throw") ? "unresolved-throw" : "non-schema-throw",
        "Prove the thrown value is a schema-backed tagged error.",
        has(fact, "unresolved-throw")
      );
    if (
      fact.kind === "VariableDeclaration" &&
      has(fact, "schema-value") &&
      fact.binding !== "" &&
      Str.endsWith("Schema")(fact.binding)
    )
      add(fact, "R05", "schema-suffix", "Use the domain name without a Schema suffix.");
    if (
      fact.kind === "VariableDeclaration" &&
      has(fact, "schema-value") &&
      has(fact, "exported") &&
      !has(fact, "schema-companion")
    )
      add(fact, "R05", "schema-companion", "Export the schema's same-name Type companion.");
    if (
      ((fact.kind === "VariableDeclaration" && has(fact, "schema-value")) || has(fact, "schema-class")) &&
      !has(fact, "canonical-annotation")
    )
      add(fact, "R07", "missing-annotation", "Reusable schema owners require a canonical local composer annotation.");
    if (has(fact, "reusable-generator"))
      add(fact, "R08", "reusable-generator", "Use Effect.fn or Effect.fnUntraced for a reusable generator workflow.");
    if (has(fact, "unnamed-span")) add(fact, "R08", "unnamed-span", "Supply the traced function's stable span name.");
    if (has(fact, "missing-brand"))
      add(fact, "R11", "missing-brand", "Model classes require actual unique-symbol brand structure.");
    if (has(fact, "opaque-instance-member"))
      add(fact, "R11", "opaque-member", "Opaque data has no instance behavior or members.");
    if (has(fact, "model-arrow-field"))
      add(fact, "R11", "model-arrow-field", "Place model behavior on prototype methods or getters.");
    if (has(fact, "literal-domain") && fact.binding !== "" && !Str.includes("/LiteralKit/")(file))
      add(fact, "R12", "literal-domain", "Build reusable named literal domains with LiteralKit.");
    if (has(fact, "undocumented-export"))
      add(fact, "R15", "missing-doc", "Exported owning declarations require a lead, category and since metadata.");
    if (fact.kind === "JSDoc") {
      if (/^\s*\*?\s*@(?:example|remarks)\b/m.test(fact.text))
        add(fact, "R16", "legacy-carrier", "Use titled Example and Details sections instead of legacy carriers.");
      if (/^\s*\*?\s*@(?:return|template|module)\b/m.test(fact.text))
        add(fact, "R16", "tag-spelling", "Use canonical TSDoc tag spellings.");
      if (/^\s*\*?\s*@(param|returns|throws|typeParam)\s+\{/m.test(fact.text))
        add(fact, "R16", "tag-type-braces", "Types belong in declarations, not TSDoc tag braces.");
      if (/^\s*\*?\s*@since\s+(?!0\.0\.0(?:\s|$))/m.test(fact.text))
        add(fact, "R16", "since", "The canonical since version is exactly 0.0.0.");
      if (/^\s*\*?\s*@category\s+(?:exports|re-exports|modules|core|generated|presentation)\b/m.test(fact.text))
        add(fact, "R16", "category", "Use a semantic category rather than repository topology.");
    }
    if (has(fact, "manual-tag-guard"))
      add(fact, "R19", "manual-tag-guard", "Use the installed tagged predicate for a reusable exact tag guard.");
    if (has(fact, "defect-without-stack"))
      add(
        fact,
        "R04",
        "defect-stack",
        "Defect encoding requires includeStack: true; any frozen boundary needs exact D4/D5 evidence."
      );
    if (has(fact, "runtime-boundary"))
      add(fact, "R13", "runtime-owner", "Bind runtime execution to an independently registered runtime owner.", true);
    if (has(fact, "promise-boundary"))
      add(fact, "R13", "promise-driver", "Bind this Promise adapter to a declared driver capability.", true);
    if (fact.kind === "SwitchStatement")
      add(fact, "R06", "switch", "Use Match or a lawful fold and preserve evaluation order.");
    if (call(fact))
      for (const argument of fact.arguments) {
        if (argument.duration && argument.numeric)
          add(
            fact,
            "R09",
            "numeric-duration",
            "Convert the numeric boundary to a Duration with explicit units.",
            false,
            argument.range
          );
        if (
          argument.duration &&
          (argument.type === "any" || argument.type === "unknown" || argument.type === "<unresolved>")
        )
          add(fact, "R09", "unresolved-duration", "Resolve the supplied duration provenance.", true, argument.range);
      }
    if (
      valueReference(fact) &&
      effect(fact, "Schema") &&
      A.contains(["optional", "withDecodingDefault", "OptionFromOptional", "OptionFromOptionalNullOr"], fact.operation)
    )
      add(fact, "R10", "non-exact-optional", "Use an exact key combinator and model present undefined separately.");
    if (
      valueReference(fact) &&
      A.contains(["sort", "toSorted"], fact.operation) &&
      native(fact) &&
      (has(fact, "declaration-owner:Array") || has(fact, "declaration-owner:ReadonlyArray"))
    )
      add(fact, "R14", "native-sort", "Use Effect sorting with an explicit Order.");
    if (
      (fact.kind === "PropertyAccessExpression" || fact.kind === "ElementAccessExpression") &&
      has(fact, "unknown-receiver") &&
      /(?:\.sort|\.toSorted|\[["'](?:sort|toSorted)["']\])$/.test(fact.text)
    )
      add(
        fact,
        "R14",
        "unresolved-sort",
        "Resolve this sort-like receiver before selecting an equivalent operation.",
        true
      );
    if (call(fact) && native(fact) && A.contains(collections, fact.operation))
      add(fact, "R22", "native-collection", "Use an Effect collection with explicit ownership and finalization.");
    if (
      valueReference(fact) &&
      native(fact) &&
      A.some(
        staticFamilies,
        ([operation, owner]) => operation === fact.operation && has(fact, `declaration-owner:${owner}`)
      )
    )
      add(fact, "R22", "native-static", "Use the equivalent Effect module operation.");
  }
  // A call and its callee are one observation. Extracted references remain observable.
  return A.dedupeWith(
    result,
    (left, right) =>
      left.rule === right.rule &&
      left.code === right.code &&
      left.range.start.offset === right.range.start.offset &&
      left.range.end.offset === right.range.end.offset
  );
});
