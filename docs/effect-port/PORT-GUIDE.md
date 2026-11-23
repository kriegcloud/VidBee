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
JavaScript starts; phase-4 and phase-6a archives had invalid offsets, with the exact causes
unproven. A successful builder exit is insufficient: compare every packed/unpacked entry
against its header size/full/block hashes before diagnosing application source. Phase 6a
recovered through a serialized rebuild without source/script changes. In a managed environment,
Chromium subprocess restrictions can independently block a valid package: preserve the default
launch failure, keep extra launch flags in a scratch-only wrapper, verify the copied binary and
resources byte-for-byte, and report those launch conditions separately from default proof.

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

## Defect classes found by code review

Preserve observable legacy behavior, including falsy inputs and old bugs, and make native
Effect resource lifetimes safe under failure and interruption. The independent review found
these classes; apply each rule before relying on a green typecheck.

- **Generator `try`/`finally` or `try`/`catch` around `yield*`:** Effect failure and interruption
  do not unwind JavaScript generators in Effect 4.1.4. Use Effect error handling and finalization.
  Wrong: `try { yield* work } finally { release() }`
  Right: `yield* work.pipe(Effect.ensuring(Effect.sync(release)))`
- **Cleanup after `yield*`:** install cleanup before starting work, and mask acquisition until
  its finalizer is installed. Use `withPermits`, `onExit`, `ensuring` or scoped acquisition.
  Wrong: `yield* semaphore.take(1); yield* work; yield* semaphore.release(1)`
  Right: `yield* work.pipe(semaphore.withPermits(1))`
- **Registration after fork:** a child can finish synchronously. Publish identity before
  scheduling callbacks, or complete the Deferred in the child independently of registration.
  Wrong: `entry.timer = yield* schedule(entry); entries.set(id, entry)`
  Right: `entries.set(id, entry); entry.timer = yield* schedule(entry)`
- **Truthiness rewrites:** `!== undefined`, `??` and empty-string checks do not preserve
  JavaScript truthiness for null, zero, false or NaN. Use `Predicate.isTruthy` where the old guard did.
  Wrong: `if (input.subscriptionId !== undefined) use(input.subscriptionId)`
  Right: `if (Predicate.isTruthy(input.subscriptionId)) use(input.subscriptionId)`
- **Methods on unverified values:** Effect string/array functions can accept or fail on different
  values than old methods. Preserve returned results within the parity boundary below; an old
  engine or Node failure only requires failure for a type-violating call. Do not add a discarded
  pre-call solely to reproduce its error text.
  Wrong: `oldMethod(unverified); return strictMethod(unverified) // discarded error-text pre-call`
  Right: `return strictMethod(unverified) // verify required results and failure, without engine text`
- **`dual` predicates:** distinguish optional configuration from the data argument using the
  actual call shapes, and test every data-first and data-last overload within the declared types.
  For inputs outside them, apply the parity boundary below.
  Wrong: `dual((args) => typeof args[0] === 'string', body)`
  Right: `dual((args) => args.length >= 2 || (args.length === 1 && args[0] !== undefined && typeof args[0] !== 'number'), body)`
- **Snapshot before lock:** predicates controlling resource ownership read current state inside
  the protected body. Pass a live accessor instead of constructing a set before acquisition.
  Wrong: `const live = snapshot(); yield* sweep((id) => live.has(id))`
  Right: `yield* sweep((id) => store.get(id).pipe(Effect.map(isLive)))`
- **Legacy error class drift:** strict tagged errors must be translated by every legacy helper
  that calls the strict implementation; re-exporting a helper can bypass that boundary.
  Wrong: `export { virtualError } from '@vidbee/task-queue/classifier'`
  Right: `const rule = getLegacyRule(category); return buildVirtualError(rule)`
- **Third-party error wrapping:** upgrades may wrap errors even when the SQL and result shapes
  stay the same. Re-throw the original driver object for every supplied-store caller.
  Wrong: `return store // DrizzleQueryError now escapes`
  Right: `return withDriverErrors(store) // rethrowQueryError unwraps the original cause`
- **Structural equality for foreign object keys:** Effect hash maps compare unmarked objects
  structurally. Foreign resource handles require reference identity and explicit release.
  Wrong: `MutableHashMap.get(runtimes, databaseHandle)`
  Right: `Array.findFirst(entries, (entry) => entry.handle === databaseHandle)`

