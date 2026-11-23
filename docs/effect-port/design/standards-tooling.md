# Standards tooling for the Effect port

Status: fourth design revision. This revision incorporates orchestrator decisions D1–D5, validates scoped ownership and boundary error formatting against the installed packages, and replaces the four resolved objections with their decisions. The production checker, trusted CI workflow, and complete package migrations remain implementation work.

Target: `docs/effect-port/design/standards-tooling.md`.

Review: three independent rounds (2026-11-20). The last one approved the document with one correction to the
`Data.TaggedError` serialization note, which this text includes. Probe programs and outputs cited as `proto-v3`
and `proto-v4` are kept outside the repository, in the orchestrator's tooling notes.

## 1. Purpose, authority, and scope

VidBee needs repository-owned enforcement for the written laws that its compiler and existing `port:check` do not enforce. This design adds:

- VidBee editions of the governing standards.
- A minimum identity package.
- One Effect-based standards checker.
- JSDoc validation, Example compilation, and runnable-Example execution.
- A decreasing debt baseline.
- Permanent identity, review, documentation-obligation, and parity-contract records.

Completion requires zero unresolved mechanical findings and review candidates, deletion of the debt baseline, fresh semantic reviews, and preservation of stored formats and observable behavior. Any admitted `parity-frozen` subjects remain explicitly counted and listed for the owner; they are never reported as ordinary law remediation.

A passing AST scan does not establish that a default is lawful, an error is correctly classified, or a resource has the right lifetime.

The authority order is:

1. Applicable repository instructions and explicit task boundaries.
2. PLAN A1 and A2, as clarified by orchestrator decisions D1–D5.
3. This design and subsequently approved amendments.
4. VidBee’s editions of the standards.
5. The remaining provisions of `PLAN.md` and `PORT-GUIDE.md`, including their amendments.
6. Installed declarations and executable evidence for API behavior.

A1 and A2 outrank a conflicting law. “Observable” means bytes or values leaving the process or the package’s public contract: files, database contents, settings JSON, IPC/RPC payloads, HTTP, CLI stdout/stderr and exit codes, log output, rendered UI, goldens, and a public API still called by an unported consumer. In-memory prototype identity, GC timing, and stack contents that never leave the process are not observable unless a consumer still inspects them.

This design supersedes PLAN D22’s JSDoc waiver, D18’s exclusion of supplemental CLI law checks, and section 10’s documentation deferral. It retains the prohibition on private `@beep/*` dependencies.

**No existing gate may be disabled, skipped, weakened, or given an allowlist entry to obtain conformance.** `standards/effect-allowlist.jsonc` remains empty. Compiler severities, overrides policy, and `port:check` remain unchanged. Neither a review record nor a `parity-frozen` classification can override another mandatory gate.

D1 and D5 determine how the new checker accounts for established contracts:

- `pending-deletion` records existing legacy facades whose contracts end through deletion in phase 10.
- `parity-frozen` records an exact, evidenced conflict that remains after applying D1–D4.

These classifications do not conceal findings or create general exceptions for files, packages, or rule families.

### 1.1 Inspected revisions and evidence

| Item | Verified value |
|---|---|
| VidBee checkout, V | `~/YeeBois/workstation-apps/worktrees/VidBee/port-desktop-foundation` |
| V revision | `9bd97565d1e8bdefad1175598ed11fa3885f50dd` |
| Reference repository, B | `~/YeeBois/projects/beep-effect` |
| B revision | `71d246dc5a49d3f41222308b866d42c220cf1ee4` |
| Effect | `4.1.4` |
| TypeScript package and analysis API | `7.0.2` |
| Patched TypeScript command | `7.0.2+effect-tsgo.0.70.0` |
| `@effect/tsgo` | `0.70.0` |
| tsrs | `7.1.0-beta+effect-tsgo.0.70.0`, packaged as `0.25.0-ts7.1.0-beta` |
| Bun-backed Vitest | `5.1.0` |
| Compiler policy | 150 diagnostic entries: 145 `error`, five `off` |
| tsgo source used for coverage | Tag `@effect/tsgo@0.70.0`, commit `0e722d359c969bdf1b1316f08e8637022cde3cce` |

V’s compiler policy differs from B’s only in the `@vidbee/*` namespace substitution and a comment. PLAN’s historical “187 all-error diagnostics” wording is stale.

TypeScript 7.0.2 supplies analysis. Installed tsrs is authoritative for acceptance diagnostics. Disagreement affecting export resolution or enforcement is an infrastructure failure.

Pin `typescript` exactly to `7.0.2`, replacing its current caret range. Validate tool versions at startup; a mismatch exits `2`. Toolchain updates use the protected policy-migration procedure.

The design review packet retains `proto-v3/` and the new `proto-v4/` evidence. These are scratch evidence paths, not proposed paths beneath `docs/`. Revision evidence is in `proto-v4/provenance-output.json`. V had concurrent desktop-foundation working-tree changes during this revision; those files were not modified by this work. B was clean. Neither repository was written by the probes.

Effect and TypeScript APIs named as implementation choices below were checked through V’s installed packages using API, contract, parity, language, semantic-wrapper, and behavior probes. This revision reran the inherited API/signature, parity, doctest, lawful-Example, and compliant-form checks successfully; see `proto-v4/v3-revalidation.txt` and the corresponding raw reports in `proto-v3/`.

New evidence:

| Probe | Result | Raw evidence |
|---|---|---|
| Scoped ownership kernel and its test, extending V’s downloader tsconfig | tsrs exit `0`, no diagnostics | `proto-v4/validation-output.json` |
| Tagged boundary formatter and Defect encoding | tsrs exit `0`, no diagnostics | `proto-v4/validation-output.json` |
| Unmodified `port:check` over a temporary package containing the compliant probes | One ported config, zero violations, empty allowlist | `proto-v4/validation-output.json` |
| Ownership test under installed Bun-backed Vitest and `@effect/vitest` | One test passed; entries absent after scope closure | `proto-v4/ownership-runtime.txt` |
| Installed tagged-error runtime facts and old/new byte comparison | Boundary bytes equal; `S.TaggedErrorClass` absent | `proto-v4/errors-runtime.txt` |
| TypeScript semantic wrapper probe | Direct, wrapped, indirect, intersection, and union properties recovered | `proto-v4/typescript-wrapper-output.txt` |
| Transcription traversal and compiler trials | Successful current measurements | `proto-v4/traversal-output.txt`, `proto-v4/compiler-timings.txt` |

Important qualifications:

- The full proposed composer implementation is not complete; its signatures and representative annotation uses compile.
- The semantic facade’s ordinary operations were run; complete provenance and purity analyses remain acceptance work.
- `@effect/doctest` and `@effect/docgen` are **not installed in V**. The supplied doctest 4.1.4 artifact was compiled and executed using V’s compiler/runtime dependencies. The docgen peer constraint was verified from the local 4.1.4 reference manifest.
- `S.TaggedErrorClass` is not an installed export. The verified schema constructor is `S.TaggedError`.
- `Data.TaggedError` was exercised to establish D3’s requested runtime facts. It is not selected for production: unchanged tsgo reports `preferSchemaTaggedError`, diagnostic TS377139.
- The ownership probe validates the replacement’s lifetime kernel and cleanup. Integration into the downloader’s real owner and execution of its differential and packaged suites remain package acceptance work.
- No complete production standards gate or whole-application parity run is claimed by these prototypes.

### 1.2 Complete inventory and compiler coverage

`SourceInventory` enumerates tracked files beneath every workspace, root tooling/configuration, and the guidance surfaces in section 7. Local checks also enumerate added and untracked files. CI examines the proposed committed tree.

Every workspace and file receives an explicit classification:

| Classification | Treatment |
|---|---|
| Active | Every applicable rule and compiler stage runs. |
| Compatibility owner | Rules run. Intrinsic boundary distinctions may apply; ownership grants no exemption. |
| Pending port | Exact existing membership and dependency edges are frozen. Admission is monotonic. |
| `pending-deletion` | Existing legacy facade; all new-checker observations are counted, files and subjects cannot grow, and phase 10 proves deletion and absence of imports. |
| `parity-frozen` subject | Exact approved observable contract; rules still inspect it, its classification is independently verified, and its count cannot grow. This is a subject classification, not a directory exclusion. |
| Generated output | Exact output membership, generator, reason, and regeneration proof are recorded. Generator acceptance checks generated source. |
| Third-party/vendor | Exact ownership and reason are recorded. |
| Data/non-executable asset | No executable-AST rules; applicable metadata/configuration checks remain. |
| PLAN exclusion | Exact paths and decision are recorded, including D7 desktop build scripts and A9 vendored Python. |

There are no directory-name exclusions such as “ignore every directory named `build`.” Dependencies and outputs are excluded by recorded ownership, not their spelling.

A newly discovered workspace or unclassified file fails with exit `2`. Ignored executable source in an active root fails inventory validation.

Active source includes:

- `.ts`, `.tsx`, `.mts`, `.cts`.
- `.js`, `.jsx`, `.mjs`, `.cjs`.
- Hand-written `.d.ts`, `.d.mts`, `.d.cts`.
- Tests, support code, configuration, scripts, and entrypoints.
- Extension `src` and `entrypoints`.
- Code-bearing guidance Markdown.

The extension’s manifest name is `vidbee-extension`; desktop’s is `vidbee`. The inspected extension has no `lib` or `components` roots.

Known classification subjects include logger’s `src/script.mjs`, browser-capture’s injected JavaScript and declarations, and transcription’s `sherpa-onnx-node.d.ts`.

**Every active executable file must belong to an actual compiler execution.** Inventory membership alone is insufficient:

1. Record the files inspected by each ordinary compiler project.
2. Generate supplemental analysis projects for active executable files absent from those projects.
3. For JavaScript, extend the owning package configuration with `allowJs: true`, `checkJs: true`, `noEmit: true`, `composite: false`, and `incremental: false`.
4. Preserve semantic strictness and the entire Effect diagnostic policy. Include explicit executable files and their real dependency closure.
5. Run installed tsrs; collect its diagnostics and file coverage.
6. Fail infrastructure validation if an active executable file remains uncovered.

These supplemental projects do not change V’s production TypeScript configurations. Their diagnostics are mandatory; compiler failures cannot be seeded as documentation or standards debt. Existing JavaScript must therefore be repaired before this stage becomes a required green gate.

The real probe reports `preferEffectRecord` for `Object.keys` and `preferEffectArray` for `.map` in JavaScript: `proto-v3/coverage-output.txt`. Those operations cannot escape through V’s current `allowJs: false`.

A `pending-deletion` facade retains its existing compiler-project classification and mandatory checks until deletion. D1 does not newly declare its old native implementation to be a strict Effect package, and it does not relax a config that already extends the strict base. The new checker inventories and counts its applicable laws throughout.

Rules inspect all inventoried ASTs. Deduplication uses actual emitted compiler diagnostics at the same subject, never a blanket exclusion by native member name. An applicable unresolved receiver produces a counted candidate.

A declaration file does not establish that its implementation was checked. R01 inventories declarations describing local JavaScript and freezes active-to-pending edges. Moving code into a compatibility or pending package cannot erase debt while introducing unchecked dependencies.

The final port has no pending units or legacy facades. Reports state their exact scope so a bounded pass cannot be mistaken for whole-repository completion.

### 1.3 What remains review work

The checker does not claim to prove:

- Useful prose, adequate teaching examples, or meaningful conditional tags.
- Domain data versus service protocol, boundary shape, persisted entity, or generic type machinery.
- Lawful absence, defaults, precision, or variant decomposition.
- Error classification, secret-flow safety, observability, or resilience policy.
- Receiver, suspension-point, foreign-object identity, process ownership, or lifetime equivalence.
- Whole packaged-application parity.
- JSDoc link-target resolution, deferred by the source law.
- That an exported error schema’s encoding is a frozen contract merely because the schema is public.

These have generated, attributable review obligations. Review records may establish an intrinsic distinction in a law, such as a retained persisted class. D5 additionally permits the narrowly evidenced parity classification specified in section 9. Neither can satisfy a failed compiler or port gate.

## 2. VidBee editions of the standards

Checking V must not require B to be installed.

Every edition and supporting reference states its B source path, B revision, adaptations, local rule/review IDs, and attribution. `standards/sources.json` records source/local digests.

| VidBee file | B source | Adaptations |
|---|---|---|
| `standards/jsdoc-documentation.md` | `.patterns/jsdoc-documentation.md` | Substitute branding, aliases, paths, commands, and export maps. Replace docgen commands with `docs:check`. Extend zero-legacy checking to active tooling, tests, JavaScript JSDoc, and extension roots. Require canonical categories at completion. Define public reachability and internal-export obligations. Preserve grammar, kind split, tag order, described links, and declaration ownership. Explicitly retain package strictness and Effect severities for Examples. Replace native console observations with assertions or lawful Effect Console execution. Define recognized fence languages, title-bound runnable names, and permanent obligations for every admitted Example and guidance fence. D1 retirement of facade documentation requires the phase-10 deletion proof. |
| `standards/tsgo-policy.json` | `tsconfig.base.json` | Record the normalized 150-entry policy, strictness, aliases, key patterns, and empty overrides. Substitute `@vidbee/*`. Root `tsconfig.base.json` remains executable authority; the projection detects drift. Record both compiler builds and exact TypeScript pin. D1–D5 do not change diagnostics or overrides. |
| `standards/crispen.md` | `.claude/skills/crispen/SKILL.md` | Preserve the ladder, boundary cautions, recursive namespaces, variant distinctions, and absorption proofs. Replace private helpers with upstream APIs or actual V exports. Replace B verification/topology workflows with V gates and review records. Preserve necessary literal/tuple const assertions and in-body class guards. Operational activation/intensity/output-length guidance is not a source-code law. State A1/A2 precedence and deterministic scoped ownership under D2. |
| `standards/effect-first-development.md` | `.claude/skills/effect-first-development/SKILL.md` | Retain E-1 through E-59 numbering. Substitute aliases, identity roots, helper locations, runtime entrypoints, commands, and review surfaces. Correct service-consumption wording to service-class `.use`. Use installed `Config.Redacted`. Restate foundation retirement for V-owned helpers. Incorporate D1 legacy deletion, D2 scoped ownership, D3 tagged errors with byte-preserving boundary formatting, D4 per-site encoded-cause adjudication, and D5 exact parity contracts. Do not invent general native-operation exceptions. |
| `standards/jsdoc-annotation-specialist.md` | `.claude/skills/jsdoc-annotation-specialist/SKILL.md` | Substitute paths, commands, identities, categories, and review surfaces. Reference local grammar. Preserve owning-declaration docs, companions, annotation placement, and post-pass requirements. Explain identifier preservation, class/error identity agreement, public reachability, and non-exempting `@internal`. Documentation records describe admitted D5 contracts without treating them as compiler waivers. |
| `standards/schema-first-development-prompt.md` | `standards/schema-first-development-prompt.md` | Substitute authority, helper catalog, references, package graph, commands, inventories, and final-check workflow. Replace Yeet with exact V receipts. Preserve schema-first order, provenance, file fences, source-item dispositions, type/wire parity, property proofs, and attributable failures. Put A1/A2 and D1–D5 ahead of conflicting transformations. The template does not authorize publication or override PLAN amendments. |

Supporting files:

```text
standards/references/schema-first/
  SKILL.md
  repo-laws.md
  pattern-catalog.md
  local-primitives.md
  examples.md
standards/references/jsdoc/
  conventions.md
  annotation-patterns.md
  agent-lifting-and-greps.md
standards/references/crispen/
  crispening.md
```

