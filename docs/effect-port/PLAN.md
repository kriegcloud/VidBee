# VidBee Effect-native port: master plan

Status: decisions locked in two grilling sessions on 2026-11-17, amended the same day (see
"Amendments"). Per-phase status is in section 8.
Repo: `~/YeeBois/workstation-apps/VidBee` (fork `kriegcloud/VidBee`, public). Reference: `~/YeeBois/projects/beep-effect`.
This file is the source of truth. Phase 0a moved it here from the owner's knowledge folder, which now
holds only a pointer; phase reports are in `docs/effect-port/reports/`.

## 1. Goal

Port VidBee to Effect v4 at the standard beep-effect holds itself to: every `.ts` and `.tsx` file
passes the full `@effect/tsgo` rule set from beep-effect's `tsconfig.base.json`, code is designed
schema first (schema, then `Context.Service` contract, then implementation), and the libraries
Effect replaces are gone. VidBee becomes a personal hard fork, verified on Linux. Existing files
and package boundaries stay; layout, slices and `@alchemy.run/domain` are decided afterwards in a
separate architecture session.

## 2. Baseline (measured 2026-11-17)

| Fact | Value |
| --- | --- |
| TS/TSX files, lines | 985 files, about 185k lines, zero Effect imports |
| Largest units | desktop 94k (main 46k, renderer 39k, shared 7k), ui 28k, downloader-core 15k, transcription 13k |
| Non-Effect idioms | 1,458 `async`, 359 `new Map/Set`, 334 `JSON.*`, 253 `Date`, 189 timers, 133 files on `node:fs`, 35 on `node:child_process` |
| Rule set | 187 `@effect/tsgo` diagnostics, all `error`, no overrides |
| Decorators | 193, all `electron-ipc-decorator` (16 IPC services); `erasableSyntaxOnly` forbids them |
| Libraries to replace | zod 34 files, Jotai 58, Radix 20 (Base UI already 10), oRPC 7, `@modelcontextprotocol/sdk` 4, `node:http` 12, `better-sqlite3` 20 |
| Dead dependencies | `react-hook-form`, `@hookform/resolvers` (imported nowhere) |
| AI stack | pi: `pi-ai` 30 files, `pi-agent-core` 25, `pi-durable` 16 |
| Tests | 51 files on `node:test` via `tsx`. Desktop main has 12; transcription and the renderer have none |
| Upstream ties | updater reads `nexmoe/vidbee` releases; GA4 and GlitchTip report to upstream; account service uses `api.vidbee.org` |
| CI | nine workflows run on every push to the fork's `main`; the publish ones target upstream's npm scope and stores |
| UI | `packages/ui` has 76 primitives on Radix; beep-effect's `@beep/ui` has 88 (39 on Base UI, none on Radix), about 34 with the same name |
| Already done | pnpm to Bun 1.4.4, root `catalog`, syncpack (`bun run deps:check`) |
| beep-effect pins | `effect` and `@effect/*` 4.1.4, `@effect/tsgo` 0.70.0, `tsrs` 0.25.0-ts7.1.0-beta, `typescript` ^7.0.2, `drizzle-orm`/`drizzle-kit` 1.0.0-rc.5, `vitest` ^5.1.0 |

Package dependency order: `logger`, `i18n`, `db` → `task-queue` → `downloader-core` →
`subscriptions-core`, `browser-capture`, `transcription` → `ui` → `cli`, `extension` → `desktop`.

## 3. Locked decisions

### Product and scope

| # | Decision | Rejected |
| --- | --- | --- |
| D1 | **Upstream:** one final merge of nexmoe/VidBee, then hard fork. Upstream fixes are re-implemented by hand. | Hard fork without a final merge; staying mergeable |
| D2 | **Audience:** personal tool, one user. Windows and macOS code is ported so it compiles; only Linux is launch-tested. No releases. | Delete other platforms; distributed app |
| D3 | **Scope:** port desktop, cli, extension and every package. Delete `apps/web`, `apps/api`, `apps/docs`. | Port everything; desktop and packages only |
| D4 | **Upstream ties:** remove the auto-updater and the telemetry (GA4, GlitchTip/Sentry) in phase 0. The account service (`api.vidbee.org`) stays and is ported. | Remove the account service; keep all three |
| D5 | **CI:** `ci.yml` and `build.yml` are rewritten as the pull-request gate. The release, cli-publish, extension-publish, store-submit, docker-publish and translator workflows are deleted. | Delete all workflows; keep everything |
| D6 | **`@alchemy.run/domain`:** deferred to the architecture session. | Adopt or spike during the port |
| D7 | **Build scripts:** the JavaScript scripts in `apps/desktop/scripts` stay as they are. | Port them during or after the port |