Cross-owner callbacks re-enter the receiving owner's runtime synchronously. Capture that owner's
context at construction and provide it to detached callback work; retaining a scope alone does
not retain its logger or `PreventSchedulerYield`. Native classifier callers currently use the
Effect date parser, which treats zone-less timestamps as UTC and differs on named timezone
suffixes. Compatibility callers explicitly supply `Date.parse` until the later native cutover.

### Parity boundary for inputs outside the declared types

Inside the declared types, preserve exact observable behavior, including return values, error
classes/messages, calling conventions and suspension points. Outside those types, preserve the
old returned result for `null`, a wrong-kind JSON scalar (string, number or boolean), and `NaN`
when the old implementation returned a result. If a type-violating call instead threw an engine
or Node error, the replacement must also fail; it need not emulate that error's text or code.
Arrays and objects supplied in scalar positions have no parity obligation. Deliberately
constructed application errors retain their existing contract.

Wrong: `expect(() => list({ query: 42 })).toThrow("opts?.query?.trim is not a function")`
Right: `expect(() => list({ query: 42 })).toThrow(); expect(list({ query: null })).toEqual(oldNullResult)`

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


### Parity boundary: the downloader's worked example and exceptions

The general rule is stated under "Defect classes found by code review" above. This subsection
restates it with the downloader's example and lists the downloader's external-data exceptions.

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

## Subscription owners and host observations (phase 6a)

Subscriptions uses a strict kernel and a temporary sibling compatibility package. Its public
classes keep warmed owners; its database facades enter the db package's existing handle runtime.
Keep the supplied Drizzle object for statement execution. Reserving a second time from a
synchronous logger re-entry changes behavior: borrow the active same-handle synchronous region,
release it on every throw, and leave host Promise lookup outside the reservation. Do not treat a
wrapper found only in an arbitrary value's cause chain as a top-level Drizzle query wrapper.

Callback receiver and capture semantics are part of a bridge. Capture constructor references
once. Scheduler callbacks see its live normalized options object (and can mutate interval or
callbacks there), leader callbacks see their instance, and API callbacks retain their owner.
The same history callback has no receiver inside a policy and has the API receiver at the
second RSS filter. A call-time global fetch lookup must still be invoked as a bare function.
The subscription SchedulerSettings/SchedulerHost and PolicyHistory capabilities express those
host observations without changing native defaults or old public declarations.

An old internal async method adds an adoption turn even when it rejects. A named turn written
after a yield is skipped on failure. Apply it to the operation's Exit, then propagate that Exit;
use the captured-Exit finalization helper when JavaScript finally failure must replace the prior
outcome. The phase-6a await ledger and exact API/feed microtask fixtures show the boundaries.
Include synchronous throws as well as rejected Promises and use enough markers to observe the
whole operation; a short marker sequence can hide a late settlement difference.

Register completion/lifecycle state before a fiber can finish synchronously. Preserve when the
old synchronous host prefix exposed deduplication to reentrant callers; a prematurely visible
in-flight record can make a callback await itself. An already completed fiber must never leave a
new stale registration after its fork returns.

Parser values remain unknown until the old projection/interpretation point. Scalar roots that
previously produced an empty feed still do. Array-carried image properties count as object fields.
Do not turn a supplied Response's independent ok/status observations into a new validation rule.
Construct the old deliberate status error before validating a native finite-status model;
scalar/non-finite statuses previously accepted by a fake host still determine its exact message.
Keep typed data-first forwarding aliases in compatibility: re-exporting a new strict dual function
can change the old callable declaration even when ordinary calls still work.

Subscription SQL updates return the schema-backed `SubscriptionMutationResult`, preserving
constructed patch values separately from SQLite storage coercion. Reads keep the narrow stored
model. Never reread or decode a mutation as a stored rule: null/raw interpreted artwork, title
and nullable intervals can succeed while their stored representation differs. Preserve omitted
versus explicit undefined logger metadata through every host forwarding function; argument count
is observable even when ordinary callbacks ignore the extra argument. Phase 9.2 still owns the
documented native HTTP/SQL/entropy and detached-failure differences. The application retains
compatibility host layers meanwhile.

### Browser capture: callbacks, opening attempts and transport ownership