The supporting-reference adaptations are:

- Replace every B alias, package root, command, filesystem path, and workflow reference.
- Replace B’s primitive catalog with actual V exports. Do not advertise unavailable helpers.
- Replace example locations with passing public-alias V examples or self-contained teaching examples.
- Replace private SQL integration assumptions with V’s persisted-row ownership and installed integration.
- Replace B foundation topology with V’s graph; introduce no slice reorganization.
- Preserve recursive `Type`/`Encoded` namespaces and class exceptions.
- Distinguish the OptionFrom family shorthand from callable API names.
- Remove historical guidance for the absent `S.optionalWith`.
- Preserve in-body class/error guards; prohibit attached universal codec facades.
- Preserve useful literal/tuple const assertions; prohibit redundant inline LiteralKit assertions.
- Keep MappedLiteralKit unavailable until justified and verified.
- Repair illustrative TypeScript into compilable examples, or classify exact negative fixtures/fragments through protected review records.
- Check negative examples against their expected diagnostics; do not silently omit them.
- Document V’s stricter Example compiler policy and lawful observations.
- Carry forward all pre-repair Example and guidance-fence obligations.
- Explain that D1 facades end by deletion, D2 weak ownership becomes scoped ownership, and D3 native-class reconstruction belongs only in a still-needed legacy facade.
- Apply D4 and D5 per exact field and boundary, never to an entire error module.

Every edition passes the Markdown stage. A copied fence is not trusted because it came from B.

## 3. `@vidbee/identity`

### 3.1 Package and dependency direction

Add private package `packages/identity`, named `@vidbee/identity`.

```text
src/
  Identity.model.ts
  Identity.ts
  Identity.errors.ts
  packages.ts
  internal/composer.ts
  internal/preserveStatics.ts
  internal/compat.generated.ts
  index.ts
test/
```

Its runtime dependency is Effect. It must not depend on `@vidbee/schema`, which consumes identity.

Do not port B’s vocabulary, ontology, IRI, CURIE, or complete generated package registry.

### 3.2 Schemas first

Define persisted data models before behavior:

| Model | Invariant |
|---|---|
| `PackageName` | Exact workspace manifest name, including unscoped applications. |
| `FileChild` | Package-relative source path without final extension; canonical separators; no empty, absolute, `.` or `..` segments. |
| `IdentityName` | Nonempty static declaration/check/key name; no interpolation or traversal. |
| `IdentityLocation` | Package, actual file, child, declaration, and identity kind. |
| `IdentityCompatibilityEntry` | Stable ID, current location, frozen identity/metadata state, original constructor, source evidence, proofs. |
| `IdentityCompatibilityManifest` | Version, frozen revision, entries, move history, digest. |
| `IdentityMove` | Stable ID, old/new locations, unchanged frozen value, disappearance/appearance proof, approval. |

Persisted records use branded Opaque models and schema-derived types. Callable protocols and generic annotation machinery remain TypeScript types/interfaces.

The internal composer is initialized before schemas/errors need annotations. It uses the same deterministic composer implementation and registered identity root. It has no handwritten annotation exemption or public arbitrary-identity override. Invalid-input errors are schema-backed tagged errors annotated through that initialized composer. The bootstrap dependency graph must be tested for initialization cycles.

### 3.3 Exact API

These V-owned signatures compile against installed Effect 4.1.4. Representative Opaque, class, tagged-error, and key uses compile.

```ts
import type * as S from "effect/Schema"

export type Preserved<T extends S.Top> =
  T["Rebuild"] &
  Omit<T, keyof T["Rebuild"] | keyof S.Top>

export type Metadata<T> =
  Omit<
    S.Annotations.Documentation<T>,
    "identifier" | "schemaId" | "title" | "description"
  > & {
    readonly title?: string
    readonly description: string
  }

export type Annotation<T> =
  S.Annotations.Documentation<T> & {
    readonly schemaId: symbol
    readonly title: string
    readonly description: string
  }

export interface Composer {
  (
    parts: TemplateStringsArray,
    ...values: ReadonlyArray<never>
  ): string

  create(file: string): Composer

  annote<T = unknown>(
    name: string,
    metadata: Metadata<T>
  ): Annotation<T>

  annoteClass<T>(
    name: string,
    metadata: Metadata<T>
  ): Annotation<T>

  annoteError<T>(
    name: string,
    metadata: Metadata<T>
  ): Annotation<T>

  annoteSchema(
    name: string,
    metadata: Metadata<unknown>
  ): <T extends S.Top>(self: T) => Preserved<T>

  annoteKey(
    name: string,
    metadata: S.Annotations.Key<unknown> & {
      readonly description: string
    }
  ): <T extends S.Top>(self: T) => T["Rebuild"]
}

export interface PackageIdentity {
  readonly name: string
  create(file: string): Composer
}
```

`Annotation` does not promise a present `identifier`. Its presence/value follows the frozen contract below.

`packages.ts` exports generated roots for actual workspace names, including `$SchemaId`, `$LoggerId`, `$TranscriptionId`, `$ExtensionId`, and, when admitted, `$DesktopId`.

A file binds its actual location:

```text
const $I = $LoggerId.create("Logger.service")
```

Nested children concatenate validated segments. A template accepts exactly one uninterpolated segment. Runtime validation rejects interpolation and malformed JavaScript template arrays.

Templates return `string`; TypeScript does not infer their complete literal result. Restricted evaluation and runtime proof establish the value.

### 3.4 Runtime identity formula

New identities follow tsgo 0.70.0’s default key builder:

1. Discover the manifest package name and root.
2. Compute the source-relative directory.
3. Remove the configured leading `src/`.
4. Remove the final extension.
5. Remove a basename equal to `index`, case-insensitively.
6. Omit the declaration name if it equals the remaining basename, case-insensitively.
7. Join nonempty parts with `/`.

| Package, source, declaration | Result |
|---|---|
| `@vidbee/logger`, `src/Logger.service.ts`, `NodeSink` | `@vidbee/logger/Logger.service/NodeSink` |
| `@vidbee/example`, `src/Foo.ts`, `Foo` | `@vidbee/example/Foo` |
| `@vidbee/example`, `src/nested/index.ts`, `Foo` | `@vidbee/example/nested/Foo` |
| `vidbee-extension`, `src/PopupController.service.ts`, `PopupController` | `vidbee-extension/PopupController.service/PopupController` |

Port the algorithm from pinned `internal/keybuilder/keybuilder.go:45–130`; do not approximate it by unconditional concatenation.

Existing frozen keys take precedence over the formula. The internal generated compatibility table binds a truthful current location to its historical value. Error/domain tags remain separate values.

### 3.5 Identifier-preserving annotations

Freeze every existing named schema, class, error, service, reusable check, and affected key annotation in `standards/identity-parity.json`.

Record inherited/effective metadata, not merely local annotation syntax.

| Frozen subject | Annotation behavior |
|---|---|
| Non-class schema without effective identifier | Add permitted documentation metadata and `schemaId`; omit `identifier`. |
| Schema with effective identifier | Preserve it exactly, including inherited identifiers. |
| Class/error with explicit constructor identifier | Preserve constructor/effective identity; trailing record omits or repeats that value. |
| Tagged error with omitted identifier | Preserve omission. Effective identifier remains its tag; trailing record omits or repeats it. |
| New schema | Use location identity, subject to an actual pre-existing public contract. |
| New class/error | Constructor and trailing identity agree. |

Metadata callers cannot override reserved identity fields. Titles may override the derived title; descriptions are required. `schemaId` uses the resolved logical identity even when operational identifier absence must be preserved.

The runtime probe confirms:

```text
unannotated Struct:       Expected object
metadata, no identifier:  Expected object
metadata plus identifier: Expected @vidbee/p/Inner
```

The Standard Schema formatter changes too. V forwards schema failure messages into deliberate application errors, making this observable.

For an omitted tagged-error identifier, the probe verifies static identifier, instance name, tag, AST identifier, and class marker remain tied to the tag. With an explicit constructor identifier, the instance name follows that identifier; section 11 records the installed runtime facts.

Preserve operational annotations, formatter hooks, and contracted generated-schema output. A metadata addition that changes a contracted output is not an automatic migration. Apply a compliant annotation form first; only a proven remaining A1/A2 conflict can enter D5.

### 3.6 Static preservation

`annoteSchema` annotates/rebuilds the schema and preserves additional caller-owned statics:

1. Keep rebuilt protocol-owned members.
2. Enumerate original own string/symbol keys without evaluating getters.
3. Copy additional descriptors.
4. Preserve accessor and descriptor flags.
5. Throw a typed invariant error if installation fails.
6. Never return a type promising silently dropped statics.

Protocol members include markers, AST, annotation/rebuild, construction, checking, and piping operations.

Port descriptor semantics from:

- `B/packages/foundation/modeling/identity/src/Id.ts`.
- `B/packages/foundation/modeling/identity/src/internal/schemaStatics.ts`.

Do not copy B’s generic assertion. An assertion-free overload contract has compiled; the production implementation still requires descriptor-conflict tests.

Reflection is an implementation primitive already used by B’s preservation algorithm. It does not authorize native collection or object-operation exceptions.

Test retained LiteralKit `.Enum`, `.is`, `.pick`, `.omit`, `.match`, and `.mapMembers`, plus tagged-union helper descriptors.

### 3.7 Other minimum helpers

Add `getSomesStruct` at `@vidbee/schema/Option`:

```ts
import type * as O from "effect/Option"

export type GetSomes<
  T extends Readonly<Record<string, O.Option<unknown>>>
> = Partial<{
  readonly [K in keyof T & string]: O.Option.Value<T[K]>
}>

export function getSomesStruct<
  const T extends Readonly<Record<string, O.Option<unknown>>>
>(self: T): GetSomes<T>
```

Runtime behavior delegates to `R.getSomes`; known heterogeneous keys retain their value types. `None` properties are omitted. The return type does not claim an input key was `Some`.

Add `withStatics` at `@vidbee/schema/SchemaUtils/withStatics`:

```ts
export const withStatics: {
  <T extends object, M extends Record<string, unknown>>(
    self: T,
    methods: (self: T) => M
  ): T & M

  <T extends object, M extends Record<string, unknown>>(
    methods: (self: T) => M
  ): (self: T) => T & M
}
```

It installs non-codec domain statics, rejects protocol replacement/incompatible descriptors, and returns the same object. Composer annotation subsequently preserves them.

The signatures compile. Complete descriptor implementations remain acceptance work.

**Do not add MappedLiteralKit initially.** No inventoried V consumer requires directional encoded/decoded literal helper surfaces. Existing LiteralKit satisfies current assembly requirements. A future consumer must establish direction, duplicate policy, encoded/decoded types, preservation, and exact verified signatures.

### 3.8 Parity proof and moves

The frozen manifest records stable IDs, locations, original expressions, omission state, effective metadata, runtime values/tags, and proofs.

Restricted evaluation accepts only registered roots, literal children, static tags, and trusted compatibility data. Unevaluable identities fail.

Ordinary existing services must satisfy:

```text
frozen key
= restricted composer result
= default location formula
= runtime service key
```

For class/error migration compare:

- Static identifier.
- Instance name.
- Class-marker membership.
- AST identifier.
- Class/instance string representations.
- Tag independently.
- Serialized causes and deliberate messages.

For named schemas compare invalid-input output through schema failure messages, default rendering, and Standard Schema rendering. Cover nested failures, wrong kinds, literals, missing fields, and package deliberate-message fixtures. Structural preservation of formatter annotations is the argument; finite samples support it.

`deterministicKeys` only checks supported literal nodes; composer syntax is not proof. The pinned implementation is `internal/rules/deterministic_keys.go:92–115,126–150`.

The checker therefore:

1. Creates a temporary mirrored repository/package tree.
2. Preserves package-relative paths, basenames, manifests, and configuration ancestry.
3. Changes only temporary outputs/build-info and dependency access.
4. Replaces service key arguments with evaluated literals.
5. Runs installed tsrs under the unchanged policy.
6. Requires ordinary location identities to emit no deterministic-key diagnostic.

Nothing is written beside real source.

A move retains its stable entry ID and frozen runtime value. A protected move record proves old disappearance, new appearance, and no invented history.

Historical location discrepancies remain explicit proof obligations. The real composer source must pass unchanged compilation, and shadow diagnostics are reported exactly. A move or D5 record cannot suppress a mandatory diagnostic or authorize concealing a changed value behind a tag.

### 3.9 Tests

Identity’s first implementation includes validation, static-tag rejection cases, default-builder edge cases, application/test identities, all frozen pairs, shadow checks, move history, identifier absence/inheritance, class/error surfaces, formatter parity, reserved fields, key annotation order, LiteralKit statics, symbols/getters/descriptors, typed failures, and the complete standards/docs gate.

## 4. Checker package

### 4.1 Location and dependencies

Add private `tooling/standards`, named `@vidbee/standards`, and add `tooling/*` to root workspaces.

Dependencies:

- Effect and `@effect/platform-node`.
- `@vidbee/identity`.
- `@vidbee/schema`.
- Public `@effect/doctest` 4.1.4 for transformation/assertion semantics.

Development dependencies use V’s pinned compiler packages, Bun-backed Vitest, and `@effect/vitest`.

No private B package, ts-morph, second TypeScript major, or docgen dependency is added.

### 4.2 Compiler facade

Only `src/compiler/**` may import `typescript/*`.

The facade owns node kinds, ranges, traversal, ownership, provenance, type classification, resolved calls, and diagnostics. Rules do not depend directly on upstream kind numbering.

The probes exercise:

- `API`, `updateSnapshot`, `getProject`, `dispose`, `close`.
- Program source lookup.
- Node traversal and source positions.
- Symbol lookup, aliases, module exports, declaration handles.
- `getTypeAtLocation`, `getPropertiesOfType`, `typeToString`.
- Union narrowing and `getTypes`.

The wrapper probe confirms property recovery through `Readonly`, intermediate aliases, intersections, and union constituents: `proto-v4/typescript-wrapper-output.txt`.

Do not assume the old compiler API. In particular, union constituents are obtained through `getTypes()`, not a `.types` property. The earlier `ts.forEachChild` and `ts.isTypeAssertionExpression` exports were unavailable; node traversal and owned kind mapping replace them.

Full generic-signature provenance, duration provenance, alias escape analysis, and purity closure remain implementation gates.

### 4.3 Schema data model

Persisted plain data uses branded Opaque schemas, same-name types, exact keys, and canonical annotations.

