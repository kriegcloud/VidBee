# Porting a VidBee package to Effect v4

VidBee migrates package by package. Desktop, CLI and browser extension are the
applications; shared logic belongs in `packages/`. A unit becomes ported when its
TypeScript configuration extends the root `tsconfig.base.json`, directly or
through another local configuration. `bun run port:check` lists every application
and package configuration, including desktop's node and web configurations.

Keep the application's behavior unchanged. Characterize outputs and failures
before replacing an implementation. Leave unported configurations and source
formatting alone. Do not operate on the owner's live profile or running app.

## Package workflow

1. Read the package exports and every consumer. Record existing signatures,
   thrown errors, initialization side effects and output shapes in tests.
2. Model boundary data with `effect/Schema`, using `LiteralKit` from
   `@vidbee/schema/LiteralKit` for literal unions. Define schema-backed tagged
   errors. Design schemas before service contracts and implementations.
3. Define `Context.Service` classes with deterministic package/file/service keys.
   Write Layers for implementations and inject third-party drivers through those
   contracts. Log with `Effect.log*`; evlog is owned by the logger package.
4. Add exact reference pins to the root catalog only when needed. Every
   third-party manifest dependency is `catalog:`; internal dependencies use
   `workspace:^`. No private `@beep/*` dependency is permitted.
5. Extend `../../tsconfig.base.json`. Keep all root compiler options and
   diagnostic severities. Use a source config with `include: ["src"]`, and a
   test config including source and tests with `composite`, `incremental`,
   `declaration` and `declarationMap` false and `noEmit` true. Do not add overrides.
6. Add package scripts matching logger/schema: `check` runs
   `tsrs -p tsconfig.json --emitDeclarationOnly`, `tsrs -p tsconfig.test.json`,
   then `biome check .`; `test` runs `bunx --bun vitest run`; `build` runs
   `tsrs -p tsconfig.json`. Add the package to the root Turbo filters and root
   Biome include scope. Remove it from legacy lint scope if applicable.
7. Keep the old API in explicit `legacy` exports. Update unported consumers to
   those exports in the same change. Delete dependencies only after the last
   consumer no longer needs them. Run the gates below and record proof limits.

## Logger worked example

`Logger.model.ts` defines `LogLevel`, `LoggerOptions` and `CaughtErrorEvent`.
`Logger.service.ts` defines node and browser sink services. `Logger.layer.ts`
installs Effect loggers that forward to those services; `Node.driver.ts` and
`Client.driver.ts` own evlog calls. Node and browser main exports expose Effect
Layers. Fatal maps to error, trace maps to debug, and full Causes are preserved
in structured details. Tests inject fake sinks and exercise all six levels.

Unported callers import `@vidbee/logger/legacy` or
`@vidbee/logger/legacy/client`. Each environment facade owns one
`ManagedRuntime`, created once at module scope from its sink Layer. Every sync
call uses that runtime's `runSync`; asynchronous facades in later packages use
`runPromise`. Never construct a runtime per call. Keep existing return values,
error classes/messages and import side effects. Logger's browser facade still
calls `initLog` at import. Its raw evlog re-exports keep their original identity.
Delete a facade and its runtime when its last unported consumer migrates.
`@vidbee/logger/script` remains the original JavaScript build-script API.

### Task queue compatibility package

The phase 4 task queue uses an explicit sibling compatibility package instead of
an in-package `legacy` directory. `@vidbee/task-queue` contains the strict kernel;
`@vidbee/task-queue-legacy` keeps the old synchronous/Promise interface, Node
helpers and four retained zod schemas. Dependencies point from compatibility to
kernel. Unported consumers import the sibling package, and desktop bundling
includes both packages. Its `./types` and `./schemas` entries must stay safe for
the renderer. See [the reviewed task queue design](design/task-queue.md) for the
scope and the runtime ownership contract. The sibling is listed as **unported**
by `port:check` until its phase-10 removal. Use this arrangement when exact legacy
synchronous defaults or helper APIs cannot satisfy the strict unit rules; putting
those files under `legacy/` does not exempt them from the ported unit. Keep the
reviewed design explicit about that boundary, and keep the dependency one-way.

Preserve the suspension points of the original Promise methods. `LegacyTiming`
names the old `await` positions: the native layer does nothing and the compatibility
layer yields one microtask turn. Starting a child fiber and settling a Promise can
introduce additional turns; test those sequences directly. Synchronous executor
callbacks, event delivery and admission handoff have synchronous prefixes that
must complete before returning to the host. Timer cancellation is an Effect value;
when creating it inside another Effect, use `Effect.map` to return the value rather
than returning a nested Effect directly from a generator.