Keep compatibility exports as plain positional wrappers when their original signatures were
positional. Forward optional arguments explicitly into a native dual helper. Directly reexporting
a dual changes omitted-argument calls into data-last functions; test the facade with omitted and
explicitly undefined arguments as well as both valid native forms. Mutual type assignability is
not sufficient to prove mutable public fields: include actual writes against the old public
results and inputs in the compile fixture.

Publish an opening-attempt record before starting an immediate child fiber. Clear it only when
that same attempt finishes. A synchronously failing injected host otherwise lets the child clear
the slot before its parent assigns the completed fiber, poisoning retries. Preserve the original
Promise boundaries by name when public snapshots or callback reentry observe them: an async
return, an awaited rejected operation and a finally-returned Promise can each affect the visible
state. Record Promise settlement and per-microtask snapshots in a frozen old/new stateful oracle;
a final-state assertion alone misses these changes.

Raw process acquisition and observation registration are separate capabilities when a public
spawn callback historically precedes listener attachment. Explicit on-demand activation preserves
that callback window. Host invocation projection may preserve omitted Node options, string stdio
and string stdin writes without changing the native byte-stream contract or duplicating capture
orchestration. Test the default shared-process path separately so capture policy cannot change
other consumers.

A native HTTP response owns an attempt scope from acquisition through release. Install cleanup
before an interruptible acquisition, and release rejected status/MIME responses even when no body
copy starts. Body and callback failures must close the same scope. Compatibility release can be a
no-op where the old host leaves body ownership to its transport. Preserve raw callback errors by
identity; unwrap only recognized tagged failures, never arbitrary objects carrying similarly named
metadata fields.

The installed Effect timer declarations expose no public unref/keepAlive option. If a design
requires an unreferenced native timer while strict rules prohibit global timers, record the API
and diagnostic evidence and leave that branch explicitly unavailable. Do not hide a host timer
behind an alias or mark liveness parity proven from compatibility-only tests.

### Transcription port observations (phase 6c)

Keep compatibility call signatures separate from native dual functions. A direct reexport also
exports the native curried overloads; bidirectional declaration fixtures detect this even when
all old calls still run. Bind the compatibility value to the original function signature, and
retain native `HashMap`/`HashSet` results only behind the legacy Map/Set adapters. A native
`Context.Service` called `TranscriptStore` is not the legacy class type: consumer type imports
for existing store instances must remain on the compatibility package.

Native dual functions take every argument explicitly and use fixed arity when an optional
fallback would overlap the data argument. The compatibility wrapper keeps the original optional
arguments and applies exported defaults. Never dispatch by truthiness or literal membership,
or weaken `missingPipeableSignature`.

```ts
// Wrong: the unary call could mean either data or fallback.
const parse = (value: unknown, fallback: Tier = DEFAULT_TIER): Tier => body(value, fallback);
// Right: native forms have fixed arity; compatibility applies the default.
const parse: {
  (value: unknown, fallback: Tier): Tier;
  (fallback: Tier): (value: unknown) => Tier;
} = dual(2, body);
const legacyParse = (value: unknown, fallback: Tier = DEFAULT_TIER): Tier => parse(value, fallback);
```

Wire envelopes and consumed data are different schemas. A worker result keeps its inline value
and path unknown until truthy-inline/file-fallback selection; a probe success can carry metadata
the parent never consumes. Decode only the selected payload and the consumed fields. Keep
unknown protocol kinds ignored and existing invalid-JSON recovery. Where an original syntax
exception must escape, the compatibility JSON driver preserves the actual `JSON.parse` failure;
semantic rejection uses a stable content-free boundary name. Retained file/result metadata needs
open nested schemas, not only an open root. A valid inline result may also carry an identity
contract, so validation must not replace it with a decoded clone.

The worker's model preparation Promise starts before audio extraction and originally has no
rejection handler until its later await. A compatibility preparation handle must retain that
window; eagerly adopting it into an observed fiber changes `unhandledRejection` behavior.
Native fibers use scoped ownership and require a separate cutover decision. Blocking worker
stdout and native awaited `Stdio` are likewise distinct policies; source-level fake-addon tests
cannot establish packaged speech throughput or watchdog acceptance.