### Strategy and process

| # | Decision | Rejected |
| --- | --- | --- |
| D8 | **Strategy:** package-by-package ratchet in dependency order. A ported package gets the full rule set; unported packages keep their current tsconfig. The app builds and launches after every phase. Each package is ported vertically: schemas, services, tests, and removal of the dependencies it no longer needs. | Big bang; rule-by-rule ratchet |
| D9 | **Bridge:** each ported package also exports a temporary Promise facade with its old signatures, run through one `ManagedRuntime`, for unported consumers. A facade is deleted when its last consumer is ported. | Rewrite call sites each phase; port consumers in the same phase |
| D10 | **Desktop split:** by capability, end to end: main services, `RpcGroup`, renderer atoms and screens move together. Decorator IPC and `effect/rpc` coexist until the last capability moves. | By process layer; main first, renderer later |
| D11 | **Branching and PRs:** each phase is a worktree branch and one pull request on the fork. The agent merges it when the phase gate and CI are green. Feature and fix work continues on `main`; in ported packages it is written Effect-native. | Owner merges every PR; no PRs; long-lived port branch; feature freeze |
| D12 | **Executor:** a fresh Fable orchestrator session per phase, started with that phase's kickoff prompt. It designs, reviews and runs the gate, and delegates implementation volume to Codex `gpt-6.1-sol` or Junie lanes that write to the worktree. | Codex session per phase; one long-running orchestrator |
| D13 | **Parallelism:** phases whose dependencies are merged may run at the same time in separate worktrees, at most three lanes. | Strictly serial; uncapped |
| D14 | **Design gate:** for `db`, `task-queue`, `downloader-core`, `subscriptions-core`, `transcription` and the desktop RPC conventions, the agent drafts schemas and service contracts, commits the draft under `docs/effect-port/design/`, opens a draft pull request, summarizes it in the terminal and waits for the owner in the same session. | Gate every package; no gate; async PR review with a second session; terminal only |
| D15 | **Plan home:** `docs/effect-port/` in the repo holds `PLAN.md`, `PORT-GUIDE.md`, one report per phase and the design drafts. | Keep everything in the knowledge folder; reports only in PRs |
| D16 | **Dogfooding:** after every merged phase the owner's profile is backed up and the new build is installed to the launcher, with the previous build kept for rollback. | At milestones; only at the end |
| D17 | **Deliverable:** this plan plus one kickoff prompt per phase (section 9). | Single prompt; beep-style goal packet |

### Standard and toolchain

| # | Decision | Rejected |
| --- | --- | --- |
| D18 | **Standalone:** `effect` and `@effect/*` only, no `@beep/*` dependencies (all 186 are private). The tsgo rule set, Biome config and written standards are copied. No beep-cli laws. | Move into beep-effect; link `@beep/*` |
| D19 | **`@vidbee/schema`:** phase 1 vendors `LiteralKit` and the helpers it needs from beep-effect's source into a new package, with `@beep` imports rewritten. Copying any further beep-effect helper needs the owner's approval at a design gate. | Plain `effect/Schema` only; decide per case |
| D20 | **Done means:** the strict checklist in section 5, enforced by a script in every gate. No suppressions. | Checklist as guidance; diagnostics only |
| D21 | **New files:** an existing `foo.ts` keeps its name and holds the ported logic. New schemas, errors, service contracts and layers go next to it as `Foo.model.ts`, `Foo.errors.ts`, `Foo.service.ts`, `Foo.layer.ts`. | Everything in place; full restructure now |
| D22 | **JSDoc:** no requirement. Existing comments stay. | Services and schemas only; full beep JSDoc law |
| D23 | **Lint:** beep-effect's `biome.jsonc` minus its beep-only plugins, applied to each package as it is ported. Ultracite is dropped. No Oxlint. | Keep ultracite; full beep stack with Oxlint |
| D24 | **Extras:** lefthook replaces husky; Turbo runs cached per-package tasks. No typos, no commitlint. | Keep husky; plain bun scripts |
| D25 | **Runtime:** tests run with `bunx --bun vitest run`, as in beep-effect (never `bun test`). The CLI and Electron main run on Node with `@effect/platform-node`; the renderer and extension use `@effect/platform-browser`. | Bun for the CLI; Node for tests |
| D26 | **Versions:** VidBee pins exactly what beep-effect's catalog pins. When beep-effect moves, VidBee follows in its own pull request between phases. | Freeze until closeout; always latest |
| D27 | **Dependency updates:** everything else goes to latest in phase 0b on the old code. Drizzle moves with the `db` phase and Vitest with the toolchain phase. | Per package; after the port |