| Model | Fields/invariants |
|---|---|
| `SourcePosition` | Positive line/column; nonnegative UTF-16 offset. |
| `SourceRange` | Ordered start/end. |
| `Finding` | Package, file, rule/code, violation/candidate kind, range, subject, evidence, message, fingerprint. |
| `RuleMetadata` | Stable IDs/codes, laws, predicate version, applicability, fixtures, reviews, zero-only status. |
| `FileDebt` | Exact file; nonnegative counts by code, including unresolved candidates. |
| `BaselinePackage` | Exact package, clean flag, classification, files, debts, derived totals. |
| `Baseline` | Version, policy/scope/classification digests, revision, packages, migration lineage. |
| `ReviewObligation` | Exact generated subject, fingerprint, source/dependency digest, evidence requirements. |
| `ReviewRecord` | Obligation, decision, rationale, proofs, external attestation. |
| `CompatibilityClassification` | Exact subject, frozen contract, intrinsic law distinction, proofs, approval. Cannot override a prohibition or gate. |
| `PendingDeletion` | Exact facade/package identity, existing files and subjects, frozen incoming edges, counts, origin revision, D1 decision, deletion phase `10`, owner-review reference, attestation. |
| `ParityFrozen` | Exact subject and rule/code, preserved observable contract, old-source evidence, oracle/golden identity and digest, conflict proof after D1–D4, gate proof, owner-review reference, attestation, maximum count `1`. |
| `ParityContractManifest` | Version, frozen revision, exact pending-deletion entries, exact parity-frozen entries, derived counts, admission/retirement lineage, digest. |
| `DeletionProof` | Pending-deletion identity, candidate tree digest, absent files/workspace/exports, zero incoming module references and dependency edges, lock/build/gate receipts, reviewer attestation. |
| `DocumentationObligation` | Stable owner/fence IDs, origin kind, minimum Examples/runnable/assertions, lineage and retirement/move approval. |
| `PurityRecord` | Export/fence identity, transitive closure, digest, verdict, evidence, approval. |
| `RunReceipt` | Tool/policy/base/source digests, scope, stages, diagnostics, counts, timings, outcome, run identity; a report, never acceptance authority. |
| `ExampleOrigin` | Owner/title/fence, original/generated ranges, UTF-16 map, language/module kind. |
| `CompilerCoverage` | Exact file-to-project membership and completed compiler stages. |
| `PolicyMigration` | Trusted base/proposal, reason, unchanged-source delta, approvals, canonical result. |

Use installed `S.Int` with bounds, schema collections, constrained paths/digests, and Option for internal absence.

The classification schemas are closed discriminated records. `PendingDeletion` has discriminant `pending-deletion`; `ParityFrozen` has discriminant `parity-frozen`. Arrays contain exact values, not patterns. Unknown fields, duplicate subjects, invalid digests, and references to missing evidence fail decoding.

A `ParityFrozen` contract includes:

| Field | Required meaning |
|---|---|
| `subjectId` | Stable identity independent of line number. |
| `package`, `file`, `declaration`, `member` | Exact current owner and field/operation. |
| `rule`, `code` | The single affected predicate. |
| `observable` | One of stored bytes, wire bytes, stdout, stderr, exit, log, rendered value, or still-consumed public API; with exact boundary. |
| `oldEvidence` | Frozen revision, source expression, and recorded value/bytes. |
| `oracle` | Executable oracle identity, input set/generator, expected digest, command. |
| `conflictProof` | Why compliant adapters, boundary formatting, scoped ownership, or legacy deletion cannot satisfy both contracts. |
| `gateProof` | Fresh unchanged tsgo and `port:check` results. |
| `ownerReview` | Exact `OWNER-REVIEW.md` row. |
| `attestation` | Independent trusted approval bound to subject and dependency digests. |
| `maxCount` | Exactly `1`; aggregate maxima are derived. |

No “all errors in this file” or wildcard subject is representable.

Every unresolved candidate participates in the ratchet. Converting certainty into uncertainty cannot erase debt.

Applicability classifications may establish distinctions the law already makes. D5 can additionally establish an exact parity contract. Reports distinguish lawful classifications, pending-deletion observations, parity-frozen observations, unresolved findings, and incomplete reviews.

### 4.4 Services and layers

| Service | Responsibility |
|---|---|
| `Workspace` | Manifests, graph, exports, projects. |
| `SourceInventory` | Complete classification, ignored files, symlinks, compiler coverage. |
| `CompilerHost` | Snapshot lifetime, facade, supplemental projects, diagnostic agreement. |
| `RuleEngine` | Registry, candidates, deterministic ownership/deduplication. |
| `Documentation` | Ownership, grammar, tags, Markdown/fences. |
| `ExampleCompiler` | Generated projects, strict compilation, mapping. |
| `PurityAnalyzer` | Closures, candidates, invalidation. |
| `ExampleRunner` | Markers, doctest, registration, budgets. |
| `IdentityParity` | Frozen evaluation, runtime proof, literal shadows. |
| `BaselineStore` | Comparison, lowering, migration verification. |
| `ReviewStore` | Obligations and external attestations. |
| `ParityContracts` | D1/D5 admissions, frozen counts, oracle validation, and phase-10 deletion proof. |
| `Reporter` | Human/JSON reports and public-safe paths. |

Use `Context.Service` classes with composer keys, named `Effect.fn` or justified `Effect.fnUntraced`, and installed Layer APIs. The Node entry uses `NodeRuntime.runMain` and platform services.

Filesystem/process capabilities own child lifetimes. Snapshots cannot escape acquisition scope. Tests inject layers except when real process behavior is the assertion.

### 4.5 CLI and output

Root scripts:

```text
standards:check     → standards check
docs:check          → standards docs
standards:baseline  → standards baseline
```

Supported arguments:

```sh
bun run standards:check
bun run standards:check --package @vidbee/transcription
bun run standards:check --package @vidbee/schema --package @vidbee/logger
bun run standards:check --package @vidbee/transcription --require-clean
bun run standards:check --files-from <NUL-separated-file-list>
bun run standards:check --phase 10 --require-clean
bun run standards:check --json

bun run docs:check
bun run docs:check --package @vidbee/schema
bun run docs:check --package @vidbee/schema --require-clean
bun run docs:check --json

bun run standards:baseline --package @vidbee/transcription
bun run standards:baseline --verify-from <trusted-base-revision>
bun run standards:baseline --json
```

The protected launcher additionally passes `--source-root` and `--trusted-root`. Paths select inputs; they confer no policy authority.

- Exact package selectors are repeatable; unknown/empty selections fail.
- File selection expands to complete affected packages.
- Automatic affected planning requires full proof after global changes.
- Explicit package commands remain available as bounded feedback.
- `--require-clean` rejects unresolved debt and incomplete reviews. Admitted parity contracts are reported separately and prevent an unqualified “no exceptions” claim.
- Standards includes docs; docs is the separately callable subset.
- `--phase 10` requires full scope, zero pending port/deletion units, and section 9’s deletion proof. It cannot be combined with package or file selection.
- Local caching follows section 9. Acceptance never trusts serialized cached outcomes.
- No disable, ignore, suppression, exclusion-glob, classification-admission, or source-rewrite argument exists on these commands.

| Exit | Meaning |
|---|---|
| `0` | Selected stages completed and ratchet passed; clean selection also has zero unresolved debt. |
| `1` | Conformance/regression, review, protected-policy, Example, obligation, parity-contract, or deletion-proof failure. |
| `2` | Invalid arguments, inputs, scope, tools, or trusted base. |
| `3` | Incomplete execution, launch/compiler infrastructure failure, timeout, or analysis disagreement. |
| `130` | User interruption. |

Human output includes source location, rule/code, kind, explanation, actual/allowed count, lawful classifications, pending-deletion and parity-frozen counts, and pending reviews.

`--json` emits one versioned object on stdout. Progress and child details use stderr. Include scope, compiler coverage, findings, debt, regressions, classifications, objections, reviews, documentation obligations, timings, and run metadata. Render home paths as `~`.

## 5. Law catalog

`rule + review` means mechanical detection or a counted candidate plus semantic review. A tsgo diagnostic enforces its recognized pattern, not every interpretation of the prose law.

D1–D5 are part of the VidBee editions’ applicability. They do not change the source recognizers or compiler severities.

### 5.1 Effect-first laws

| Law | Requirement | Disposition |
|---|---|---|
| E-1 | Canonical aliases | rule — R01 |
| E-2 | Dedicated modules, including Examples | rule — R01 |
| E-3 | No unsafe syntax/suppressions | rule — R02 |
| E-4 | Typed failures and deliberate synchronous refusal | rule + review — R04, RV04; D3 boundary formatting, D1 facade deletion |
| E-5 | Domain absence becomes Option | rule + review — R21, RV05 |
| E-6 | Predicate-covered runtime checks | rule — R03 |
| E-7 | Effect collections/string/time | tsgo + rule + review — T01, R22, parity; D1/D2 ownership treatment |
| E-8 | Direct tagged errors, identity, causes | rule + review — R04/R07; D3 errors, D4 per-site encoding, D5 exact conflicts |
| E-9 | Public docs and Examples | rule — R15–R18 |
| E-10 | Required gates green | review — RV10, fresh receipts |
| E-11 | Domain schema names | rule — R05 |
| E-12 | Same-name schema types | rule — R05 |
| E-13 | Match/folds over switch/manual array branching | rule + review — R06 |
| E-14 | Canonical annotations | rule — R07 |
| E-15 | Composer service identities | rule — R07, literal-shadow proof |
| E-16 | Literal-domain tagged unions | rule + review — R12/R21, RV16 |
| E-17 | Reusable Effect function forms | rule + review — R08 |
| E-18 | Observability | review — RV18; metric diagnostic assists |
| E-19 | Duration windows | rule + review — R09 |
| E-20 | Exact Option boundaries/typed compaction | rule + review — R10/R21 |
| E-21 | Dual helper forms | tsgo + review — T02 |
| E-22 | Schema JSON codecs | tsgo + rule — T03/R21 |
| E-23 | Codec effects and escaping-error translation | rule + review — R21, RV23 |
| E-24 | Opaque plain data; retained classes | rule + review — R11/R21, RV24 |
| E-25 | Runtime execution boundaries | rule + review — R13 |
| E-26 | Root cause/teardown ownership | review — RV26 |
| E-27 | Promise adapters at boundaries | rule + review — R13 |
| E-28 | Scoped resources | review — RV28; compiler assists; D2 cleanup proof |
| E-29 | Schedule retries | review — RV29; R09 checks durations |
| E-30 | Modeled timeouts | tsgo + review — T04, RV30 |
| E-31 | Child/daemon ownership | review — RV31 |
| E-32 | Significant concurrency explicit | tsgo + review — T05, fan-out review |
| E-33 | Config environment | tsgo + review — T06 |
| E-34 | Redacted secrets/log safety | review — RV34 |
| E-35 | Precise recovery | review — RV35; catch diagnostics assist |
| E-36 | Expected failures versus defects | review — RV36 |
| E-37 | Safe layer sharing | review — RV37 |
| E-38 | Schema owns data | rule + review — R21 |
| E-39 | Protocol exceptions do not hide data | rule + review — R21, RV39 |
| E-40 | Schema defaults | rule + review — R21 |
| E-41 | Schema-derived guards | rule + review — R21, RV41 |
| E-42 | Schema equivalence | rule + review — R21 |
| E-43 | Schema transformations | rule + review — R21 |
| E-44 | Effect sorting with Order | rule — R14; T01 assists |
| E-45 | Domain String coercion | rule + review — R21 |
| E-46 | Flat equivalent boolean selection | rule + review — R20, RV46 |
| E-47 | Flat Option composition | rule + review — R20/R21, RV47 |
| E-48 | Service-class `.use` | review — RV48 |
| E-49 | Path service | tsgo + rule — T07/R01 across all module-reference syntax |
| E-50 | Effect HTTP client | tsgo + review — T08/R13 |
| E-51 | Schema constraints, built-ins first | rule + review — R12/R21 |
| E-52 | Reusable-check metadata | rule — R12 |
| E-53 | LiteralKit named domains | rule — R12 |
| E-54 | Tagged predicates | rule — R19 |
| E-55 | Reusable matcher form | rule — R19 |
| E-56 | Cause rendering | review — RV56; D3 preserves contracted boundary bytes |
| E-57 | Proven terse forms | rule + review — R20 |
| E-58 | Upstream-first retirement | review — RV58, V facet census |
| E-59 | Constructor makeOption where absence is lawful | rule + review — R20, RV59 |

### 5.2 Compiler ownership

Sources are relative to the pinned tsgo tag.

| ID | Diagnostics / implementation | Coverage and limit |
|---|---|---|
| T01 | `preferEffectArray`, `preferEffectRecord`, `preferEffectString`, `globalDate`, `globalDateInEffect`; corresponding snake-case files under `internal/rules/` | Listed native operations. Array coverage includes `toSorted`; array statics include `isArray`. Object coverage includes keys/values/entries/fromEntries/hasOwn/hasOwnProperty. Date covers now/construction. Missing native families belong to R22. |
| T02 | `missingPipeableSignature` / `missing_pipeable_signature.go` | Recognized exported fixed-arity signatures with at least two parameters, excluding rest forms; semantic dual applicability remains reviewed. |
| T03 | `globalJson`, `globalJsonInEffect` / `global_json.go` | Recognized global JSON parse/stringify. |
| T04 | `globalTimers`, `globalTimersInEffect`, `raceFirstWithSleepToTimeout`, `timeoutCatchTagToTimeoutOrElse` | Recognized timer/race/catch patterns; arbitrary algorithms remain reviewed. |
| T05 | `missingConcurrencyOption` / `missing_concurrency_option.go` | Recognized `Effect.all`/`Effect.forEach`; not all fan-out forms or load significance. |
| T06 | `processEnv`, `processEnvInEffect` / `process_env.go` | Recognized environment reads; lookup timing/indirection remain reviewed. |
| T07 | `nodeBuiltinImport` / `node_builtin_import.go` | Top-level imports and particular require initializers. R01 closes re-export, import-equals, dynamic-import, and other require routes. |
| T08 | `globalFetch`, `globalFetchInEffect` / `global_fetch.go` | Recognized global fetch calls; foreign host methods remain reviewed. |

Supporting diagnostics:

| Concern | Diagnostic |
|---|---|
| Errors | `preferSchemaTaggedError`, `redundantSchemaTagIdentifier` |
| Identity | `deterministicKeys` |
| Brands | `schemaClassMissingBrand`, checking argument presence rather than full unique-symbol structure |
| Construction | `newSchemaClass`; `preferUnsafeConstructor` is a separate runtime optimization |
| Codecs | `schemaSync`, `schemaSyncInEffect`, `preferTypedSchemaDecoder` |
| Runtime | `runEffectInsideEffect` |
| Promises | `newPromise`, `lazyPromiseInEffectSync` |
| Resources | `scopeInLayerEffect`, `acquireReleaseDisposable` |
| Functions/metrics | `effectFnOpportunity`, `manualMetricTapToTrack` |
| Unsafe channels | `anyUnknownInErrorContext`, `unsafeEffectTypeAssertion` |

The entire normalized policy remains enforced, including the existing five off entries. This design changes none of their severities.

### 5.3 Additional inventory laws

| Requirement | Disposition |
|---|---|
| Exact optional keys | rule — R10 |
| Fixed tags/required literals | rule — R12 |
| Property data from production schemas | rule + review — R21, RV-PROP |
| Bare Struct only for genuine boundary shape | rule + review — R21, RV-BOUNDARY |
| Constructor/decode/persistence defaults differ | rule + review — R21, RV-DEFAULT |
| Annotate keys before default/Option conversion | rule — R10 |
| No defaults for identity/authority/provenance/money/widest-empty fields | review — RV-NODEFAULT |
| Free codecs; no universal attached facade | rule — R21 |
| No redundant inline LiteralKit const assertion | rule — R02 |
| Crispen absorption and role placement | review — RV-CRISPEN |
| Trust boundaries, recursion, variants, absorption proofs | review — RV-TRUST |
| Domain Effects have no driver/IO/config requirements | review — RV-DOMAIN |
| Prototype methods/getters rather than model arrow fields | rule — R11 |
| Live API/provenance and complete source disposition | review — RV-PROVENANCE |
| Exact receipts, failure attribution, authorization/final review | review — RV-CLOSEOUT |