Exercise native callbacks as foreign receiver-bound methods. Native probe time consists of two
synchronous monotonic reads immediately around decode, excluding setup and result parsing.
Read raw sherpa JSON through the installed addon subpath in the native driver; preserve the old
synchronous JSON patch only in compatibility. An installed-addon API prototype establishes an
ABI observation, not speech, model-quality, provider-selection, or public golden acceptance.

Apply the full strict test configuration after formatting. Biome can simplify a conditional
`Boolean(value)` back into a non-boolean condition that tsrs rejects. Keep an explicit Boolean
binding, or an appropriate Effect predicate, and rerun both tools. Native filesystem Date
metadata can lose fractional-millisecond precision compared with `statSync`; fingerprints,
cache keys and publication proofs must name that difference before native application cutover.


An old async callee can add an observable completion turn even when its body has no pending
work. Preserve both successful and failed Promise adoption before a caller's catch/finally
boundary. A redownload-in-flight test must record the caller continuation marker together with
listener callbacks: matching final results and listener order alone misses early delivery.

The shared process vocabulary is `ProcessSpec`'s `deliver`/`unread` and `ProcessRun`'s
`writeStdin`, `isRunning`, `observeClose`, activation and signal requests. Transcription's
`ProcessCapabilities` is an owner/validation adapter over `DownloadProcess`, never another
spawn implementation. Optional `extendedLifecycle` enables `ProcessRun.lifecycle` (input EOF,
reaped outcome, live signalling state and graceful worker termination); existing calls retain
their original defaults and layer ownership. The optional start owner applies only to that
extended path. Raw string chunks from an encoded transcription stream are converted there;
ordinary raw chunks retain identity. Extended unread output requires a pipe before spawn.

An optional spawn seam must look up the live host function at acquisition unless the caller
explicitly supplies a replacement. Capturing it as a default argument when constructing a
layer breaks later module replacement and changes existing callback oracles. Native EOF also
requires the stock writable's endOnDone option: enable it only for extended invocations and
prove two writes followed by EOF against a real child. A mocked Sink can conceal a missing EOF.

## Desktop partial ownership (phase 9.0)

Desktop retains its original legacy configs and their checks. The three
`apps/desktop/tsconfig.ported.{node,web,test}.json` configs extend the strict
base and use exact `files` roots, with no glob include/exclude. The desktop
ownership manifest and baseline use version 1, with a `files` array of
`{ file, partition, capability, environments }` and a `renames` array of
`{ from, to }`. Paths are repository-relative; environments are `node`, `web`
and `test`. Shared roots may name multiple environments. Every desktop TS/TSX
file, including declarations, workers, tests and build configs, needs ownership.
The initial inventory has no strict roots and promotes no application source.

To promote a file, set its partition to `strict`, record its capability and
all compiler environments, add it to the matching configs' `files` arrays,
and update the baseline in the same change. Strict dependencies must also be
strict in the importing environment. Package imports retain package ownership;
legacy compatibility implementations cannot enter a strict desktop graph.
The checker applies the existing textual rules to resolved strict desktop
files, including tests, and separately runs native compiler diagnostics.

`port:check` compares the working baseline and the baseline at the target
revision. The default target is `main`, or `origin/$GITHUB_BASE_REF` on a pull
request. Set `PORT_CHECK_TARGET` to an explicit revision for another target.
An unavailable target fails closed. Only a target predating the baseline file
starts with empty historical membership. Never reduce historical strict
membership. A rename records its explicit old-to-new identity, preserves every
strict environment and removes the old path from current ownership.

Graph extraction uses the installed tsrs Node launcher under plain Node,
with separate stdout/stderr capture through close and EOF. Listings must be
nonempty, newline terminated, contain only complete existing canonical file
paths and contain every explicit root. Empty strict partitions skip graph extraction: the installed compiler returns
an empty successful listing for an empty `files` list. Such output cannot prove
a nonempty graph. They still run the separate native diagnostic/config check. No
application placeholder file is introduced. Nonempty environments run in
parallel, including diagnostics for empty partitions.

`node --test scripts/port-check.test.mjs scripts/port-desktop.test.mjs` runs
negative ownership/capture fixtures and removes protections in isolated copies
to prove their assertions detect regressions. Copies live on disk under the
ignored `.cache/ratchet-tests` tree and are deleted after each case.