### Technical choices

| # | Decision | Rejected |
| --- | --- | --- |
| D28 | **AI:** pi stays, wrapped as an Effect driver service. `effect/ai` provides the MCP server (replacing `@modelcontextprotocol/sdk`) and one-shot prompt runs. | Replace pi with `effect/ai`; defer all `effect/ai` |
| D29 | **IPC:** `effect/rpc` over a custom Electron IPC protocol replaces `electron-ipc-decorator`. | `effect/http-api` over loopback for the renderer; keep decorators |
| D30 | **SQLite:** spike `node:sqlite` (through `@effect/sql-sqlite-node` and `drizzle-orm/effect-sqlite-node`) before porting `db`. Adopt it if the spike passes, which removes `better-sqlite3`; otherwise keep `better-sqlite3` behind a hand-written service. Bun 1.4.4 also runs `node:sqlite`, so tests use the same driver. | Stay on `better-sqlite3` without a spike; commit without a spike |
| D31 | **UI primitives:** the roughly 34 primitives that exist in both repos are replaced with copies of beep-effect's `@beep/ui` components, restyled to VidBee's theme so the app looks the same, with call sites adapted. VidBee-only components are ported in place. Radix is gone at the end of the `ui` phase. | Port in place then swap Radix; adopt beep-effect's look |
| D32 | **Forms:** the dead `react-hook-form` dependencies are deleted. No form rewrite; TanStack Form only when a new form needs it. | Rewrite forms on TanStack Form |
| D33 | **Logging:** all code logs through Effect's `Logger`; one layer forwards to `electron-log`, which keeps the file location, format and rotation. | Replace `electron-log` now or later |
| D34 | **Observability:** failures are logged with their full `Cause`. An environment variable enables an OTLP exporter (`@effect/opentelemetry`) for local debugging. | No exporter; always export |
| D35 | **Safety net:** characterization tests pin current behavior before a unit is ported. Packages get unit-level pinning tests (`db`, `subscriptions-core`, `transcription`). Desktop is pinned black-box: a harness launches the packaged app offline on a fixture profile, calls the MCP tools and the automation API, and compares the answers with recorded goldens. | Standard gate only; unit-level pinning for desktop |

## 4. Assumptions

Defaults chosen without a question. Each holds unless the owner vetoes it.

- **A1, data:** the existing SQLite database, settings JSON and automation descriptors open
  unchanged. Any schema change ships a migration. Agents work on a copy, never the live profile.
- **A2, parity:** apart from the phase 0 removals, port phases change no behavior. A bug found while
  porting is reported, then fixed in its own commit.
- **A3, fixtures:** the repo is public, so the fixture profile and the goldens are synthetic, built
  by a script. Nothing from the owner's real profile is committed.
- **A4, goldens early:** the golden harness is built in phase 1b and its baseline is recorded on the
  pre-port build, so every later gate runs it, not only the desktop phases.
- **A5, running app:** an agent never stops the owner's running VidBee. For dogfooding it backs up
  the profile, installs the build and asks the owner to restart.
- **A6, facade errors:** a legacy facade rejects with the same error classes and messages the old
  code threw, so unported callers behave the same.
- **A7, kept libraries:** i18next, sherpa-onnx, playwright-core, better-auth, streamdown and yt-dlp
  stay, each behind a driver service where main-process code touches it.
- **A8, bundled code:** desktop, `ui` and extension override the base config to `module: esnext` /
  `moduleResolution: bundler` with path aliases, as beep-effect's Vite apps do.
- **A9, out of scope:** vendored Python (yt-dlp, gallery-dl extractors).

## 5. The standard