B-specific foundation path/name topology is `n/a`: V has a different graph and no B dependencies. Export integrity, upstream-first reuse, and intentional placement transfer through R01/R21 and review.

### 5.4 Documentation laws

| Requirement | Disposition |
|---|---|
| Useful one-paragraph lead | R15 structure + editorial review |
| Canonical semantic category | R16 |
| Exact `@since 0.0.0` | R16 |
| Value/type split; owning declarations | R15 |
| Nonempty, unique, ordered sections | R15 |
| When-to-use opener | R15 |
| Nonempty, unique Example titles | R15 |
| Exactly one canonical fence; no loose fence | R15 |
| Examples last; tags follow body | R15 |
| Zero legacy carriers | R16, zero tolerance |
| Conditional tag grammar/order/meaning | R16 + review |
| Described see-links; linked deprecation migration | R16 |
| TSDoc spelling/punctuation | R16 |
| Compilable, observable Examples; no void discard | R17 |
| No deletion to hide failure | Permanent obligations, §9 |
| Named runnable fences/assertion grammar/equality | R18 + doctest |
| Runnable eligibility | R18/PurityAnalyzer |
| Canonical imports and safe code | R01/R02/R17 |
| Construction/provision/dual-owner teaching | RV-DOC-KIND |
| Vacuity/tautology | R18 + editorial review |

## 6. Mechanical rule definitions

### Common semantics

Resolve symbols and provenance through imports, aliases, global bindings, schema factories, property/element access, parentheses, re-exports, and extracted references where statically possible.

Spelling alone does not establish a native or Effect operation. Applicable uncertainty produces a counted candidate.

Each finding owns the smallest offending subject. Deduplicate identical predicates against actual compiler diagnostics by file, span, symbol/operation, and diagnostic family. Overlapping but distinct obligations may remain separate.

All codes require violating/conforming, alias, shadowing, equivalent-syntax, and false-positive fixtures where applicable.

Classification happens after recognition. The report preserves raw observations and their disposition; it never makes a recognizer blind to a frozen subject.

### R01 — Imports, aliases, module references, and boundaries

Separate codes report:

- Noncanonical namespace bindings for Array/Option/Predicate/Record/Schema.
- Root Effect imports/re-exports.
- Function helpers routed through the wrong module.
- Private B manifest dependencies or module references.
- Noncanonical namespace aliases/re-exports.
- Example relative imports or invented/private aliases.
- TypeScript imports outside the compiler adapter.
- Hand-written declarations describing local JavaScript, as review candidates.
- New active-to-pending/legacy edges.
- Prohibited Node module references.

The Node predicate covers every string-bearing module reference: static import, export-from, import-equals, dynamic import, and resolved require calls, including calls nested in expressions or reached through aliases. Normalize `node:` consistently.

The prohibited set is the pinned v4 counterpart map: fs and fs/promises; path, path/posix, path/win32; child_process; http/https; console; timers and timers/promises; stream, stream/promises, stream/web; crypto. Bare and `node:` forms are equivalent. Existing independent port restrictions still apply.

Nonliteral loading is a candidate until its possible targets are resolved. A local barrel re-exporting a prohibited module retains the finding at the originating reference.

For example, `export { join } from "node:path"` and awaited dynamic loading are findings even when tsrs emits no `nodeBuiltinImport`.

For `pending-deletion`, freeze existing incoming edges. No new consumer or alternate route is admitted. Phase 10 requires zero remaining references, including manifest dependencies, aliases, re-exports, and computed loads whose target set includes a facade.

Do not flag shadowed require functions, ordinary A/S values, dedicated-module type imports, or actual public aliases. Node modules without a listed counterpart are not automatically prohibited by this predicate; their capabilities remain reviewed.

Risk: conditional exports and alias resolution. Resolution disagreement fails infrastructure validation.

### R02 — Unsafe syntax and suppressions

Report explicit `any`, type assertions, non-null assertions, and actual TypeScript/Effect/Biome/ESLint disabling directives.

Allow necessary const assertions on literals/tuples. Separately report a const assertion on an inline tuple passed to resolved LiteralKit.

Do not flag `satisfies`, type queries, renames, strings, or explanatory prose. Examples also reject ambient declarations and empty generators.

Risk: generic implementations using assertions remain debt. Assertion-free overloads or redesigned protocols must replace them; tooling has no blanket exception.

### R03 — Predicate-covered runtime typeof

Report runtime typeof classification where Predicate covers the case.

Do not report type queries or direct undefined-availability checks on unbound/ambient platform globals. Verify provenance for document, storage, navigator, and window; do not exempt shadowed locals.

This preserves B’s distinction in `Laws/NoNativeRuntime.ts:356–368`.

Risk: rewriting undeclared-global checks can introduce ReferenceError; other replacements can alter null/function/scalar acceptance.

### R04 — Errors, throws, and causes

Report:

- Global native error call/new construction, including aliases/globalThis.
- Throws not proven schema-backed tagged errors.
- Unresolved error construction/throw candidates.
- Indirect schema-error wrappers where direct tagged errors are required.
- Redundant identifier equal to tag.
- Constructor/trailing identity disagreement.
- Defect causes lacking required stack inclusion.
- New noncomposer explicit identifiers.

A lawful schema-backed synchronous refusal is not reported merely for being synchronous. Review checks timing and refusal semantics.

Apply D3:

1. Internal failures become schema-backed tagged errors.
2. Observable error bytes are produced by an explicit boundary formatter or codec from the tagged error.
3. A still-needed native-class rejection is constructed only in the existing legacy facade, counted under D1, and deleted with it.
4. A native construction in a strict package remains an R04 finding. A D5 record cannot excuse a compiler or port rejection.
5. Only an evidenced inability to reproduce required bytes through a compliant boundary can be proposed under D5.

Apply D4 to each Defect field:

- If its encoding is not persisted and does not cross a frozen boundary, require `includeStack: true`.
- If the encoding is frozen, attempt a lawful separate boundary representation first.
- If an irreconcilable frozen encoding remains, require an exact D5 record for that field, code, and boundary.
- A public export or a retained raw cause object does not by itself prove a frozen schema encoding.

D5 admission does not excuse missing error annotations, non-exact optional keys, or any unrelated finding at the same declaration.

Risk: name, message, formatting, raw cause identity, timing, and encoded stacks can be observable. Prototype identity matters only while a consumer still observes it, as defined by D3.

### R05 — Schema names and companions

For owning schema-valued declarations, report a `Schema` suffix and require an exported same-name `.Type` companion for non-class exported schemas.

Resolve factories/aliases. Unknown schema-like factories are candidates.

Do not flag unrelated names, classes’ inherent types, re-export edges, or generic schema protocols.

Risk: declaration merging and generic factories.

### R06 — Switch and array branching

Report executable switch statements. Manual empty/nonempty array branches become generated review subjects.

Do not flag fixture strings, prose, or type syntax.

Risk: fallthrough, evaluation order, mutation, and return behavior.

### R07 — Annotations and identity

Report reusable named schemas without canonical local annotation; class/error records missing; wrong annotation APIs; handwritten identity records; services without static composer tags; false file children; unevaluable identities; parity mismatches; missing move proof; and constructor/trailing disagreement.

For Opaque, inspect the wrapped schema.

Frozen identifier absence and preserved inherited identifiers are compliant. Anonymous nested primitives need no independent identity.

Risk: metadata inheritance and formatter changes. Do not insert identifiers blindly.

### R08 — Effect functions and spans

Report unnamed traced functions and reusable callables directly returning generator workflows, including surrounding pipes, where fn/untraced forms are required.

Exclude zero-argument Effect values and one-use local workflows.

Preserve existing span names. A previously untraced callable may use `Effect.fnUntraced` to preserve logs/Cause output. Adequacy of observability remains reviewed.

Risk: frames, laziness, arity, and calling convention.

### R09 — Duration inputs

Resolve Effect-owned parameter and nested-property declarations accepting Duration inputs.

Report supplied types containing number: literals, constants, parameters, arithmetic, and numeric union members. Include Schedule duration inputs. Unknown provenance is a candidate.

Exclude Duration values and unrelated numeric parameters.

A numeric public boundary may convert through `Duration.millis` internally, preserving units. Merely naming the number does not clear debt.

Risk: rounding, units, host contracts, and callback timing.

### R10 — Exact keys and annotation order

Report references/results of non-exact optional combinators, including `S.optional`, `S.withDecodingDefault`, `S.OptionFromOptional`, and `S.OptionFromOptionalNullOr`, plus alias/composition equivalents.

Report optional keys whose values admit undefined as boundary-review candidates, including composed unions. A transport contract can lawfully admit present undefined through an explicit value schema; it does not authorize non-exact combinators or internal undefined-based absence.

Report key annotation placed after default/Option-key conversion when metadata is lost.

Exclude ordinary exact optional keys.

Risk: absent/undefined/null distinctions, construction, decoding, and encoding. Section 11 supplies tested boundary forms.

### R11 — Schema class structure

Report missing actual unique-symbol brand structure, Opaque instance members, and schema-model arrow-function instance fields.

Exclude statics, prototype methods/getters, service contracts, and unrelated UI classes.

Retained persisted entities, errors, instance behavior, and extend chains remain lawful class cases.

Risk: prototype, mutability, equality, construction, and encoding.

### R12 — Literal domains, tags, and checks

Report named literal domains built directly with `S.Literals` outside LiteralKit’s implementation; required fixed literal fields lacking tagged forms; and reusable checks missing identity/title/description/message metadata.

Preserve source-law distinctions for optional keys, omit-on-encode tags, multi-literal domains, brand chains, suspension, and extend forms without an equivalent tagged constructor.

In-body class/error guards remain allowed. Universal codec facades belong to R21.

A required-literal migration must preserve construction and encoding. If no compliant equivalent preserves a contracted requirement, adjudicate the exact conflict through D5; a review assertion alone is insufficient.

Risk: tag defaults can change required inputs and encoded shape.

### R13 — Runtime, Promise, and host boundaries

Report runtime execution/creation outside registered runtime owners and Promise adapters outside declared driver capabilities.

Entrypoint/test/facade/driver applicability comes from trusted metadata, not filename alone. Unchanged `port:check` filename rules still run independently.

Examples are miniature runtime boundaries for compilation. Effect Console execution is lawful there but prevents pure execution eligibility.

Exclude returning Effects and foreign Promise method declarations in capability protocols.

Risk: scheduling, provision, ownership, exit behavior, and live host lookup.

### R14 — Sorting

Report resolved native sort/toSorted, literal element access, extracted references, and prototype call/apply/bind routes. Recognizable unresolved sort-like operations are candidates.

Exclude Effect sorting, unrelated domain methods, and typed-array cases without demonstrated equivalence.

Deduplicate ordinary compiler-covered forms by emitted diagnostic.

Risk: mutation, reference identity, stability, sparse arrays, comparator behavior.

### R15 — Documentation ownership and sections

Public owners are declarations reachable through actual export maps and resolution conditions, following aliases and deduplicating owners. Applications use trusted entrypoint/API inventories.

Require public owners to have lead/category/since, with Examples for values. Pure types may omit Examples.

Internal module exports require lead/category/since. Optional internal Examples must compile and, once admitted, cannot disappear without approved retirement/transfer.

Collapse overloads onto the outer owner. Runtime namespaces are values. Re-export edges are not new owners.

The class owner requires an Example; V does not add B’s extra class-member Example expansion. Members remain editorial/API review subjects.

Neither internal nor ignore tags bypass public reachability.

Check grammar, section order, nonempty sections, openers, titles, exactly one canonical fence, no loose TypeScript fences, Examples last, and tags after body.

Risk: conditional exports, merges, overload attachment, Markdown parsing.

### R16 — Tags and metadata

Check canonical categories, exact since, conditional-tag grammar/order, described see-links, and linked deprecation migration.

Reject legacy Example/remarks carriers in actual active-source JSDoc, including nonexports, with zero tolerance. Reject forbidden tag spellings, type braces, and misplaced hyphens.

Do not scan negative fixture strings as source JSDoc.

Risk: multiline tags and nested links require structural parsing.

### R17 — Compilation and observations

Compile all admitted Examples and applicable guidance fences. Map diagnostics to origin.

Reject void-discard observations, bare identifiers/satisfies expressions offered as runtime observations, empty demonstrations, and runtime Examples that never consume/assert documented behavior.

Meaningful type-level demonstrations remain compile-only. Runtime observations use assertions or explicit lawful Effect execution. Native console diagnostics remain mandatory.

Risk: heuristics cannot establish teaching quality; review remains necessary.

### R18 — Runnable fences and assertion integrity

Require:

```text
ts import.meta.vitest name="<enclosing Example title>"
```

The name equals the title, using supported quoting.

For each actual assertion marker require an expression statement or one initialized const identifier, explicit control-flow blocks, one emitted assertion, a typechecked expected expression in lexical scope, pure dependencies, and non-vacuous use of the documented/imported binding.

Literal tautologies and type-only fences disguised as runtime tests are findings.

Markers without metadata fail. Proven-eligible substantive pure fences without metadata produce `unmarked-eligible`. Unknown purity is counted and does not execute.

Expected Option constructors are lawful when pure. Calls are not rejected merely for being calls.

Runnable transformation is initially restricted to canonical `ts`. Other guidance languages compile with their preserved kinds; they do not acquire runnable eligibility by extension rewriting.

Risk: purity is not a sandbox.

### R19 — Tagged predicates and matchers

Report reusable manual tag guards equivalent to installed tagged predicates, and reusable callables whose whole returned matcher starts from their own input through value matching.

Exclude one-off matches, extra semantic conditions, and comparisons returning domain data.

Risk: narrowing and evaluation differences.

### R20 — Terse forms and makeOption

Report proven-equivalent unary forwarding wrappers, passthrough callbacks, recognized empty-object Option compaction, and resolved `O.some(X.make(...))` where the constructor exposes `makeOption`.

The last code starts with zero debt allowance. Absence must already be lawful. A refusal branch retains construction/failure semantics and is classified under the law’s own absence restriction; it is not forced into None.

Exclude receiver-bound, argument-count-sensitive, lazy, suspension, and error-boundary wrappers without equivalent behavior. Recognizable ambiguity is a candidate.

Risk: receiver, arity, eagerness, frames, refusal policy.

### R21 — Schema-first candidates

Port every SchemaFirst family. B’s advisory/nonblocking policy does not transfer.

| Family | Predicate |
|---|---|
| `data-model` | Exported interface **or type alias with a resolved schema-representable data shape**, lacking a same-name schema companion. |
| `struct-model` | Exported top-level Struct-like schema not already a class/Opaque input. |
| `SFV4-null-return` | Callable result includes null/undefined outside a recognized carrier; inspect explicit and inferred types. |
| `SFV4-defaults` | Nonempty fallback/default merges or object fallbacks in schema-associated code. |
| `SFV4-equivalence` | Manual comparisons on schema-derived operands or associated equality helpers. |
| `regex-guard` | Reusable domain guard or boundary validation using resolved RegExp test. |
| `SFV4-normalization` | Exported boundary normalization outside model transformation. |
| `string-coercion` | Global String coercion in domain/boundary logic. |
| `SFV4-getsomes-struct` | Record compaction over a fixed-key object/alias. |
| `SFV4-boundary-codec` | JSON boundary or escaping codec error without demonstrated translation. |
| `SFV4-fn-schema` | Exported callable with inline data-shaped input/output in schema-modeled code. |
| `SFV4-numeric-domain` | Broad numeric schemas for operational timeout/count/size/rate/limit/ms/seconds fields. |
| `SFV4-precision-audit` | Broad string schemas for email-named fields. |
| `SFV4-static-api` | Manual discriminator helpers over literal/tagged domains. |
| `SFV4-arbitrary-tests` | Schema-focused test without a property consuming its production-derived arbitrary; exclude unknown-JSON plumbing. |
| `SFV4-default-wrapper` | Forwarding default wrapper without uncovered behavior. |
| `SFV4-opaque-wrapper` | Defect/unknown wrapper duplicating upstream intent. |
| `SFV4-codec-static` | Attached universal codec maps or equivalent retired wrappers; exclude in-body guards. |

