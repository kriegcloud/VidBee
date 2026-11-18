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

Run from the repository root after `bun install` (prepare patches tsrs):

```sh
bun run --cwd packages/schema check
bun run --cwd packages/logger check
bun run port:check
bun run check
bun run test
bun run deps:check
```

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