**Toolchain** (installed in phase 1a, versions from beep-effect's catalog):

- `tsconfig.base.json` copied from beep-effect unchanged, except `namespaceImportPackages` lists
  `@vidbee/*` in place of `@beep/*`. Same compiler options, same 187 severities, empty `overrides`.
- `@effect/tsgo` with `effect-tsgo patch --tsrs` in `prepare`. `tsrs` is the check command, as in
  beep-effect's per-package `beep:check` script. Tests typecheck under the same rules.
- `@effect/vitest` on Vitest 5, Biome with beep-effect's config, lefthook, Turbo.

**Definition of done for a ported unit** (D20):

1. Its tsconfig extends `tsconfig.base.json` and `tsrs` reports zero diagnostics, tests included.
2. No `@effect-diagnostics` comments, no tsgo `overrides`, no lowered severities. An unavoidable
   exception is one entry in `standards/effect-allowlist.jsonc` with a reason, approved by the owner.
3. `Effect.promise` and `Effect.tryPromise` appear only in driver files that wrap a third-party
   library. `Effect.run*` and `ManagedRuntime` appear only in entry points and legacy facades.
4. Everything crossing a boundary is decoded with `Schema`: IPC payloads, HTTP bodies, files,
   database rows, yt-dlp JSON, settings. No zod, no TypeBox outside the pi driver.
5. Errors are schema-backed tagged errors. Services are `Context.Service` classes with Layers.
6. The owner's standing rules: `HashMap`/`HashSet` and their mutable forms, never `Map`/`Set`;
   `Effect.fn` or `Effect.fnUntraced` for functions returning generators; `effect/http` and
   `effect/http-api`, never `node:http`; `LiteralKit` from `@vidbee/schema` for string-literal
   unions; schema style from `beep-effect/standards/schema-first-development-prompt.md` and the
   `crispen` skill.
7. Every Effect API is validated against the installed package (`node_modules/effect/package.json`
   `exports`) or `beep-effect/.repos/effect` before it is written. Training data predates the v4
   module move; `beep-effect/.patterns/effect-module-paths.md` has the mapping.

Modules this plan relies on, confirmed present in effect 4.1.4: `effect/rpc` (`RpcGroup`,
`RpcServer`, `RpcClient`), `effect/http-api`, `effect/ai` (`McpServer`, `LanguageModel`, `Tool`,
`Toolkit`), `effect/process` (`ChildProcess`), `effect/reactivity` (`Atom`, `AtomRpc`,
`AtomHttpApi`), `effect/cli`, `effect/sql`. The React binding is `@effect/atom-react`.

## 6. Ratchet mechanics and the phase gate

- **Status:** a package is ported when its tsconfig extends `tsconfig.base.json`. The root script
  `bun run port:check` (written in phase 1a) lists ported and unported packages and enforces
  checklist items 2 and 3 with greps.
- **Facade (D9):** a ported package exports its Effect API from its main entry and the old Promise
  API from a `legacy` entry. Unported consumers switch their import to `legacy` in the same phase.
- **Phase gate**, all required before merge:
  1. `tsrs` clean for the unit and its tests; `bun run port:check` passes.
  2. Existing tests ported to `@effect/vitest` and passing; the unit's pinning tests passing.
  3. Whole-repo `bun run check`, tests and `bun run deps:check` pass, locally and in CI.
  4. Dependencies the unit no longer needs are removed from its manifest, and from the catalog when
     no other package uses them.
  5. A packaged build launches offline on the fixture profile with isolated automation descriptors
     (`VIDBEE_AUTOMATION_DESCRIPTOR`, `VIDBEE_MCP_CONFIG`), and the golden suite passes (from
     phase 1b on).

## 7. How every phase runs

1. The owner starts a fresh orchestrator session in the VidBee repo and pastes the phase's prompt.
2. The orchestrator works in `~/YeeBois/workstation-apps/worktrees/VidBee/<lane>` on a branch named
   `port/<lane>`. It keeps design, review and gate-running for itself and delegates implementation
   volume to Codex or Junie lanes that write to that worktree.
3. If the phase has a design gate, it follows D14 and waits.
4. It opens a pull request on `kriegcloud/VidBee` whose description is the phase report, and commits
   the same report as `docs/effect-port/reports/<phase>.md`.
5. When the gate and CI are green it merges, removes the worktree and branch, and runs
   `git worktree prune`.
6. Dogfooding (D16, A5): it backs up the owner's profile, installs the merged build to the
   launcher, keeps the previous build, and asks the owner to restart the app.
7. It updates the status column in section 8 of `PLAN.md`.

## 8. Phases

| Phase | Unit | Size | Design gate | Pinning | Can run alongside | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 0a | Baseline: fork and removals | | | | | merged ([report](reports/0a.md)) |
| 0b | Baseline: dependency updates | | | | | merged ([report](reports/0b.md)) |
| 1a | Toolchain and pilot (`logger`) | 95 | | | 1b | merged ([report](reports/1a.md)) |
| 1b | Fixture profile and golden harness | | | | 1a | merged ([report](reports/1b.md)) |
| 2 | `i18n` | 351 | | | 3 | merged ([report](reports/2.md)) |
| 3 | `db` | 638 | yes | unit | 2 | not started |
| 4 | `task-queue` | 6.9k | yes | | | not started |
| 5 | `downloader-core` | 14.6k | yes | | | not started |
| 6a | `subscriptions-core` | 4.1k | yes | unit | 6b, 6c | not started |
| 6b | `browser-capture` | 4.8k | | | 6a, 6c | not started |
| 6c | `transcription` | 13.2k | yes | unit | 6a, 6b | not started |
| 7 | `ui` | 28.2k | | | 8 | not started |
| 8 | `cli`, `extension` | 3.2k, 1k | | | 7 | not started |
| 9.0 | Desktop foundation | | yes | goldens | | not started |
| 9.1 | Desktop: downloads | | | goldens | | not started |
| 9.2 | Desktop: subscriptions | | | goldens | 9.3 | not started |
| 9.3 | Desktop: transcription | | | goldens | 9.2 | not started |
| 9.4 | Desktop: AI chat | | | goldens | | not started |
| 9.5 | Desktop: MCP, local API, account | | | goldens | | not started |
| 10 | Closeout | | | | | not started |
| 11 | Architecture session | | | | | separate |

## 9. Kickoff prompts

Each prompt starts a fresh session with no context. Fill the `{{...}}` fields from section 8.

### Phase 0a: fork and removals

```text
You are starting the port of VidBee (this repo: an Electron media downloader, Bun workspace) to
Effect v4. The plan with every locked decision is at
"~/YeeBois/knowledge/VidBee effect-native port.md". Read all of it before anything else; sections
3, 4 and 7 govern how you work. This phase turns the repo into a personal hard fork and removes
what will not be ported. It changes no other behavior.

Work in a worktree at ~/YeeBois/workstation-apps/worktrees/VidBee/port-baseline, one commit per
numbered step.

1. Merge origin/main (nexmoe/VidBee) one last time. Upstream uses pnpm; resolve manifest conflicts
   by moving upstream's version bumps into the root catalog, then run bun install and
   bun run deps:check. The husky pre-commit hook breaks merge commits, so commit the merge with
   --no-verify after running the checks by hand.
2. Copy the plan into the repo as docs/effect-port/PLAN.md and replace the knowledge file's body
   with a pointer to it. The repo is public: write home paths with ~ and call the owner "the owner".
3. Delete apps/web, apps/api and apps/docs with everything that exists only for them: Dockerfiles,
   root scripts, catalog entries, docs. Before deleting an oRPC contract file in packages/, check
   whether cli, extension or desktop still imports it.
4. Remove the auto-updater (electron-updater, the update service, its settings and UI, the publish
   block in electron-builder.yml) and the telemetry (GA4 analytics, GlitchTip/Sentry, the sourcemap
   upload). The account service that talks to api.vidbee.org stays.
5. Delete the release, cli-publish, extension-publish, store-submit, docker-publish and translator
   workflows. Rewrite ci.yml and build.yml to run on pull requests: lint, typecheck, tests,
   deps:check and a Linux packaged build.
6. Remove react-hook-form and @hookform/resolvers, which nothing imports.

Done when bun run check, bun run test:audit and bun run deps:check pass, CI is green on the pull
request, and a packaged build launches offline and you have confirmed that no update check or
telemetry request is attempted. Then follow plan section 7 from step 4. In the report, list
everything deleted and anything that referenced a removed feature and had to change.
```

### Phase 0b: dependency updates

```text
You are updating VidBee's dependencies before its port to Effect v4. The plan is
docs/effect-port/PLAN.md in this repo; read sections 3, 4 and 7 first. Phase 0a is merged. The port
will rewrite most files, so it should start from current library APIs, and this is the last cheap
moment to find out which upgrades break something.

Work in a worktree at ~/YeeBois/workstation-apps/worktrees/VidBee/port-deps. Run bun run
deps:update, then fix what breaks. Leave drizzle-orm, drizzle-kit and vitest where they are; later
phases move them. If one upgrade causes more than a contained fix, pin that package back and say so.

Done when bun run check, bun run test:audit and bun run deps:check pass, CI is green, and a packaged
build launches offline. Then follow plan section 7 from step 4. Report every dependency whose major
version changed, and every one you held back with the reason.
```

### Phase 1a: toolchain and pilot

```text
You are installing the Effect v4 toolchain in VidBee and proving it on the smallest package. The
plan is docs/effect-port/PLAN.md in this repo; read sections 3 to 7 first. The reference
implementation is ~/YeeBois/projects/beep-effect: copy its configuration and, where the plan says
so, its source, but never depend on its @beep/* packages, which are private.

The migration is a ratchet. A package is "ported" when its tsconfig extends the new root
tsconfig.base.json; unported packages keep their current tsconfig and must keep building. What you
build here is reused by every later phase, so it has to be correct and documented.

Work in a worktree at ~/YeeBois/workstation-apps/worktrees/VidBee/port-toolchain.

1. Add to the root catalog, at exactly beep-effect's pinned versions: effect, the @effect/* packages
   VidBee will need, @effect/tsgo, tsrs, vitest 5, @effect/vitest. Mirror beep-effect's prepare
   script (effect-tsgo patch --tsrs).
2. Copy beep-effect's tsconfig.base.json. Change only namespaceImportPackages (@vidbee/* in place of
   @beep/*). Keep every compiler option and all 187 severities.
3. Replace ultracite with beep-effect's biome.jsonc minus its beep-only plugins, scoped to ported
   packages. Replace husky with lefthook. Add Turbo for per-package check, test and build tasks.
4. Create packages/schema (@vidbee/schema) by copying LiteralKit and only the helpers it needs from
   beep-effect's source, with @beep imports rewritten, its tests ported, and a note of the
   beep-effect commit it was copied from.
5. Write bun run port:check as described in plan section 6.
6. Port packages/logger to the standard in plan section 5, including a legacy facade for its
   unported consumers, with tests run by bunx --bun vitest run.
7. Prove the toolchain: tsrs reports an Effect diagnostic for a deliberate violation and passes once
   it is removed; an @effect/vitest test runs under Bun; the packaged app launches. Add the new
   checks to ci.yml.
8. Write docs/effect-port/PORT-GUIDE.md: how to port a package step by step, with the logger port as
   the worked example. Rewrite CONTRIBUTING.md, AGENTS.md and .claude/CLAUDE.md for the new
   toolchain.

Validate every Effect API against node_modules/effect or beep-effect/.repos/effect before writing
it; training data predates the v4 module layout. Then follow plan section 7 from step 4. Report the
exact commands that make up the gate, and anything in beep-effect's setup that did not transfer.
```

### Phase 1b: fixture profile and golden harness

```text
You are building the regression net for VidBee's port to Effect v4. The plan is
docs/effect-port/PLAN.md in this repo; read sections 3 to 7 first. The desktop app's main process
is 46k lines with 12 tests and is about to be rewritten. It exposes about 50 MCP tools and a
loopback automation API whose behavior must not change, so the port is checked from the outside:
launch the packaged app on a known profile, call those surfaces, and compare the answers with
recorded goldens. The tests never touch internals, so they survive the rewrite unchanged.

Work in a worktree at ~/YeeBois/workstation-apps/worktrees/VidBee/port-goldens.

1. Write a script that builds a synthetic fixture profile: a database with tasks in every state,
   history, subscriptions with items, transcripts, AI threads and settings. The repo is public, so
   nothing may come from the owner's real profile.
2. Write the harness. It launches the packaged app in an offline network namespace on a copy of the
   fixture, with VIDBEE_AUTOMATION_DESCRIPTOR and VIDBEE_MCP_CONFIG pointed at scratch files so the
   owner's running app is not disturbed, then calls every read tool and a chosen set of mutations.
   The project memory note on the offline screenshot harness has the launch recipe.
3. Record goldens on the current, pre-port build. Normalize what legitimately varies (timestamps,
   generated ids, ports, absolute paths) and nothing else.
4. Prove it catches regressions: change one behavior on purpose, show the suite fails, revert.
5. Add bun run test:golden and document in PORT-GUIDE.md how a phase runs it and how to update a
   golden when a change is intended.

Then follow plan section 7 from step 4. Report which MCP tools and automation endpoints are covered,
which are not and why (for example, they need the network), and how long a run takes.
```

### Phases 2 to 8: one package

```text
You are porting one VidBee package to Effect v4: {{package}} ({{size}}), phase {{phase}}. The plan
is docs/effect-port/PLAN.md in this repo; read sections 3 to 7 and docs/effect-port/PORT-GUIDE.md
before anything else. The packages this one depends on are already Effect-native; its consumers are
not.

The goal is an Effect-native package with the same behavior, not Promise code wrapped in Effect.
Design in this order: schemas for every piece of data, then Context.Service contracts, then
implementations. Work in a worktree at ~/YeeBois/workstation-apps/worktrees/VidBee/port-{{package}}.

{{#if unit_pinning}}
First, before changing any source, write tests that pin the package's current behavior and get them
passing against the old code. They are the proof that the port changed nothing.
{{/if}}
{{#if design_gate}}
Then draft the schemas and service contracts (types and signatures, no implementations) with the
reasoning for each boundary, and follow the design gate in plan decision D14. Do not implement
until the owner approves.
{{/if}}

Port the source and the tests, export a legacy Promise facade with the old signatures and error
shapes, switch unported consumers to it, and remove the dependencies the package no longer needs.
{{phase_notes}}

Done when the phase gate in plan section 6 passes in full. Validate every Effect API against the
installed package before writing it. Then follow plan section 7 from step 4. Report the gate
output, the facade's exports and who uses them, any allowlist entry you need with its reason, and
any behavior that looks like a bug: describe it, do not fix it in this phase.
```

Phase notes to paste into `{{phase_notes}}`:

- **3, `db`:** run the `node:sqlite` spike first and report before porting: `@effect/sql-sqlite-node`
  with `drizzle-orm/effect-sqlite-node` inside a packaged Electron build, under Node 22 and under
  Bun, against a copy of the fixture database and a copy of the owner's real one (WAL mode,
  transactions, the existing migrations in `apps/desktop/resources/drizzle`). If it fails, keep
  `better-sqlite3` behind a hand-written service. Move Drizzle to 1.0-rc in this phase.