The `data-model` entry predicate is semantic, not immediate syntax:

1. Enumerate every owning exported interface/type alias.
2. Resolve aliases, mapped wrappers, records, arrays, tuples, unions, intersections, and heritage.
3. Traverse every union/intersection constituent rather than only common properties.
4. Inspect data properties/index signatures and recursively referenced shapes.
5. Detect recursion with visited type identities.
6. Count unresolved conditional/generic/depth cases; never drop them as “type machinery.”
7. Permit protocol/runtime-handle/generic-machinery classification only through exact, fresh review.

Equivalent interface, literal, `Readonly`, alias, intersection, and union spellings retain the same `data-model` code and export-based subject identity. A wrapper rewrite cannot lower debt.

False-positive risks include UI/protocol contracts, intentional primitive domains, identity comparisons, lossy conversions, and fixed-counterexample tests. Every family includes nearest-neighbor fixtures and exact review evidence.

### R22 — Native constructors, statics, and compiler gaps

Resolve global/native declarations, aliases, globalThis, computed literals, and extracted references.

Report:

- Map/Set/WeakMap/WeakSet construction.
- Object assign/freeze/seal/create.
- Array from/of.
- Date parse/UTC.
- Compiler-owned native operations not actually diagnosed at that subject, including uncovered or unresolved JavaScript forms.
- Recognizable unresolved constructor/static uses.

Deduplicate only actual compiler emissions. Do not flag shadowed native names or unrelated methods.

D1 keeps existing legacy collection contracts counted until deletion. It does not make them ordinary clean code.

D2 resolves strict-package weak ownership through an Effect collection owned by a service or operation scope and deterministic finalization. Weak-key GC lifetime is not a parity-frozen contract. Review verifies the real owner, sharing between operations, foreign key identity, and cleanup.

No approval makes native Map construction acceptable to unchanged `port:check`. No alias, computed name, relocation, or reflection-based constructor invocation may conceal the operation.

Reflection implementing genuinely uncovered descriptor semantics is reviewed through the upstream-first facet law; it is not an alternate spelling of a prohibited constructor.

Risk: mutation, descriptors, ordering, coercion, identity, and ownership. No automatic rewrite is proposed.

## 7. JSDoc and Example pipeline

### 7.1 Grammar

Body order:

```text
lead paragraph
**When to use**
**Details**
**Gotchas**
**Example** (Title)
**Example** (Another title)
tags
```

Optional sections are absent when unnecessary. When-to-use begins `Use to`, `Use when`, `Use as`, or `Use with`.

Tag order:

```text
@typeParam
@param
@returns
@throws
@effects
@precondition
@postcondition
@invariant
@deprecated
@defaultValue
@see
@public / @beta / @alpha / @internal / @experimental
@category
@since
```

Parameter tags use `name - description`; returns/throws do not start with a hyphen. Every see-link includes purpose. Deprecation links a replacement and describes migration.

Canonical categories:

```text
models schemas type-level constructors factories destructors combinators
predicates guards refinements assertions getters setters mapping filtering
folding sequencing concurrency resource-management error-handling utilities layers
aggregates entities value-objects domain-events policies specifications
identifiers entity-ids type-ids symbols errors
use-cases commands queries events workflows processes schedulers protocols ports
services handlers endpoints clients adapters repositories projections read-models tables
validation parsing encoding decoding serialization codecs formatting normalization
dtos mappers
components hooks providers themes tokens forms atoms
tools tool-schemas cli-commands configuration constants observability diagnostics
fixtures testing streams resources interop
```

Reject topology categories such as exports, re-exports, modules, core, generated, and presentation. Completion permits no legacy category aliases.

Recognize `ts`, `typescript`, `tsx`, `mts`, and `cts`. JSDoc Examples require canonical `ts`; another language cannot conceal a loose fence.

### 7.2 Extraction and reachability

AST ownership supplies JSDoc ranges. A structural section parser identifies body, tags, titles, and fences. Delimiter regexes may operate inside identified text; they do not determine declaration ownership.

Guidance includes tracked `standards/`, `docs/effect-port/`, root/nested agent guidance, and retained repository skill/pattern documents.

Every recognized fence receives import/safety checks and compilation. Exact negative fixtures must produce their expected diagnostics. Reviewed fragments retain their identity and expected treatment; an unregistered marker cannot opt out.

Public Examples import real public aliases. Internal Examples cannot invent private aliases.

The revised nine-package reachability probe remains:

| Package | Reachable values | Missing titled Example |
|---|---:|---:|
| schema | 6 | 0 |
| logger | 14 | 14 |
| i18n | 23 | 23 |
| task-queue | 166 | 166 |
| db | 86 | 86 |
| downloader-core | 405 | 405 |
| subscriptions-core | 175 | 175 |
| browser-capture | 129 | 129 |
| transcription | 568 | 568 |
| **Total** | **1,572** | **1,566** |

`proto-v3/public-owners-output.txt` reproduces these counts. This is not the complete bootstrap inventory: application surfaces, merges, and all scope/ownership fixtures still require production acceptance.

### 7.3 Generated compiler project

Uncommitted layout:

```text
.cache/standards/<content-digest>/
  package.json
  projects/<package-id>/
    tsconfig.json
    examples/<owner-id>/<fence-id>.<extension>
    snippets/<document-id>/<fence-id>.<extension>
    tests/<source-id>.test.ts
    origins.json
  reports/
```

Use caller-owned temporary storage for protected runs.

The prescribed Example compiler configuration is the configuration measured in this revision:

- Extend the actual owning package tsconfig.
- Preserve target, module resolution, JSX mode, strictness, no-unused rules, exact optional properties, unchecked indexing, and all Effect severities.
- Set `noEmit: true`, `composite: false`, and `incremental: false`.
- Replace `files` with generated modules and `include` with an empty list.
- Use a common ancestor `rootDir` containing snippets and imported workspace source.
- Keep outputs/cache beneath the run root.
- Preserve owning package ambient types. Generated harness projects add only actual runtime-test types; language fixtures use React types where JSX requires them.
- Resolve public aliases through actual export maps. If generated location requires paths, generate exact public export entries only.
- Do not use `baseUrl` or expose internal wildcard aliases.
- Compile original fences, then transformed assertions, under the same semantic policy.

Disabling composite/incremental here changes project packaging and caching, not semantic checking. Imported implementation files remain checked. It avoids incomplete composite file-list diagnostics when public exports resolve directly to `.ts` implementations.

Generation preserves kind:

| Fence language | Generated extension |
|---|---|
| `ts`, `typescript` | `.ts` |
| `tsx` | `.tsx` |
| `mts` | `.mts` |
| `cts` | `.cts` |

Do not turn CommonJS into ESM or JSX into plain TypeScript. One successful compiler fixture per recognized language is retained in `proto-v3/languages/`.

Map each generated UTF-16 position to source file, comment-prefix width, owner/title/fence ID, and original offset. Imported-source diagnostics retain source location. Wrapper/generator errors attach to the fence header as infrastructure failures.

V’s Example policy is stricter than B’s standalone compiler configuration, which omits the Effect plugin. Use assertions for pure observations or explicit Effect Console execution for compile-only formatted output.

### 7.4 Public doctest

Adopt public doctest 4.1.4:

- `@effect/doctest/Transform` supplies `transform(source, file, line)`.
- `@effect/doctest/Runtime` supplies `assertEquals`.

V owns extraction, eligibility, conservation checks, origins, obligations, and grouped registration.

The supplied artifact’s peers are Vite `>=8.1.5 <9.0.0`, Vitest `>=5.0.0 <6.0.0`, and Effect `^4.1.4`; it has no TypeScript peer. Its public API compiled through both installed compiler commands and its transformation/runtime executed under V’s Bun-backed Vitest.

This proves the supplied artifact’s compatibility with V’s dependencies. Adding the real catalog dependency and frozen-lock installation remains implementation acceptance work.

Equality first uses Effect equality. A structural diagnostic comparison cannot turn an Effect-equality failure into success.

Expected expressions compile in lexical scope and receive purity analysis. Every marker must emit and execute one assertion. Malformed, unmapped, missing, or additional assertions fail.

Each snippet is a separate module, preserving top-level await. A source-group test registers module imports. Completion without required assertion execution fails.

### 7.5 Purity

`PurityAnalyzer` computes selected export/import closures, initializer/call effects, content digests, and resolution conditions.

Records contain exact subject, dependencies, closure digest, pure/impure/unknown verdict, evidence, and external approval. Any relevant change invalidates them.

Environment, filesystem, network, process, Bun, database, external service, JSX/React, relative-source, and unresolved dynamic loading prevent runnable eligibility. An arbitrary Effect import is not proof of purity.

Initially execute only exact approved pure leaves and V exports. Unknown Examples compile, produce counted candidates, and remain unexecuted because eligibility is unestablished. They cannot be claimed as runtime-tested.

Purity analysis is not a security sandbox.

### 7.6 Runtime budgets

Use Bun-backed Vitest and `@effect/vitest`, never Bun’s native test command.

Group by source file with separate snippet modules. Configure one worker, no file parallelism, sequential tests, `testTimeout: 2000`, and shared dependency graphs only for approved pure closures.

| Limit | Initial ceiling |
|---|---:|
| Snippet | 2 seconds |
| Package runtime stage | 30 seconds |
| Full docs execution stage | 120 seconds |
| Concurrent compiler processes | 2 |
| Concurrent package jobs | 2, one worker each |

The parent owns deadlines and terminates only its own child group. Stuck imports may require the package watchdog. Timeout means incomplete execution, never success.

Use `--configLoader runner` and run-owned caches to avoid writes through dependency symlinks.

Full real-corpus measurements precede activation. Budget changes require evidence; deleting Examples or weakening checks is prohibited.

### 7.7 Docgen decision

Do not adopt `@effect/docgen` 4.1.4.

Its local reference manifest requires TypeScript `>=5.8.2 <7.0.0`; V uses 7.0.2. It is absent from V. No peer override or second compiler installation is proposed.

Its legacy carrier expectations also do not implement B’s titled-section/kind-split policy unchanged.

Port B’s required parsing/checking semantics. Omit HTML rendering, workspace aggregation, advisory scoring, and general docgen orchestration. Doctest is independently useful and has been separately exercised.

## 8. Porting B enforcement

“Preserve” below means recognizer/policy semantics. Imports, assertions, and private dependencies still require adaptation.

| B source | Preserve | Rewrite | Expected production size |
|---|---|---|---:|
| `packages/tooling/tool/cli/src/commands/Laws/EffectImports.ts` | Alias/module and fence rules | Discovery, TS7 facade, findings, full module-reference coverage | 450–650 lines |
| Same prefix, `Laws/EffectFn.ts` | Reusable callable/generator recognition | Facade, findings, span proof | 180–260 |
| `Laws/NoNativeRuntime.ts` | Native families, availability guards, errors | Provenance, missing compiler coverage, D1–D5 disposition after recognition | 350–500 |
| `Laws/TerseEffect.ts` | Conservative wrapper/compaction cases | Facade, counted uncertainty, no write/private-thunk mode | 250–400 |
| `Laws/SchemaTagIdioms.ts` | Fixed-tag recognition and distinctions | Ownership, facade, parity proof | 250–400 |
| `Lint/SchemaFirst.ts`; `Lint/internal/SchemaFirstScan.ts`, `SchemaFirstDetectors.ts`, `SchemaFirstPolicy.ts`, `SchemaFirstArbitraryCoverage.ts` | Every detector family | Semantic wrapped-type entry, counted registry, V reviews; remove nonblocking waves/private Fn/topology assumptions | 800–1,100 |
| `Lint/SchemaTopology.ts` | Export integrity/placement | B paths, retired names, topology | 100–180 |
| `Quality/internal/JSDocRatchet.ts`, `QualityArtifactSupport.ts` | Growth rejection/zero legacy | Trusted execution, file/code debt, obligations, classifications, canonical migrations | 400–600 |
| `packages/tooling/tool/docgen/src/{Parser,Checker,Core,Configuration}.ts` | Ownership, kind split, Example compilation | TS7 facade, public reachability, strict configs/maps; no member expansion/ignore bypass | 650–900 |
| `packages/tooling/library/repo-utils/src/JSDoc/JSDocSections.ts` | Grammar/offsets | Private Markdown/schema/identity helpers | 300–450 |
| CLI prefix, `Docgen/internal/Doctest.ts` | Marker/eligibility/vacuity semantics | Public transform/runtime, closures, grouped execution/maps/budgets | 250–400 plus purity |
| `packages/tooling/policy-pack/lint-rules/rules/{prefer-identity-annote-pipe,no-hand-built-identity-annotation,prefer-exact-optional-key,prefer-schema-make-option,no-native-error}.grit` | Cases and counterexamples | Integrate into owned rule registry; no second suppression mechanism | Included |

B’s import checker is approximately 2,283 lines; docgen source approximately 6,265 lines and twelve private dependencies. Port behavior, not that dependency graph.

Expected checker production size remains 5,000–7,000 lines, excluding standards, tests, and fixtures. This is an estimate.

## 9. Ratchet, trust, and permanent obligations

### 9.1 Fresh trusted execution

A package lane cannot supply acceptance policy or execution outcomes.

The protected workflow:

1. Obtains the approved base from protected workflow context.
2. Materializes base checker, rules, fixtures, scope, editions, review policy, identity data, parity contracts, compiler policy, and launcher in a trusted tree.
3. Installs/builds from trusted pinned dependencies.
4. Examines candidate source as input.
5. Rejects protected-policy changes in ordinary lanes.
6. Executes required stages freshly.
7. Independently regenerates canonical baseline changes.

**Required acceptance and independent baseline verification do not reuse serialized receipts.** Specifically:

- Ignore candidate `.cache`, receipt files, local caches, and Turbo artifacts.
- Use a fresh verifier-owned run directory.
- Disable Turbo result reuse for acceptance stages; invoke the trusted executable directly.
- Do not consume previous workflow success JSON as proof.
- Reuse only successful in-memory stage results produced inside the same trusted process over the same immutable snapshot.
- A second independent baseline verification starts a separate fresh run.
- Recompute all reported outcomes; receipts are outputs.

Local edit-loop caches are advisory. Their digest keys prevent accidental stale reuse, but cannot establish acceptance provenance.

Protected inputs include executable rules/tests/fixtures, scope, editions, review authorization, identity data, parity contracts, compiler configuration, toolchain/lock inputs, and launcher. Hash bytes, not author-supplied version labels.

The forged-receipt fixture places a successful receipt beside a failing Example. Acceptance must execute the compiler and fail. The small prototype ignored the receipt and received TS2322: `proto-v3/receipt-fixture-output.txt`. Production workflow isolation still requires its own acceptance fixture.

### 9.2 Baseline and classification schemas

Commit `standards/baseline.json` while removable debt remains:

