> VidBee edition. Authority: repository instructions, PLAN A1/A2, and the approved
> [standards tooling design](../../../docs/effect-port/design/standards-tooling.md) precede this edition. D1 deletes existing
> facades in phase 10; D2 uses deterministic scoped ownership; D3 preserves emitted
> error bytes with tagged failures and boundary formatting; D4 adjudicates encoded
> causes per field; D5 requires an exact independently approved parity contract.
> No classification changes a compiler diagnostic, port check, or empty allowlist.
> Adaptations: VidBee branding, package aliases, runtime owners, commands and graph.
> Local enforcement: R01–R22, T01–T08 and RV obligations in the approved design.
> Attribution: adapted from beep-effect `.claude/skills/crispen/references/crispening.md` at `71d246dc5a49d3f41222308b866d42c220cf1ee4`.

# Crispening toolkit and absorption proofs

Use upstream Effect 4.1.4 and actual VidBee exports. The available local toolkit is
`@vidbee/schema/LiteralKit`, `@vidbee/schema/Option`,
`@vidbee/schema/SchemaUtils/withStatics`, and `@vidbee/identity/packages`.
MappedLiteralKit and the reference repository’s default/codec wrappers are unavailable.
Do not recreate a retired upstream facet as an alias. Keep trust boundaries explicit.

## Defaults preserve three distinct contracts

Constructor defaults affect make; decode defaults affect missing input; encoding
still obeys the encoded schema. Bind a typed literal once when inference would
widen it. Do not change present undefined into missing, and never default identity,
authority, provenance, money, or widest-empty fields merely to shorten callers.

```ts
import * as Effect from "effect/Effect"
import * as S from "effect/Schema"
import { strictEqual } from "node:assert"
const Count = S.Int.pipe(S.withConstructorDefault(Effect.succeed(0)))
const Input = S.Struct({ count: Count })
strictEqual(Input.make({}).count, 0)
```

## Statics and guards retain their owner

Use in-body `static readonly is = S.is(Self)` on classes where a guard belongs.
Keep free decode/encode/equivalence operations at the use site. `withStatics`
installs non-codec domain behavior and refuses protocol replacement; composer
annotation preserves descriptors, including symbols and accessors, without reads.

```ts
import { withStatics } from "@vidbee/schema/SchemaUtils/withStatics"
import { $SchemaId } from "@vidbee/identity/packages"
import * as S from "effect/Schema"
import { strictEqual } from "node:assert"
const source = withStatics(S.String.annotate({}), () => ({ empty: "" }))
const result = source.pipe($SchemaId.create("LiteralKit/LiteralKit.schema").annoteSchema("Text", {description: "Text with an empty domain value."}))
strictEqual(result.empty, "")
```

## Literal domains collapse equivalent families

LiteralKit supplies `.Enum`, `.is`, `.pick`, `.omit`, `.match`, `.mapMembers` and
`.toTaggedUnion`. Non-string literal keys retain their documented stringification:
`1` becomes `number1`; `true` becomes `true`; `1n` becomes `bigint1n`.
Necessary literal/tuple const assertions remain lawful. Inline LiteralKit tuples
need none. A real per-variant behavior is a reason to retain distinct variants.

```ts
import { LiteralKit } from "@vidbee/schema/LiteralKit"
import { strictEqual } from "node:assert"
const Level = LiteralKit([1, 2, 3])
strictEqual(Level.Enum.number2, 2)
strictEqual(Level.is.number2(2), true)
```

## Identity and typed refusal remain distinct from rendering

New class/error constructor identity agrees with trailing annotation. Frozen
omission and inherited identifiers remain preserved. A schema-backed synchronous
refusal is lawful; absence uses makeOption only when None is already an accepted
outcome. D3 boundary formatters preserve old emitted bytes, and required native
rejections remain in an existing facade until D1 deletion.

```ts
import { $SchemaId } from "@vidbee/identity/packages"
import * as S from "effect/Schema"
import { strictEqual } from "node:assert"
const $I = $SchemaId.create("LiteralKit/LiteralKit.errors")
class Refused extends S.TaggedError<Refused, {readonly brand: unique symbol}>()(
  "Refused", {message: S.String}, $I.annoteError("Refused", {description: "A deliberate refusal."})
) {}
strictEqual(Refused.make({message: "Not admitted."}).message, "Not admitted.")
```

## Absorb equivalent repeated variants

Several heading-like variants differing only in a validated level can become one
variant with a literal level. Retain separate variants when behavior, construction
or encoding differs. Recursive `Type`/`Encoded` namespaces and `S.suspend` are
load-bearing and stay intact. An absorption needs a failing counterexample or
round-trip/property law, not a line-count claim.

```ts
import { LiteralKit } from "@vidbee/schema/LiteralKit"
import * as S from "effect/Schema"
import { strictEqual } from "node:assert"
const Level = LiteralKit([1, 2, 3])
const Heading = S.TaggedStruct("heading", {level: Level, text: S.String})
strictEqual(Heading.make({level: 2, text: "Title"})._tag, "heading")
```

## Normalize domain absence with a reversible boundary codec

Use the OptionFrom family as shorthand for verified concrete APIs such as
`S.OptionFromNullOr`, `S.OptionFromNullishOr`, and `S.OptionFromOptionalKey`.
Do not call the family name. Exact optional keys distinguish missing from present
undefined; required encoded null can decode to None and encode back to null.

```ts
import * as O from "effect/Option"
import { getSomesStruct } from "@vidbee/schema/Option"
import { deepStrictEqual } from "node:assert"
const fields = getSomesStruct({text: O.some("Title"), color: O.none<string>()})
deepStrictEqual(fields, {text: "Title"})
```

## Derive tests from the production model

Property data comes from `Arbitrary.schema` of the production schema. Fixed
historical counterexamples remain beside generated samples. Use `@effect/vitest`
and `bunx --bun vitest run`; no private test-run helper or second test runner.
A segmentation absorption should expose a dual data-first/data-last combinator,
then compare both forms against the same original behavior and sparse/order cases.

```ts
import { expect, it } from "@effect/vitest"
import * as Arbitrary from "effect/Arbitrary"
import * as Effect from "effect/Effect"
import * as S from "effect/Schema"
const Count = S.Int.check(S.isGreaterThanOrEqualTo(0))
it.effect.prop("constructs every admitted count", [Arbitrary.schema(Count)], ([count]) =>
  Effect.sync(() => { expect(Count.make(count)).toBe(count) }), {arbitrary: {runs: 25}})
```

## Split model, behavior and trust-boundary roles intentionally

A `.model.ts` remains pure; pure projections live with their actual owner;
escaping, sanitization and transport adapters retain explicit boundaries and tests.
Choose role companions for the package rather than importing B’s topology.
A schema value becoming a generic factory changes every value-form consumer:
update guard/decode/Example call sites and prove declaration compatibility. For
an Effect protocol, use the upstream typed declaration guard at the consuming
boundary. Never collapse a generic runtime protocol into a pretend plain-data model.