Model old mutable structs with `S.mutableKey` and old mutable arrays with
`S.mutable`; record values use `S.mutableKey` on the value schema. `S.mutable`
accepts array schemas, not record schemas. Optional fields must accept the explicit
`undefined` assignments the old callers use (`S.optional` includes that allowance). Compare the old declaration fixture under the compatibility
package's original `exactOptionalPropertyTypes: false` setting: reinterpreting old
`field?: T` declarations under the strict kernel's `true` setting changes their
meaning. Keep the kernel settings strict and check old/new mutual assignability
in the compatibility package, alongside real nested-array mutation sites. Preserve
shallow readonly snapshot/event views as well. Where saved task data must retain
unknown fields, use
`S.StructWithRest` at every object level; a closed outer schema alone cannot
preserve unknown nested fields. Test decode, mutation and encode as a round trip.
The installed parser has no `onExcessProperty: "preserve"` option.

The pure FSM takes `ctx.now` and returns `Result`; compatibility supplies the old
clock default and maps failure to `IllegalTransitionError`. Classifier date
backoff likewise takes explicit time. Keep argument hashing synchronous and retain
its exact `sha256:` format and `sha256:none` sentinel, because an asynchronous
digest would add a suspension. The pure SHA-256 implementation has empty, short,
multi-block and UTF-8 vectors. Task-store indexes and cached ID lists also affect
behavior: replacing them with a scan changes results after a caller directly
mutates a stored object. Preserve those index and cache rules during the port.

Keep semantic read codecs separate from write serialization when preserving an
old typed in-process API. The task queue does not decode host arguments on entry;
validating their semantic shape while encoding a write changed a golden HTTP
invalid-add response from 200 to 500. Schema JSON Unknown serialization preserves
the old JSON write behavior, including key order and non-finite values becoming
JSON null, while open semantic codecs still validate persisted reads. Do not
weaken a committed golden to conceal added validation.

Importing the native `@effect/sql-sqlite-node/SqliteClient` value module eagerly
loads `node:sqlite`, even when only its tag or TypeId was wanted. The borrowed db
adapter uses native types only and registers the exact public service key/TypeId
without loading that driver. Check CLI stderr and an import-only process; do not
suppress ExperimentalWarning output or introduce the second driver before cutover.

A host adapter's synchronous prefix can re-enter the queue. Preserve its order
relative to publishing pending-operation state: the insert adapter starts before
the admission Promise/Deferred is registered. Named timing turns also cover nested
async completion/adoption, not just I/O. For exact Promise settlement, the task
queue uses `runFork` plus an exit observer rather than `runPromise`, and retains
`PreventSchedulerYield` in the runtime's final context. Detached work uses immediate
start where the old callback began its synchronous prefix immediately.

Ordered listener arrays must release removed callbacks. Mark tombstones while
live iteration is active, prune at outermost completion, and prune immediately
outside traversal. Preserve deduplication and stale unsubscribe/re-registration
identity, including across an Effect facade. Keep output writers quiescent during
packaging and check archive integrity when Electron rejects an app before its
JavaScript starts; one phase-4 archive had invalid offsets, with the exact cause
unproven.

## File conventions and the ratchet

Existing filenames stay. New companions are `Foo.model.ts`, `Foo.errors.ts`,
`Foo.service.ts` and `Foo.layer.ts`. Third-party asynchronous adapters are named
`Foo.driver.ts`; only `*.driver.ts` files may use `Effect.promise` or
`Effect.tryPromise` in ported units.

Runtime execution (`Effect.run*`, `ManagedRuntime`) belongs to files under a
`legacy/` directory or entrypoints named `index.ts`, `main.ts`, `entry.ts`,
`cli.ts` (also JS/JSX/TSX and module variants), or `*.entry.ts` and its JS/JSX/TSX
variants. Test suites use `it.effect`, `it.layer` and Effect test services instead
of running their own runtimes. Ordinary service/layer modules never execute a
runtime. The checker uses textual matching; follow the canonical `Effect`
namespace spelling and do not hide APIs behind aliases.