```json
{
  "version": 4,
  "policyDigest": "<trusted digest>",
  "scopeDigest": "<trusted digest>",
  "classificationDigest": "<trusted parity-contract digest>",
  "sourceRevision": "<frozen revision>",
  "migrationIds": ["<bootstrap migration>"],
  "packages": [
    {
      "package": "@vidbee/transcription",
      "classification": "active",
      "clean": false,
      "files": [
        {
          "file": "packages/transcription/src/Transcription.errors.ts",
          "counts": {
            "R04.cause-stack": 3,
            "R07.schema-annotation": 13
          }
        }
      ],
      "ruleTotals": {
        "R04": 3,
        "R07": 13
      }
    }
  ]
}
```

Counts are illustrative.

The real schema records exact files and registered codes, canonically sorted. Missing allowances mean zero. Package/rule totals are derived checksums.

Enforcement is per file/code and per subject, stronger than package/rule totals. No cross-file/code improvement purchases new debt.

Commit permanent `standards/parity-contracts.json`:

```json
{
  "version": 1,
  "sourceRevision": "<frozen revision>",
  "pendingDeletion": [],
  "parityFrozen": [],
  "ruleTotals": [],
  "lineage": []
}
```

The arrays contain the closed schema records defined in section 4.3, not arbitrary JSON objects.

Keep three distinct count columns in every report:

| Count | Meaning | End state |
|---|---|---|
| Remediation debt | Unresolved violations and candidates in active source | Zero |
| Pending-deletion observations | Exact existing facade subjects, including their unresolved law debt | Zero through deletion |
| Parity-frozen observations | Exact D5 contracts admitted under the VidBee edition | Monotonic, explicitly reported; expected empty |

A recognized operation covered by a valid D5 contract remains a raw observation with its classification and count. Under the amended VidBee edition it is not an unresolved finding. This distinction preserves “clean packages have no findings” without falsely reporting that the source was rewritten to the general rule.

`clean: true` requires no unresolved finding, missing review, pending-deletion membership, compiler failure, port failure, or execution failure. A package with admitted D5 observations is reported as **clean with parity-frozen contracts**, including every subject. It cannot receive an unqualified zero-observation report.

The removable debt baseline can be deleted only when remediation and pending-deletion counts are zero across the full inventory. Any D5 records remain in the permanent manifest with their nonzero classified counts. D5 therefore changes neither numbers by hand nor the meaning of baseline absence: absence means zero removable debt, while permanent parity contracts remain visible.

### 9.3 Check algorithm

For complete selected packages:

1. Validate tools, trusted inputs, classification schemas, and compiler coverage.
2. Run rules, candidates, compiler stages, docs, identity, and review enumeration.
3. Fail zero-only findings, suppressions, legacy carriers, and compiler/runtime errors.
4. Validate intrinsic applicability classifications and D1/D5 records against actual source and consumers.
5. Match classifications by exact stable subject, code, contract, and current digests. A nearby or similarly named operation cannot inherit one.
6. Count unresolved findings/candidates per file/code and package/rule.
7. Count pending-deletion and parity-frozen observations independently, retaining their exact subjects.
8. Fail positive unresolved findings in any new file.
9. Fail any new file in a pending-deletion facade, even if that file has no findings.
10. Fail growth in any file/code or package/rule count, or any new unresolved subject.
11. Fail new classified subjects, changed contract boundaries, or classification-count growth.
12. Fail any unresolved finding or stale/missing review in clean packages.
13. Enforce permanent documentation obligations.
14. Validate fresh semantic reviews, required parity oracles, and completed execution.
15. Report every remaining count and exact D5 subject even when the ratchet passes.
16. In phase-10 mode, execute section 9.9’s deletion proof and require zero pending units.

Compare normalized subject fingerprints. New unresolved subjects fail even if a file/code count is unchanged. Fingerprints identify debt; they are not suppressions.

Renaming dirty files creates new-file debt. Clean before moving or use the protected policy process where genuinely necessary.

Classification does not create a budget that another subject can consume. Removing one frozen subject cannot admit a replacement.

### 9.4 Generated reviews

| Family | Generated subjects |
|---|---|
| Absence/model/default/precision | Boundary fields, data/Struct candidates, defaults, constraints |
| Recovery/errors | Catches, throws, failures/defects, causes, emitted error representations |
| Runtime/resources | Owners, acquisitions/finalizers, retries, timeouts, forks, fan-out |
| Secrets/config/observability | Config/unwrap/log sites, workflows, spans |
| Crispen/architecture | Models/helpers/exports, edges, callable contracts |
| Documentation | All admitted owners and fences, conditional tags, vacuity, closures |
| Provenance/closeout | Source/export/test ledger and exact required executions |
| D1/D5 | Facade membership/edges, exact observable contracts, alternative-form attempts, frozen oracles, retirement/deletion proofs |

Each obligation has stable identity, fingerprint, source/dependency digest, and required evidence.

Attestations come from the trusted review workflow and identify reviewer, author, reviewed digest, evidence, and approval source. A lane-written reviewer string is insufficient. The reviewer is independent of the subject’s implementation author.

Changed source/dependencies invalidate approval. Clean packages fail pending re-review. Package-wide checkboxes cannot replace site review.

Record relevant owner decisions in `docs/effect-port/OWNER-REVIEW.md`. Approval cannot turn a failed mandatory gate green.

### 9.5 Documentation obligations before bootstrap repair

Commit permanent `standards/documentation-obligations.json`.

**Freeze obligations from the original admitted source before repairing broken Examples or seeding debt.** The scope includes:

- Public value owners.
- Public pure-type owners with optional Examples.
- Internal/non-public owners with optional Examples.
- Nonexported owners carrying Examples.
- Every admitted executable or classified teaching/negative guidance fence.

Each has stable identity independent of line number:

| Origin | Identity |
|---|---|
| Public declaration | Stable owning-declaration ID plus export lineage |
| Internal declaration | Package/file/declaration ID with approved move history |
| JSDoc fence | Owner ID plus stable fence ID/title lineage |
| Markdown fence | Document ID, stable section ID, stable fence ID; ordinal is only a locator |

Store minimum Example, runnable-fence, and assertion counts; language/module kind; origin; observation/expectation digest; lineage; and approved moves/retirements.

Duplicates require distinct IDs. Renaming a title or changing a heading does not create permission to drop an obligation. Missing bindings fail until explicitly rebound.

Ordinary regeneration can raise obligations, never lower them. Fail deletion, removed runnable metadata/assertions, impurity introduced to avoid execution, or weakened observations/expectations without fresh review.

Internal Examples with invalid private aliases must be repaired while preserving their teaching obligation, potentially demonstrating the behavior through an actual public API. They cannot be deleted during bootstrap because they were optional.

D1 facade deletion permits retirement of facade-specific obligations only with the same verified deletion proof. Examples for behavior retained in the strict API transfer to that owner; deleting a facade cannot erase a surviving API’s teaching obligation.

This ledger survives baseline deletion.

### 9.6 Lowering and independent verification

`standards:baseline --package <name>` runs complete selected checks, refuses growth/new subjects/obligation loss, lowers actual counts, adds only clean new active files, removes deleted allowances without transfer, preserves unselected entries, and marks clean only at zero debt with fresh review.

For a pending-deletion facade it can lower counts or remove deleted membership; it cannot add a file, subject, incoming edge, or increase a count.

It cannot admit or alter a parity-frozen contract. Those are protected inputs.

Write canonical bytes atomically and emit a before/after report.

The orchestrator runs:

```sh
bun run standards:baseline --verify-from <trusted-base-revision>
```

The protected verifier obtains the real base independently, regenerates from trusted policy and candidate source in a fresh run, and requires byte equality. Hand-edited counts, clean flags, membership, classifications, or documentation ledgers do not establish acceptance.

Delete the baseline when every package has zero removable debt and every pending-deletion facade is gone. Absence means zero debt allowances. Identity, review, documentation, and parity-contract records remain.

### 9.7 Protected policy migration

Bootstrap, corrected rules, scope admission, toolchain updates, identity moves, and initial D1/D5 classification use:

```text
standards policy-migrate
  --base <trusted revision or bootstrap sentinel>
  --proposal <migration document>
```

Only the owner/designated orchestrator workflow may use it.

It compares old/proposed checkers on unchanged base source, attributes introduced/resolved findings, publishes fixture/applicability changes, rejects increases caused by new nonconforming code, preserves identity/checker zero debt, and produces independently rederived canonical results.

Bootstrap freezes documentation obligations first. Broken compiler Examples/assertions are repaired before baseline seeding; they are not seedable debt.

A migration cannot authorize prohibited gate weakening, skipping, or allowlisting. D5 admission changes the exact written-law applicability only after its contract proof; it cannot override tsgo or `port:check`.

### 9.8 Admission and verification of D1/D5 classifications

**Pending deletion.** Bootstrap discovers actual legacy workspaces and legacy entry surfaces from manifests and the import graph. It records exact package identities, existing files, subjects, counts, and incoming edges. This includes the existing task-queue, downloader, subscriptions, browser-capture, transcription, and CLI legacy surfaces where present; discovery supplies their exact locations rather than assuming all are under `packages/`.

Admission requires proof that the surface exists to serve unported consumers and is scheduled for phase-10 deletion under D1. No new facade is created by this design.

Native Map/Set/WeakMap/native-error contracts in those surfaces are preserved until deletion. Rewriting their public contract is not their route to zero.

D3’s requirement to locate native-class reconstruction in a facade must still respect the frozen file and count limits. Use an existing adapter without growth or perform the consumer cutover. If neither is possible within the current lane, report the sequencing blocker; do not silently transfer debt or create a new legacy file.

**Parity frozen.** Admission requires all of:

1. An exact existing subject from the frozen source.
2. A concrete A1/A2 observable contract and an executable oracle or golden that pins it.
3. Evidence that D1 deletion, D2 explicit ownership, D3 boundary formatting/native reconstruction in a facade, and D4 boundary-codec separation do not resolve the conflict, as applicable.
4. Fresh unchanged compiler and port gates passing the proposed source.
5. An exact `OWNER-REVIEW.md` row.
6. Independent attestation bound to the subject, contract, oracle, and dependency digests.
7. Canonically generated manifest bytes.

A candidate is not an admission. Missing evidence remains an unresolved review obligation and blocks clean status.

After admission:

- The subject set cannot grow.
- The rule/code and observable boundary cannot broaden.
- Each entry’s maximum is one.
- Aggregate counts cannot rise.
- Removing an entry creates no replacement allowance.
- Changed code or consumers require fresh proof and attestation while preserving the original contract.
- If the conflict disappears, retire the entry and remediate the law.
- Every accepted report lists the surviving entries for the owner.

### 9.9 Phase-10 deletion proof

`standards:check --phase 10 --require-clean` proves every D1 surface is gone:

1. No recorded facade file, directory, workspace manifest, or legacy export entry remains.
2. Workspace discovery contains no surviving replacement or renamed facade serving the same legacy API.
3. No executable import, re-export, import-equals, dynamic import, require, package alias, or generated module reference targets a facade.
4. No workspace manifest retains a dependency on one.
5. Resolution and build metadata contain no live edge to one; lockfile and workspace metadata are regenerated through normal tooling.
6. Unresolved dynamic loading that might reach a facade remains a failure.
7. Surviving strict consumers compile and pass their tests without facade declarations or resolution paths.
8. Root checks, dependency checks, differential suites, packaged offline launch, and required goldens pass.
9. Facade documentation obligations are transferred or retired with exact lineage.
10. An independent verifier regenerates a `DeletionProof` from the candidate tree and trusted D1 inventory.

Historical prose and test-fixture data may name a deleted facade; executable references may not. The AST and manifest checks make that distinction.

Keep permanent tombstones identifying the deleted D1 surfaces and their deletion proofs. They prevent resurrection and survive baseline deletion.

## 10. Gates and measured feasibility

### 10.1 Concrete enrollment edits

The first implementation commit includes every edit below.

| Surface | Concrete change |
|---|---|
| Root workspaces | Append `tooling/*`. |
| Root catalog | Pin TypeScript exactly; add doctest 4.1.4 and any genuinely missing tooling dependencies. Workspace manifests use `catalog:` and `workspace:^`. Update lock through normal installation. |
| New package scripts | Both packages expose compiler `check` and Bun-backed Vitest `test`; tests are typechecked under the unchanged base policy. |
| Root `check` | Retain all current checks and filters; append explicit `--filter=@vidbee/identity` and `--filter=@vidbee/standards` to compiler selection; retain unchanged `port:check`; then invoke standards. |
| Root `test` | Retain every existing stage; append both new package filters to the existing Turbo test selection. Do not rely on dependency checks to execute tests. |
| Root scripts | Add standards/docs/baseline entrypoints invoking the owned CLI. |
| Turbo | Keep existing check/test semantics. Add standards/docs tasks without a dependency on root check, with run-owned reports as outputs. Include standards, checker, identity, compiler, export/config, lock, classifications, and obligation inputs in invalidation. Acceptance bypasses cached task outcomes. |
| Biome | Add `packages/identity/**` and `tooling/standards/**` to positive file inclusion. Apply existing rules; no new ignores or reduced severities. Violating snippets are `.txt` fixture data, not disabled source. |
| Syncpack | Append `tooling/*/package.json` to `source`. Keep existing catalog/workspace policy. |
| Lefthook | Retain staged Biome and unchanged port gate. Add a read-only standards affected-package invocation using a NUL file list. Scan complete selected packages; global changes require full proof. Never format, stash, stage, lower, or edit index. |
| CI | Retain current check/test/dependency/build jobs. Add protected-base standards execution and fresh independent baseline verification, with candidate caches excluded. Require policy-integrity and adversarial fixtures. Phase-10 closeout additionally requires the deletion-proof command. |
| Tooling port coverage | Because unchanged port-check discovery visits apps/packages, standards additionally validates tooling configs against the same policy and runs the unmodified port checker on a temporary package projection of tooling source. This extends coverage without changing `port:check` itself. |

Required integration acceptance fixtures:

| Fixture | Required failure |
|---|---|
| Failing checker fixture | Intentionally break an expected result in the checker fixture suite. Root `bun run test` must execute that suite and fail. |
| Off-catalog tooling dependency | In a temporary candidate, give `tooling/standards/package.json` a literal third-party version violating catalog policy. Root `bun run deps:check` must fail. |
| Forged receipt | Supply correct computable digests and fabricated successful docs/Turbo artifacts beside a failing Example. Protected standards and independent baseline verification must both execute freshly and fail. |

These root-workflow fixtures are prescribed acceptance work, not claimed as run against modified repositories during this design.

Local cache keys include source/tests, relevant dependency closure, exports/conditions, configs, lock/tool versions, rule/fixture bytes, editions, review/purity records, classifications, and obligations. Local cache results remain advisory.

### 10.2 Reproduced measurements

Commands and inputs are retained in `proto-v3/measure.cjs`, `ast.cjs`, `scale.cjs`, `verify.cjs`, and their generated configurations.

Compiler trials use the exact non-composite, non-incremental configuration in section 7.3. All compiler trials below exit zero with zero diagnostic bytes.