- **5, `downloader-core`:** process spawning moves to `effect/process`. Vendored Python is untouched.
- **6c, `transcription`:** sherpa-onnx is a native module; wrap it in one driver service.
- **7, `ui`:** for each primitive that also exists in beep-effect's
  `packages/foundation/ui-system/ui/src/components`, replace VidBee's with a copy of beep-effect's,
  rewrite its `@beep` imports, restyle it to VidBee's theme tokens so the app looks the same, and
  adapt every call site, including those in the unported desktop renderer. Port VidBee-only
  components in place. Radix must be gone when the phase ends. Compare screenshots of every screen
  before and after.
- **8, `cli`:** argument parsing moves to `effect/cli`. The CLI runs on Node; its command surface
  must not change.

### Phase 9.0: desktop foundation

```text
You are laying the Effect foundation of VidBee's Electron app (apps/desktop), phase 9.0. The plan
is docs/effect-port/PLAN.md in this repo; read sections 3 to 7 and docs/effect-port/PORT-GUIDE.md
first. Every workspace package is already Effect-native. The desktop app is not: its main process
exposes services to the renderer through electron-ipc-decorator, which the target compiler options
forbid, and the renderer keeps state in Jotai.

Desktop is ported one capability at a time after this phase, so this phase builds what every
capability needs and proves that old and new IPC can run side by side. Work in a worktree at
~/YeeBois/workstation-apps/worktrees/VidBee/port-desktop-foundation.

1. Design, then follow the design gate in plan decision D14: the RpcGroup conventions (naming,
   error schemas, streaming for progress events), the Electron protocol for effect/rpc over ipcMain
   and ipcRenderer, how the main-process Layer and the renderer's atom registry are composed, the
   Logger layer that forwards to electron-log, and the OTLP exporter switch (D33, D34).
2. After approval: implement the protocol, port src/shared, and port the settings, app and window
   services with their renderer atoms (@effect/atom-react) as the first consumers. Decorator
   services that are not yet ported keep working unchanged.

Done when the phase gate in plan section 6 passes and the Settings and About screens run entirely
on the new path. Then follow plan section 7 from step 4. Report the protocol's design, how a
capability phase adds an RpcGroup (add this to PORT-GUIDE.md), and what still depends on decorators.
```