`bun run port:check --json` emits units and violations as structured JSON. The
checker follows local tsconfig inheritance and checks ported source and tests.
It rejects diagnostic comments, nonempty root diagnostic overrides, misplaced
Promise constructors and misplaced runtime execution. It also rejects, anywhere
in a ported unit: suppression comments (`@ts-ignore`, `@ts-expect-error`,
`@ts-nocheck`, `biome-ignore`, `eslint-disable`), `new Map` and `new Set`,
imports of `node:http` or `node:https`, and imports of `zod`. `standards/effect-allowlist.jsonc`
contains exact `{ file, rule, reason }` entries, with no globs. Keep it empty;
record unavoidable exceptions and failed remediation attempts in the phase report
and owner review record according to the plan. Never add a suppression comment,
weaken a diagnostic, add `any` casts or bypass a gate.

Use Effect HashMap/HashSet (including mutable forms), never native Map/Set in
ported source. Every function returning an Effect generator uses `Effect.fn` or
`Effect.fnUntraced`. Never use `node:http`. Decode external data at boundaries.

## Validate APIs against the installed version

The reference pins Effect 4.1.4. Inspect `node_modules/effect/package.json` exports
and `node_modules/effect/dist/<Module>.d.ts` before writing an API. Check the
actual signature and import leaf, then typecheck the smallest real use. Import
public leaves such as `effect/Effect`, `effect/Schema`, `effect/Logger`,
`effect/Context`, `effect/http-api/*` and `effect/rpc/*`. V3 `unstable` imports and
old lowercase Config constructors are incompatible. Reference-only alternatives
are the owner's `~/YeeBois/projects/beep-effect/.repos/effect` and
`.patterns/effect-module-paths.md`.

The copied tsgo matrix currently has 150 entries: 145 errors and five deliberately
off upstream settings (stability checks and import preferences). Preserve that
exact reference matrix; the master plan's earlier count of 187 all-error entries
is stale. A future reference update is a separate change.

## Exact gate order

Run from the repository root after `bun install` (prepare patches tsrs).
The `node:test` suites must run under the repository's pinned Node from
`.node-version`, including when Vitest is hosted by Bun. Verify `node --version`
before the gate. If a worktree shim selects a different version, prepend the
pinned installation's `bin` directory to `PATH`, for example:

```sh
export PATH="$HOME/.local/share/mise/installs/node/$(cat .node-version)/bin:$PATH"
node --version
```

Then run:

```sh
bun run --cwd packages/schema check
bun run --cwd packages/logger check
bun run port:check
bun run check
bun run test
bun run deps:check
bun run build:linux
bun run --cwd apps/cli build
bun run test:golden
```

`bun run test:golden` launches the packaged build offline on a synthetic fixture
profile and compares 379 MCP, HTTP, CLI and renderer answers with the goldens in
`apps/desktop/test/golden/`. [GOLDENS.md](GOLDENS.md) explains how to run a
subset, how to add a case for a tool or endpoint that has none (do this on the
build before your change), and how to update a golden when a change is intended.
A phase that ports a unit must leave the suite passing without touching a golden,
unless the plan removes the behavior.

For subsequent phases, substitute the ported package names in the first two
commands. Whole-repo `check` retains legacy desktop lint, locale validation and
typechecks, then runs ported checks through Turbo and the ratchet. `test` retains
all 216 node:test audit tests, runs ported Vitest tests through Turbo, and runs
checker and negative type fixtures. `test:audit` remains the legacy alias.
`turbo run check test build --filter=@vidbee/logger` demonstrates per-package
cached tasks. Cache outputs live in `dist/`; do not commit generated output.

CI on Ubuntu 24.04 runs the static/tests/catalog/ratchet gates. The orchestrator
owns packaged builds and isolated launch/golden verification; these are separate
proof obligations. From phase 1b onward, run the golden suite against an isolated
fixture profile as required by the master plan. Never treat source checks as
proof that an installed application launched.

## Lint and hooks

The root `biome.jsonc` copies transferable reference settings and applies only to
ported packages. `biome.legacy.jsonc` extends vendored Ultracite 8.0.2 presets in
`standards/biome-legacy/`; it preserves the old desktop invocation's findings and
formatting. Its VCS root is relative to the desktop working directory, so invoke
it with the package's `check` or `fix` scripts. Delete legacy configuration in
phase 10. Lefthook's pre-commit runs Biome on the staged files of ported packages and
`bun run port:check`, both read-only; it never stashes, formats, stages files or
rewrites the index, including during merges. The whole-repo gate runs in CI. Prepare
uses `lefthook install --force` to replace an existing Husky hooks path safely.

## Pitfalls found in phase 1a