| Probe | Result and measured time | Raw output |
|---|---|---|
| Transcription traversal, v3 | 182 files, 101,719 nodes; 722.6, 224.1, 218.5, 226.0, 251.7 ms | `proto-v3/traversal-output.txt` |
| API/signature compilation, v3 | 192.7, 179.2, 159.7 ms | `proto-v3/compiler-timings.txt`, `api.tsconfig.json` row |
| Doctest API compilation, v3 | 86.3, 101.7, 103.0 ms | Same report, `doctest.tsconfig.json` row |
| Original lawful Example subset, v3 | Ten fences; 145.8, 110.2, 110.4 ms | Same report, `lawful.tsconfig.json` row |
| Transformed assertion compilation, v3 | 146.4, 126.6, 111.9 ms | Same report, `transformed.tsconfig.json` row |
| Fence-language compilation, v3 | All five recognized languages; 178.3, 155.1, 168.1 ms | Same report, `languages.tsconfig.json` row |
| Lawful runtime subset, current rerun | Nine tests passed; 287 ms reported Vitest duration | `proto-v3/lawful-runtime-output.txt` |
| Doctest semantics | Const, Option equality, block control flow, top-level await; successful rerun | `proto-v3/doctest-runtime-output.txt` |
| Synthetic transcription runtime, retained v3 trials | 583 snippets grouped into 182 test files; 5,190.3, 5,858.4, 12,299.6 ms wall | `proto-v3/scale-output.txt` |
| Synthetic downloader runtime, retained v3 trials | 439 snippets grouped into 97 test files; 9,995.0, 7,311.4, 10,105.8 ms wall | `proto-v3/scale-output.txt` |
| Transcription traversal, v4 rerun | Same 182 files and 101,719 nodes; 212.3, 182.2, 182.8, 195.7, 215.2 ms | `proto-v4/traversal-output.txt` |
| API/signature compilation, v4 rerun | 149.0, 113.7, 97.5 ms | `proto-v4/compiler-timings.txt` |
| Doctest API compilation, v4 rerun | 73.2, 62.8, 65.0 ms | Same report |
| Original lawful Example subset, v4 rerun | 863.4, 105.9, 103.1 ms | Same report |
| Transformed assertion compilation, v4 rerun | 81.1, 88.3, 84.0 ms | Same report |
| Fence-language compilation, v4 rerun | 110.2, 83.3, 84.0 ms | Same report |
| D2 ownership test | One test passed; 201 ms reported Vitest duration | `proto-v4/ownership-runtime.txt` |

The runtime report is authoritative if a repeated verification invocation replaces its displayed duration. No timing from v2 without a saved raw result is carried forward as current evidence.

The synthetic suites repeatedly exercise selected real public model aliases with one worker and shared pure dependency graphs. They are load tests, not execution of every export or future Example workload.

### 10.3 Interpretation and activation limits

The first prototype’s void-discard “repairs” proved compiler feasibility, not Example conformance. The lawful revision uses assertions and retains a meaningful type-only compile demonstration.

Original repository docs are not established as clean. The earlier subset exposed nonexistent internal aliases and console diagnostics; repository files were not changed.

Targets, **not measured guarantees**, remain:

- Warm bounded syntax/docs inventory below one second.
- Warm schema docs subset below two seconds.
- Valid no-change affected hook below one second.
- Recorded full active cold/warm standards/docs timings before activation.

The runtime trials fit the initial package ceiling but do not substantiate a sub-second executing hook. Local no-change cache performance and full typed-checker cost remain unmeasured.

Acceptance always executes freshly. Optimize snapshots, grouping, and local cache granularity; do not weaken enforcement to meet targets.

## 11. Bringing packages to zero while preserving behavior

### 11.1 Freeze the oracle

Record revision, exports/types, identities/metadata, encodings, consumers, runtime boundaries, and tests.

Retain PLAN’s permanent differential oracle: execute the frozen old implementation, compare generated inputs and substituted option fields, preserve attributable outcomes, and compare deliberate observable errors exactly.

Apply PORT-GUIDE’s out-of-type rule: preserve old successful results for null, wrong-kind JSON scalars, and NaN. Old engine failures outside declared types must still fail without emulating their text/code. Preserve named external-data exceptions exactly.

Apply D1–D5 before choosing a rewrite:

1. Identify consumers still using a legacy public contract.
2. Freeze those facades for deletion rather than redesigning their contract.
3. Replace strict weak ownership with explicit service/operation ownership.
4. Separate tagged internal errors from their emitted byte representation.
5. Trace each Defect field to actual encoding and persistence boundaries.
6. Propose D5 only for a remaining evidenced conflict.

### 11.2 Verified forms and proof boundaries

The following forms have compiled under V’s unchanged base/Effect policy and run. The unmodified port-check function reports zero violations for scratch packages containing the compliant probes: `proto-v3/port-proof-output.txt` and `proto-v4/validation-output.json`.

This establishes current compiler/port compatibility and the tested behavior. Production checker self-conformance and package-specific differential coverage remain required; the checker does not yet exist.

| Risk | Compliant form / retained choice | Evidence and limit |
|---|---|---|
| Required encoded null | Internal `OptionFromNullOr` codec; encode None back to required null. | `compliant.test.ts`, runtime report. Do not serialize Option objects. |
| Present undefined | At an actual boundary, explicit undefined-admitting value under an exact optional key. Domain absence still normalizes internally. | Old/new decode values, property presence, and serialized success bytes agree in `oracle-output.txt`. |
| Decode default formerly accepting undefined | Explicit undefined-input transformation followed by exact missing-key default. | Old/new omitted, undefined, and valid category outputs/bytes agree. Construction and full package error text still require differential tests. |
| Persisted classes | Retain classes under the source law’s persisted/entity/behavior distinction. | No forced Opaque conversion; prove original prototype/encode acceptance. |
| Precision | Preserve existing boundary cleanup and accepted numeric domain. | Stronger constraints are not a conformance shortcut. |
| External variant bags | Keep wire bag codec, then derive internal variants without discarding selected/unconsumed fields or changing tags. | Prove consumer-specific projection/identity; no blanket conversion. |
| Schema identity | Add nonidentifier metadata while retaining effective identifier absence/value. | Formatter and class identity probes. Contracted metadata outputs remain frozen. |
| Synchronous typed refusal | Retain schema-backed tagged throw and timing; use makeOption only where absence already means refusal. | Source-law distinction; no forced throw-to-None conversion. |
| Function spans | Preserve existing names; use untraced form for previously untraced callables. | Parity probe plus required package trace oracle. |
| Object keys | `R.keys` delegates native key enumeration. | Proxy observation test in compliant suite. |
| Object entries with getters/proxies | Descriptor-aware traversal using Effect Array/Result plus Reflect operations. | Exact entry bytes and trap sequence match native; ordinary `R.toEntries` demonstrably differs. |
| Known-field assign | Direct assignment for the exact single-property mutations. | Retains object reference and output bytes; package tests cover setter/evaluation observations. |
| Host date parsing | Schema DateFromString Result decode, extracting epoch time; invalid result maps to lawful internal absence. | Zone-less/zoned/named/invalid cases agree with native parsing. Installed getter delegates string construction to the host Date implementation. |
| Numeric durations | Convert units with `Duration.millis`. | Millisecond value test. Timing/cancellation trace remains package-specific. |
| Strict weak ownership | Effect collection registered in the actual queue-owner scope, released by finalizer. | D2 probe compiles and cleanup test passes; real downloader integration/oracles remain required. |
| Observable native-error text | Schema-backed tagged error plus explicit boundary formatter/codec. | D3 probe reproduces a recorded live old `String()` byte-for-byte. |
| Legacy native collections/errors | Preserve existing facade contract and delete the facade. | D1 inventory, monotonic counts, phase-10 deletion proof. |
| Defect stack policy | Include stack unless an exact frozen encoding is proven; isolate boundary codec first. | D4 evidence below; no expected D5 admission from the inspected sites. |

The tested defaulting form is:

```text
UndefinedOr(category)
  → decodeTo(category, pure undefined-to-default transformation)
  → withDecodingDefaultKey(typed Effect default)
```

It distinguishes present undefined from missing-key handling without using a forbidden non-exact default combinator.

The descriptor-aware entries implementation:

1. Obtains own keys with Reflect.
2. Filters string keys.
3. Rechecks each descriptor’s enumerability immediately before reading.
4. Reads each surviving value in native order.
5. Uses Effect traversal and Result selection.

Installed v4 `A.filterMap` consumes Result, not Option; this signature was corrected and compiled in the probe. `R.toEntries` collects keys before reads, so an earlier getter changing a later property’s enumerability produces different output.

Injected browser-script packaging must still prove that the compliant helper reaches the actual injected environment and preserves its transport/registration behavior. A helper probe alone does not prove browser integration.

#### D2: scoped replacement for social-media state

The existing subject is `packages/downloader-core/src/social-media-service.ts:92`, the `queuedXPosts` WeakMap.

The replacement belongs to the queue owner, not to each `downloadSocialMedia` invocation. The queue owner acquires its shared `QueuePosts` once in its lifetime scope and provides it to operations. Closing one operation must not clear another operation’s deduplication state.

The verified lifetime kernel is `proto-v4/ownership.ts`. Its essential acquisition is:

```ts
const entry = yield* Effect.acquireRelease(
  Effect.sync(() => {
    const posts: QueuePosts = {
      index: HashMap.empty(),
      pending: HashSet.empty()
    }
    const created: Entry = { identity, posts }
    entries = A.append(entries, created)
    return created
  }),
  (owned) =>
    Effect.sync(() => {
      entries = A.filter(entries, (current) => current !== owned)
    })
)
```

The surrounding registry uses an Effect Array and reference-identity lookup. It deliberately avoids structurally comparing foreign queue handles through a hash map. The post index and pending set remain Effect `HashMap`/`HashSet` values.

The production owner must:

- Register once per queue identity in the queue’s actual owner scope.
- Provide the same state to all operations borrowing that owner.
- Keep the existing lazy task-index initialization and pending-post behavior.
- Publish and finalize under resource acquisition, without an interruptible gap that can leak an entry.
- Serialize any acquisition path that could register the same owner concurrently.
- Remove only the entry belonging to the closing owner.
- Make post-close borrowing impossible through the service lifetime.

The probe test establishes same-owner sharing, distinction between separate empty-object identities, retained pending membership, and registry size zero after the scope closes. It uses installed `Effect.scoped`, `Effect.acquireRelease`, Effect collections, and `@effect/vitest`; tsrs and the unchanged textual port rules pass.

The package lane must additionally run the social-download differential traces and existing goldens, including concurrent/reentrant enqueueing, pending cleanup on failure, and owner shutdown. The prototype does not claim those application tests were executed.

The transcription legacy WeakMap at `packages/transcription-legacy/src/import-captions.ts:19` follows D1 and is deleted with the facade.

#### D3: installed tagged-error facts and boundary formatting

There is no `S.TaggedErrorClass` export in installed Effect 4.1.4. The schema constructor is `S.TaggedError`.

The runtime probe records:

| Form | `name` | `message` | `String()` | `instanceof Error` | Encoded representation |
|---|---|---|---|---|---|
| `S.TaggedError` with omitted identifier, tag `RecordedFailure`, and `message` field | `RecordedFailure` | Supplied message | `RecordedFailure: <message>` | `true` | Schema encode contains `_tag` and declared `message` |
| `S.TaggedError` with explicit identifier `@vidbee/probe/NoMessage`, tag `NoMessage`, and only `legacyMessage` | `@vidbee/probe/NoMessage` | Empty string | `@vidbee/probe/NoMessage` | `true` | Declared fields are encoded; `legacyMessage` is not automatically the Error message |
| `Data.TaggedError("DataFailure")` with `message` | `DataFailure` | Supplied message | `DataFailure: <message>` | `true` | No automatic schema contract; ordinary JSON includes `message` and `_tag` through the inherited `toJSON()` implementation. The error's own `message` property is non-enumerable; an explicit codec can encode the required fields |

A Data tagged error being an Error does not make it a schema-backed error. Its production use is rejected by `preferSchemaTaggedError`.

The probe calls the current transcription helper with a synthetic missing category and records the old error:

```text
name:    Error
message: no rule for category __recorded_missing_category__
String:  Error: no rule for category __recorded_missing_category__
```

The verified formatter is:

```ts
export const formatBoundary = (error: RecordedFailure): string =>
  `Error: ${error.message}`
```

The tagged error’s own `String()` differs, while `formatBoundary(tagged)` and the recorded old string compare equal as UTF-8 bytes. Raw output: `proto-v4/errors-runtime.txt`.

The compliant formatter/schema module passes tsrs and the port projection. The intentionally native old oracle and Data comparison live in the scratch observation harness, not the proposed strict implementation.

Production boundaries model the required old name separately from the internal error identifier. They preserve empty-message formatting, punctuation, newlines, codes, selected payload fields, and any contracted stack rendering. Do not replace all errors with the single probe format.

Disposition of the former native-error objection sites:

| Subjects | Required treatment |
|---|---|
| `transcription/src/errors.ts:20`; `asr-tiers.ts:306`; `asr-recognizer.ts:187,213,232,248,267,283` | Tagged synchronous refusal or typed failure as required by the existing calling convention; explicit boundary projection where text is observed. Existing facade reconstructs a native class only while a real consumer requires it. |
| `transcription/src/TranscriptionExecutor.layer.ts:62`; `browser-capture/src/ProfileExecutor.layer.ts:27` | Remove native reconstruction from strict implementation. Preserve classification/message behavior through typed projection; keep any required native rejection in the facade. |
| `downloader-core/src/YtDlpWrapper.ts:24` | Tagged failure retaining the exact installed-wrapper message builder; formatter preserves leading newlines and embedded process/stderr text. |
| `downloader-core/src/CoreMetadata.model.ts:19`; `downloader-core.ts:454`; `facebook-profile-map.ts:42`; `redgifs-profile-service.ts:145` | Preserve the reviewed external-data exception’s bytes through explicit representation. Required old native classes remain a facade responsibility under A6. |
| `browser-capture/src/local-storage.ts:13,24,65` | Tagged internal failures; preserve any emitted deliberate message at the boundary. No prototype freeze without an actual observing consumer. |

No listed native-error site is presently expected to need D5. Each still needs its package oracle and consumer review before clean status.

#### D4: evidence for every listed Defect site

The saved source and boundary-search evidence is `proto-v4/defect-evidence.txt`. It includes the exact error declarations, consuming bridges, executor projections, subscriptions failure handling, and encode-call search results.

The listed sites do not currently establish a frozen **schema-encoded** error contract:

| Exact subject | Consumer evidence | D4 disposition |
|---|---|---|
| `transcription/src/Transcription.errors.ts:5`, `SourceUnavailable.cause` | `transcription-legacy/src/bridge/errors.ts` projects `legacyMessage` to the old error. `TranscriptionExecutor.layer.ts` classifies/project messages and raw causes. No use of the schema encoder for this field was found in the inspected boundary paths. | Apply stack inclusion; obtain final consumer attestation. |
| `downloader-core/src/Downloader.errors.ts:5`, `InvalidDownload.cause` | `downloader-core-legacy/src/arguments-runtime.ts` returns a retained cause or constructs the old message. This uses the in-memory field, not the Defect encoder. | Apply stack inclusion; preserve raw cause and message behavior. |
| `browser-capture/src/Capture.errors.ts:5`, `CaptureUnavailable.cause` | `browser-capture-legacy/src/errors.ts` unwraps host causes or reconstructs message errors. Strict `executor.ts` uses `CaptureErrorSchema` as a guard and reads `legacyMessage`; that is not encoding. | Apply stack inclusion; guard/export presence does not justify a freeze. |
| `subscriptions-core/src/Subscriptions.errors.ts:29`, `FeedParseFailure.original` | `subscriptions-core-legacy/src/Host.driver.ts` returns the original failure through `legacyError`. Strict subscriptions handling also unwraps the original. | Apply stack inclusion; preserve original-object behavior. |
| Same file `:33`, `FeedTraversalFailure.original` | Traversal failure construction retains the original; the legacy boundary returns it. No frozen Defect encoding was identified. | Apply stack inclusion. |
| Same file `:37`, `FeedCancelled.reason` | `FeedCancellation.layer.ts` and HTTP cancellation carry the reason; strict/legacy failure projection returns that reason. | Apply stack inclusion; preserve reason identity and cancellation policy. |
| Same file `:41`, `HostFailure.original` | `Host.driver.ts` and strict handling unwrap `original`. | Apply stack inclusion; preserve original-object behavior. |