### Phases 9.1 to 9.5: one desktop capability

```text
You are porting one capability of VidBee's Electron app to Effect v4: {{capability}}, phase
{{phase}}. The plan is docs/effect-port/PLAN.md in this repo; read sections 3 to 7,
docs/effect-port/PORT-GUIDE.md and the phase 9.0 report first. The RPC protocol and runtime
composition exist; follow them.

Scope: {{services_and_screens}}. Move the capability end to end so it can be exercised when you
finish: main services, their RpcGroup, the renderer atoms that replace the Jotai atoms, and the
screens that use them. Other capabilities stay on decorator IPC and must keep working. Work in a
worktree at ~/YeeBois/workstation-apps/worktrees/VidBee/port-desktop-{{capability}}.

Before changing source, check that the golden suite covers this capability's MCP tools and
automation endpoints, and add goldens for anything missing, recorded on the current build. Then
port. {{phase_notes}}

Done when the phase gate in plan section 6 passes and you have exercised the capability in a
packaged offline launch. Then follow plan section 7 from step 4. Report the gate output, what you
exercised and what you saw, the Jotai atoms and decorator services removed, and anything left on
the old path with the reason.
```

Scopes and notes:

- **9.1, downloads:** download, history, thumbnail, player, file-system and browser-cookies
  services; the Home and ShareCapture screens.