- Copy actual reference config rather than assuming prose rule counts. Keep
  compiler diagnostics exact even where explanatory upstream comments are stale.
- Public source exports are consumed by unported TypeScript configurations.
  Relative `.js` imports resolve to `.ts` during checking and bundling, avoiding
  a new `allowImportingTsExtensions` requirement on unported consumers.
- Use `Config.String`, not the V3 lowercase constructor. Config is yieldable.
  Legacy live environment reads require a fresh `ConfigProvider.fromEnv` on each
  call with `preserveEmptyStrings: true`; the default provider caches its snapshot.
- Shared Layer tests use `it.layer`; `Effect.provide` inside a test generator
  violates strict scope policy. Set `References.MinimumLogLevel` to `All` to
  assert debug/trace routing.
- @effect/vitest property options use `arbitrary: { runs: 25 }`. Negative type
  assertions belong in disposable compiler fixtures, never suppression comments.
- Import-time spy history can be cleared by test services. Keep a separate fake
  sink initialization record when testing module initialization.
- Do not format `logger/src/script.mjs` or unported sources. Use package-scoped
  formatting and inspect the diff afterwards.
- A configured Husky hooks path blocks plain `lefthook install`; the `--force`
  option installs Lefthook into the already configured location without stashing.
- If Bun cannot access its inherited temporary location, set `TMPDIR` and
  `BUN_TMPDIR` to a writable scratch directory. No privilege escalation is needed.
- Never overlap a deliberately failing diagnostic fixture with whole-repo checks
  or tests. Remove the fixture in a finally block before running real gates.

## Database access

The desktop process uses only `better-sqlite3` until the final driver cutover.
Do not import `@effect/sql-sqlite-node` or `@vidbee/db/node` from a ported unit
outside `packages/db`: `port:check` reports `node-sqlite-before-cutover`. Phase
9.5 or 10 removes this rule when the last raw handle holder leaves the process.
Different SQLite drivers must never open the same file within one process.

1. Request `SqlClient.SqlClient` from context. A legacy facade receives the
   host's existing handle and calls `runtimeForHandle` from `@vidbee/db/legacy`.
   Reuse that runtime and call `releaseHandle` before the host closes its handle.
2. Transactions and every path invoked by a synchronous facade contain SQL and
   pure work only. Never sleep, await, or invoke a yielding service while holding
   the database permit; contended acquisition is a programming defect.
3. State the begin mode on every operation with `SqlClient.BeginTransaction`.
   Preserve `BEGIN IMMEDIATE` for task queue and transcripts and explicit `BEGIN`
   for subscriptions. A host-owned transaction is borrowed through a savepoint.
4. Decode rows with the exported row models, or derive a schema from their fields
   beside the query for projections, aggregates and computed columns. Decode
   failures become `DbRowDecodeError`, with an issue that excludes row content.
   Do not fetch extra columns to satisfy a decoder. `CountRow`, `ExistsRow` and
   `IdRow` cover shared small query shapes.
5. Legacy facade failures go through `rethrowDriverError` so old callers continue
   to receive the original driver error object, class, message and code.
6. Never use the SQL client's stream operation: the target node driver does not
   implement streaming.
7. Run each ported consumer's persistence tests against the borrowed-handle and
   node clients in separate processes. Both must pass before claiming cutover
   readiness.

Drizzle 1.0 requires `drizzle({ client: handle })`; the old positional call opens
an unrelated in-memory database. Migration directories now hold `migration.sql`
and `snapshot.json`. Preserve SQL bytes and original millisecond journal values
when reconciling migration tracking, so the preceding 0.45 build can reopen a
fresh database. A cached `better-sqlite3` statement's `.raw(true)` mutates it;
restore object mode in `finally`, including after errors.

## Downloader process and compatibility patterns (phase 5)

The downloader separates process observations from domain results. `DownloadProcess` accepts an
explicit command specification and a synchronous Effect sink. Compatibility listeners enter the
sink directly through the owner's warmed runtime; a stream consumer cannot preserve delivery
before a Node listener returns. Keep raw byte chunks intact. Ordinary yt-dlp output decodes each
chunk independently; Redgifs uses streaming UTF-8 decoding and readline-compatible delivery.

Raw completion retains nullable code/signal and the actual child `killed` flag. Native completion
retains an exit code or the actual `PlatformError`; native acquisition failure has no acquired
child, PID or spawn notification. Never synthesize missing raw observations. Keep a process scope
alive through its attempt, including output drain, and own asynchronous finalization separately
from the synchronous sink. The native differences and per-site cancellation policies are specified
in [the downloader design](design/downloader-core.md), section 6; phase 9.1 must resolve or declare
these before switching the application from the compatibility process layer.