The same source audit accounts for sibling fields rather than treating each module as one subject:

| Module | Other exact Defect-field owners |
|---|---|
| `Transcription.errors.ts` | `AudioFailure.cause`, `ModelUnavailable.cause`, `ModelBusy.cause`, `ModelIntegrityFailure.cause`, `RuntimeUnavailable.cause`, `WorkerUnexpectedExit.cause`, `WorkerFailure.cause`, `CheckpointFailure.cause`, `TranscriptUnavailable.cause`, `BoundaryDecodeError.cause`, `HostFailure.cause` |
| `Downloader.errors.ts` | `BinaryUnavailable.cause`, `MetadataFailure.cause`, `ProfileUnavailable.cause`, `ProfileBusy.cause`, `ProfileIdentityMismatch.cause`, `BoundaryDecodeError.cause`, `HostFailure.cause` |
| `Capture.errors.ts` | `CaptureJobInvalid.cause`, `DisplayUnavailable.cause`, `CaptureProcessFailure.cause`, `PlaybackFailure.cause`, `ProfileUnavailable.cause`, `ProfileBusy.cause`, `ProfileIdentityMismatch.cause`, `MediaUnavailable.cause`, `MediaTransferFailure.cause`, `BoundaryDecodeError.cause`, `HostFailure.cause` |

All 36 fields are separate R04 subjects. The expected treatment is stack inclusion, with the same per-field consumer verification.

The runtime probe confirms the encoding distinction using a fixed stack:

```json
{"name":"Error","message":"frozen cause"}
```

versus:

```json
{
  "name": "Error",
  "message": "frozen cause",
  "stack": "Error: frozen cause\n    at fixed:1:1"
}
```

Adding stack inclusion changes schema encoding; it does not itself replace the original in-memory cause.

The inspected paths support the expected disposition, but textual searches are not a complete proof of all future or dynamic consumers. Clean admission requires the generated consumer/boundary review and appropriate oracles. A newly demonstrated frozen encoder use must be adjudicated under D4/D5 before changing it.

#### Expected D5 candidate list

**Expected `parity-frozen` admissions: none.**

The former candidate families are resolved as follows:

| Former candidate family | Evidence and expected resolution |
|---|---|
| Legacy native Map/Set results and inputs | Existing facade public contracts; D1 deletion, not D5. |
| Legacy caption WeakMap | Existing legacy subject; D1 deletion. |
| Strict social-media WeakMap | D2 scoped kernel compiles and cleanup test passes; no frozen GC-lifetime contract. |
| Listed native error constructors | D3 tagged failures plus boundary formatting; the live old-string probe demonstrates the form. Native-class requirements belong to existing facades. |
| Listed Defect fields | No pinned encoded boundary was identified; inspected consumers unwrap/project rather than schema-encode them. Apply D4 normally. |
| Identifier absence, optional undefined, decode defaults, persisted classes, host entry/date semantics | Existing lawful distinctions and verified forms above; no D5 admission inferred. |

This is an expected list, not a claim that every package has completed semantic review. A positive D5 proposal must name its exact new evidence; uncertainty alone is not an exception.

### 11.3 Remaining parity matrix

| Family | Required package proof |
|---|---|
| Option/defaults | Construction, decode, encode, SQL null, key omission/presence, exact bytes |
| Class/Opaque | Observed instance/prototype behavior, mutability, equality, construction/encode acceptance |
| Precision/variants | Historical acceptance, cleanup order, selected payloads, encoded tags |
| Errors/causes | Observed name/message/format, encoded payloads, raw cause behavior, synchronous timing; native-class checks only while an unported consumer requires them |
| Native collections | Mutation, key identity, iterator order, observed result contract; legacy deletion and strict scoped cleanup |
| JSON | Unknown fields, selected validation, raw identity, malformed-input and retry policy |
| Runtime/resilience | Suspension points, receiver/live lookup, registration windows, cleanup, cancellation, timeout/retry/exit behavior |
| D5 | Exact frozen boundary, executable oracle, failed compliant alternatives, unchanged mandatory gates |

A remaining conflict is held as an unresolved review candidate until D5 admission is justified. A lane-written approval does not make it green.

### 11.4 Remediation order

Freeze provenance and obligations; classify D1 surfaces and existing consumers; adopt composers; normalize imports; classify models/protocols/boundaries; introduce schema-owned data; repair behavior through proven adapters; replace weak ownership in the actual owner scope; separate error formatting; adjudicate each Defect encoder; adopt functions/folds/durations; complete annotations/docs; obtain fresh reviews; run bounded clean checks; lower canonically; then run consumer/root/differential/packaged gates.

Use repository-pinned Node for Node lifecycle observations even though Bun hosts Vitest.

```sh
bun run standards:check --package <package> --require-clean
bun run docs:check --package <package> --require-clean
bun run standards:baseline --package <package>
```

For a pending-deletion facade, preserve the existing contract and lower only by safe removal or actual facade deletion. Do not perform a native-to-Effect public-contract rewrite merely to make its counts disappear.

At phase 10:

```sh
bun run standards:check --phase 10 --require-clean
bun run standards:baseline --verify-from <trusted-base-revision>
```

The final report lists zero remaining facades, zero removable debt, the baseline’s deletion, and every surviving D5 subject.

Do not re-record goldens to hide drift.

## 12. Implementation sequence and self-conformance

Identity and checker first enter repository history together in one fully self-conforming implementation commit. Neither receives positive debt allowances, pending-deletion status, or parity-frozen subjects.

| Stage | Acceptance |
|---|---|
| Editions/scope | Adaptation audit, immutable policy, all executable coverage, Markdown checks |
| Identity | Signatures, descriptors, frozen identities/formatters, literal shadows |
| Infrastructure | Models/services, snapshot cleanup, version checks, semantic facade |
| Rules | Every code’s violating/conforming and adversarial fixtures |
| Docs | Ownership, languages, strict pre/post-transform compilation, maps, equality, purity |
| Ratchet/trust | Fresh execution, forged receipts, protected inputs, canonical regeneration |
| Classifications | D1/D5 admission, exact subjects/counts, gate non-bypass, stale evidence, phase-10 deletion/resurrection fixtures |
| Bootstrap | Pre-repair obligation freeze; hard Example failures repaired; attributable debt seed |
| Enrollment | Explicit root tests/checks, Biome, Syncpack, Turbo, hook, protected CI |
| First commit | Both packages clean, all mandatory checks/tests/docs/reviews green |

Violating snippets are `.txt` fixture data outside production source. The harness parses virtual source. They do not require suppressions.

Every message code has a violation, nearest conforming neighbor, exact expected code/range, alias/shadowing/equivalent forms, false-positive regression, and uncertainty case where applicable.

Additional suites cover export conditions, overloads/merges, JavaScript/declarations, wrapped data aliases, module-reference variants, Markdown languages, line maps, top-level await, assertion conservation, internal/guidance deletion, purity invalidation, interrupted children, debt exchanges, new legacy edges, scope tampering, review forgery/staleness, fixture weakening, migrations, and all three integration adversaries.

D1/D5 fixtures additionally prove rejection of:

- A clean new file added to a pending-deletion facade.
- A new native-error or collection subject substituted for a removed one.
- A renamed or re-exported facade surviving phase 10.
- An owner-review row without a trusted attestation.
- A frozen subject whose boundary or oracle changed.
- A D5 attempt to bypass a compiler or port diagnostic.
- A count-preserving subject exchange.
- A missing facade file with a surviving consumer/import.
- A documentation retirement without deletion/transfer evidence.

D2 tests cover actual owner closure, failure, interruption, same-owner sharing, separate foreign identities, concurrent admission policy, and no stale entry after shutdown.

D3/D4 tests cover empty and multiline messages, explicit versus omitted identifiers, exact emitted name/format/payload, retained original causes, and fixed-stack encoding.

Use `@effect/vitest`. Property tests derive data through installed `Arbitrary.schema` from production schemas; never weaken models for generators.

Verified prototypes do not establish full composer descriptors, all migrations, complete generic/purity analysis, trusted CI isolation, whole-repository docs acceptance, or packaged parity. Those remain acceptance gates.

## 13. Objections

### 13.1 Native public collection contracts — resolved by D1

Existing legacy Map/Set contracts remain intact and counted as `pending-deletion`. They reach zero through phase-10 facade deletion and the no-import proof in section 9.9. They are not D5 candidates.

### 13.2 Weak ownership — resolved by D1 and D2

The transcription legacy subject ends under D1. The strict downloader subject uses deterministic scoped ownership under D2. The verified lifetime kernel and cleanup test are recorded in section 11.2.

No objection remains based on weak-key GC lifetime.

### 13.3 Native error contracts — resolved by D3

Strict code uses schema-backed tagged errors. Emission boundaries preserve recorded bytes; existing facades retain required native-class rejection contracts until deletion. Installed runtime facts and a byte-identical formatter probe are recorded in section 11.2.

Only a proven inability to reproduce required bytes through a compliant form can become a D5 proposal. None is currently expected.

### 13.4 Defect stack inclusion — resolved by D4 and D5

Apply stack inclusion per field unless a frozen encoded boundary is demonstrated. An irreconcilable encoded contract requires exact D5 admission. Section 11.2 records evidence for the listed sites and their siblings; no current admission is expected.

### 13.5 Other retained objections and limits

Counts alone are insufficient; subject identity is required. Mechanical candidates are not semantic proof. Identifier absence and historical spans must remain frozen where observable. Purity is not a sandbox. Compiler analysis is unstable and separately pinned from tsrs. Public docgen remains incompatible with the selected TypeScript peer range. Bootstrap cannot normalize deleted Examples. Synthetic timings do not establish complete-gate performance.

The D2 kernel is not a completed downloader integration. D3’s formatter probe is not every error boundary. D4’s inspected consumer paths are not a substitute for final per-site attestation.

These limits authorize no disabled check. They identify implementation and acceptance proof still required.

## 14. Review dispositions

“Resolved” means the design addresses the finding. It does not assert that the production implementation has passed acceptance.

| Finding | Disposition | Resolution |
|---|---|---|
| F1 | Resolved | R21 retains every SchemaFirst family as counted enforcement. |
| F2 | Resolved | T01 limits and R22 missing native families are explicit. |
| F3 | Resolved | R04 mechanically reports native errors and untyped throws; D3 specifies compliant boundary handling. |
| F4 | Resolved | R20 detects constructor makeOption opportunities with lawful-absence review and zero initial debt. |
| F5 | Resolved | Guidance fences receive safety/import/compiler checks and exact negative-fixture treatment. |
| F6 | Resolved | R09 follows duration parameter/property provenance, including Schedule. |
| F7 | Resolved | R03 preserves ambient/unbound availability checks. |
| F8 | Resolved | Necessary literal/tuple const assertions remain lawful. |
| F9 | Resolved | In-body class/error guards remain lawful; attached universal facades are detected. |
| F10 | Resolved | V’s strict Example policy and lawful observations are explicit. |
| F11 | Resolved | Assertion target/block grammar, conservation, and vacuity checks are specified. |
| F12 | Resolved | Effective identifier absence/value and formatter output are frozen. |
| F13 | Resolved | Constructor/trailing identity and observed class/error surfaces agree; D3 separates emitted legacy bytes. |
| F14 | Resolved | Exact application manifest names and test identities are included. |
| F15 | Resolved by decisions and verified forms | D1–D5 settle the prior parity objections; §11 records scoped cleanup, installed error facts, boundary-byte proof, and per-site Defect evidence. Application acceptance remains required. |
| F16 | Resolved | Existing spans/Cause output are preserved; untraced functions remain available. |
| F17 | Resolved | Default builder includes basename collapse/index removal and mirrored paths. |
| F18 | Resolved | Stable IDs and protected moves preserve history. |
| F19 | Resolved | Acceptance and independent regeneration run freshly and ignore serialized outcomes. |
| F20 | Resolved | Every active executable file has compiler coverage, including supplemental JavaScript projects. |
| F21 | Resolved | File/code limits plus new-subject comparison prevent debt exchange; D1/D5 classified counts are independently monotonic. |
| F22 | Resolved | Uncertainty remains counted. |
| F23 | Resolved | Reviews use generated subjects and external, digest-bound independent attestations. |
| F24 | Resolved | Non-exact combinators and undefined-admitting keys remain detected; lawful boundary semantics require proof. |
| F25 | Resolved | Named/computed/parameter numbers receive duration scrutiny. |
| F26 | Resolved | Pre-repair permanent obligations include internal/type/nonexported Examples and guidance fences. |
| F27 | Resolved | Protected migration handles bootstrap, corrected rules, scope, toolchains, and exact D1/D5 admission. |
| F28 | Resolved | Exact compiler pins, authority, facade, and disagreement failure remain. |
| F29 | Resolved | Redundant inline LiteralKit assertions are distinct from lawful const inference. |
| F30 | Resolved | Alias/re-export and alternate sorting routes are covered. |
| F31 | Resolved | Void-discard repairs remain rejected; lawful subset was recompiled/executed. |
| F32 | Resolved | Public doctest was compiled/run; installation status and artifact limits are explicit. |
| F33 | Resolved | Owner-level class Example policy and non-exempting internal/ignore tags remain. |
| F34 | Resolved | Purity has producer, closure digest, approval, invalidation, and execution consequences. |
| F35 | Resolved | Public reachability controls required Examples; internal prose and optional-fence obligations remain. |
| F36 | Resolved | Identity/checker enter history together, clean, with concrete gate enrollment and no D1/D5 allowances. |
| F37 | Resolved | Grouped execution, real deadlines, both scale suites, and saved timings remain; current bounded probes were rerun. |
| F38 | Resolved | Runnable names bind to titles; all recognized languages are discovered. |
| N1 | Resolved | Serialized receipts and candidate Turbo artifacts cannot satisfy acceptance; forged-receipt fixture is mandatory. |
| N2 | Resolved | Supplemental `allowJs`/`checkJs` projects execute unchanged diagnostics; actual coverage is checked. |
| N3 | Resolved | R01 explicitly prohibits counterpart Node references across imports, re-exports, import-equals, dynamic imports, and require forms. |
| N4 | Resolved | R21 classifies resolved aliases/wrappers/unions/intersections under one stable data-model code. |
| N5 | Resolved by D1–D5 and verified forms | No gate weakening or allowlist entry. Legacy debt ends by deletion, strict ownership is scoped, errors are formatted at boundaries, and only exact evidenced conflicts can be frozen. |
| N6 | Resolved | Permanent stable identities cover all admitted Examples and guidance fences before bootstrap repair. |
| N7 | Resolved | Prescribed Example configuration explicitly uses the measured non-composite/non-incremental settings; raw outputs are retained. |
| N8 | Resolved | Generation preserves TSX/MTS/CTS kinds and module interpretation; each language compiled. |
| N9 | Resolved | Root test/check, Turbo, Biome, Syncpack, hook, and CI edits are concrete; failing-suite and off-catalog adversaries are required. |