- **9.2, subscriptions:** subscription service; the Subscriptions screen.
- **9.3, transcription:** transcript service; the Transcript screen.
- **9.4, AI chat:** ai service, the agent modules, the Chat screen. pi stays (D28): wrap it in one
  driver service; TypeBox is allowed only inside it.
- **9.5, MCP, local API, account:** the MCP server moves to `effect/ai` `McpServer`; the loopback
  and extension endpoints move to `effect/http-api`, and the extension switches to the generated
  `HttpApiClient`; the account service is ported. The MCP tools and the extension's requests must
  behave identically.

### Phase 10: closeout

```text
You are closing out VidBee's port to Effect v4, phase 10. The plan is docs/effect-port/PLAN.md in
this repo; read sections 3 to 7 first. Every package and desktop capability has been ported; what
remains is the scaffolding of the migration.

Delete every legacy facade and prove nothing imports one. Remove electron-ipc-decorator, the
decorator compiler flags, Jotai, zod and every other dependency the port replaced; confirm with
bun run deps:check and a search of the lockfile. Make every tsconfig extend tsconfig.base.json and
turn port:check into a permanent check with no unported list.

Done when the full gate passes for the whole repo, a packaged build launches and every capability
has been exercised once. Then follow plan section 7 from step 4. Report the dependencies removed,
every entry left in standards/effect-allowlist.jsonc for the owner's review, and the open questions
you would bring to the architecture session.
```