Reuse `DownloadFiles` for downloader persistence behavior, preserving byte decoding, BOMs,
false-on-failure existence probes, separate read/stat recovery, and creation-only modes. Directory
creation, direct write and rename are separate capabilities. Do not introduce a generic atomic
writer that changes the known-items direct overwrite, temporary filenames, failed-rename residue,
cache-before-save order or existing inode permissions.

`@vidbee/task-queue-legacy/runtime` exports `runLegacyPromise(runtime, effect, mapError)` and
`runLegacySync(runtime, effect, mapError)`. Both owners keep their own warmed runtime. The Promise
runner settles from a fiber exit observer without another Promise handler; the synchronous runner
maps `runSyncExit` failure before throwing. Cross-owner callbacks re-enter the receiving owner's
runtime synchronously. Reuse these utilities rather than constructing a per-call runtime or
changing the suspension points of an old Promise method.

Wrapper tests compare raw event traces against the installed `yt-dlp-wrap-plus` oracle. Injected
`spawnFn` emitters already represent wrapper observations and must bypass a second conversion.
For Node-specific spawn/abort/error messages, explicitly select the repository-pinned Node and
compare structured traces inside Node child processes. Bun hosts Vitest; its own interpreter is
not a substitute for the pinned Node fixture. Normalize only fixture paths, PIDs and timestamps,
never error messages, chunk boundaries, callback ordering or synchronous observation markers.


Downloader raw progress stays unknown until its field checks; the wrapper can emit NaN for a
false-positive progress regex match. Do not weaken finite domain schemas to model that raw value.
The default best-quality preset also uses a null height sentinel: a truthiness rewrite must skip
null as well as zero and undefined. Pin every saved quality preset through its complete selector.
Optional cookie booleans need their original boolean coercion; testing only true does not establish
false/default parity. The packaged remux path exposed this distinction after source suites passed.

Downloader signals use the additive `ProcessRequests` tag beside `ProcessControl`: PID, group-only
and tree requests acknowledge without awaiting termination. Existing queue recovery `kill` remains
unchanged. Neither capability adds process identity checks; those remain `ProcessRegistry`'s role.
`InstagramInspectionLookupLive` connects native enqueueing to the same inspector/cache owner;
compatibility borrows its host inspector and queue instead of exposing or reconstructing runtimes.


### Parity boundary for inputs outside the declared types

Inside the declared types, preserve exact behavior: results, deliberately constructed error
classes and messages, and synchronous throws versus rejected failures. Both declared forms of a
`dual` function must work for valid arguments. Invalid data-first dispatch is not a parity contract.

Unported callers still forward unvalidated JSON from automation, IPC, settings and yt-dlp output.
Outside the declared types, preserve an old successful result for `null`, a JSON scalar of the
wrong kind (`false`, `true`, zero, another number, an empty string or another string), or `NaN`
when a truthiness test, `||`, `??`, `typeof` check or comparison decided that result. Express the
condition plainly where it matters, without widening the public type or retyping the parameter
as `unknown`. For example, retain a Boolean binding when the strict boolean rule requires it:

```ts
// Wrong: an unset JSON false or zero would now reach string processing.
if (fileName === undefined) return undefined;

// Right: preserve the old successful falsy result and narrow the declared optional string.
const hasName = Boolean(fileName);
if (fileName === undefined || !hasName) return undefined;
const trimmed = Str.trim(fileName);
```

When the old type-violating call threw an engine or Node error, the new call must still fail;
its natural error class, message and Node `code` need not match. Do not construct an old engine
message or route through a helper whose purpose is to reproduce one. No parity is owed for an
array, object, iterable or function in a scalar position, or a non-array in an array position.
Remove branches that exist only for those inputs. The differential oracle compares successful
results exactly, allows any new throw for an old engine/Node failure outside the types, and
compares deliberately constructed errors exactly.

Keep the reviewed external-data exceptions exact, including error class and message: core
metadata's null root, non-array formats and null format entry; playlist yt-dlp entry `url` and
`ie_key` fields; Facebook reels JSON; the parser message inspected by the metadata retry
predicate; and the Redgifs null JSON line. These are values the package itself reads, with
specific failure policies already characterized by the reviewed design. They do not establish
a general engine-error emulation policy for typed pure helpers.