## Amendments (2026-11-17)

The owner changed how the remaining phases run. Phases 0b to 10 are executed in one orchestrator
run without waiting for the owner. Where a row below contradicts sections 3 to 9, the row wins.

| Plan | Changed to |
| --- | --- |
| D12, D17, section 7 step 1: a fresh orchestrator session per phase | One orchestrator session runs every phase in order. Each phase's kickoff prompt in section 9 is still its instruction set. |
| D14: the design gate waits for the owner | The agent drafts the schemas and service contracts, commits them under `docs/effect-port/design/`, has them reviewed by one independent reviewer session that did not write them, resolves its findings, records the review in the design file, and continues. It does not wait. |
| D19: copying a further beep-effect helper needs the owner's approval | The helper is copied if the port needs it, with the beep-effect commit it came from, and listed in `OWNER-REVIEW.md`. |
| Section 5 item 2: an allowlist entry is approved by the owner | The entry is added with its reason only after trying and failing to meet the rule, and listed in `OWNER-REVIEW.md`. |
| Phase 3 spike: "report before porting" | The spike runs, its result goes into the phase report, the agent applies D30's rule itself and continues. |
| A5, section 7 step 6: ask the owner to restart | The build is installed; the running app keeps its old build until the owner restarts it. Nobody is asked and nothing is restarted. |

Additions:

- `docs/effect-port/OWNER-REVIEW.md` records every choice made in the owner's place under this
  table, every bug found and not fixed (A2), and every dependency held back.
- Phase 0b commits the offline launch scripts under `apps/desktop/scripts/port/`.
- Phase 1b: the harness must be able to check whatever a later phase ports. A later phase that finds
  a tool or endpoint without a golden records one on the build before its change.
- Phase 10 also removes anything the run left behind that the finished port does not need.

## 10. Deferred to the architecture session (phase 11)

- Package layout and organization, and whether VidBee adopts beep-effect's slice topology.
- `@alchemy.run/domain`: which aggregates, which local host, and how existing SQLite state is backfilled.
- Whether pi is replaced by `effect/ai`.
- Documentation standards (JSDoc, docgen).
- Follow-ups set aside during the port: the JavaScript build scripts, and whether the account
  service and its dependence on upstream's cloud stay.

## Appendix: original draft

> I want to port the ~/YeeBois/workstation-apps/VidBee repository to effect-native standards as defined in ~/YeeBois/projects/beep-effect
>
> - @effect/tsgo configuration as defined in tsconfig.base.json
> - tsrs
> - @effect/vitest
> - remove zod -> effect/Schema
> - pnpm -> bun
> - drizzle v1 with effect v4 integration
> - package level dependencies to catalog dependencies just like beep-effect
> - update all dependencies in VidBee to their latest versions
> - frontend state management -> effect/Reactivity with `@effect/react-atom`
> - react-hook-form -> tanstack form
> - radix ui -> base-ui
> - use principles of schema-first-development, crispen, schema-first-development-prompt.md

Changes from the draft: pnpm to Bun and the catalog are already done; the React binding is
`@effect/atom-react`, not `@effect/react-atom`; `react-hook-form` is unused, so it is deleted
instead of migrated (D32).
