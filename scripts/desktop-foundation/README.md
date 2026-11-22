# Desktop foundation pre-port characterization

The first pass recorded unchanged application source at `1437d1f`; the audit
pass starts at `a8760e7`. No desktop application implementation is changed.
Expected documents are observations of old code, not values copied from design
prose. The report at `docs/effect-port/reports/9.0.md` maps each audit finding to
its cases and separates source, headless package and native display proof.

Run with the repository's Node 22.23.4 first on PATH, using a disk-backed TMPDIR
inside the lane:

```sh
bun run test:foundation
```

Root `test` includes this suite: `node:test` through tsx, followed by Bun-backed
`@effect/vitest`. Source tests execute actual source, installed electron-store/Conf
and Jotai, with separate VM/module state and explicitly injected hosts. Only
transpiled text is cached, invalidated by source content. Field and operation
matrices reset their isolated store between cases; constructor cases are fresh.
Owned temporary profiles are removed in finally blocks.

Files and observations:

| File | Purpose |
| --- | --- |
| `source-harness.mjs` | Actual-source loader and installed-store failure seams |
| `observe.mjs`, `settings.expected.json` | Every settings field, raw/read/write state, normalization, repair/failure/portable matrices and conversions |
| `foundation.test.mjs` | Effect/Vitest comparison, path policy and formatter identity |
| `semantics.node.ts`, `detached-fixture.mjs` | Existing process, Promise, settings-host and preload semantics |
| `audit-observe.mjs`, `audit.expected.json`, `audit.node.ts` | Expanded host-level audit oracle and exact ordered comparison |
| `boot-observe.mjs` | Deferred actual entrypoint startup, window lifecycle, nonfatal failures and quit order |
| `renderer-lifecycle.mjs` | Actual component effects, preload wrappers, Show Home, title-bar cleanup, app-info cache and share-dialog platform guards |
| `remaining-observe.mjs` | Actual window-state/kernel modules, eager skill glob/YAML and shared time/order helpers |
| `log-observe.mjs` | Installed configured console/file/IPC transports with fixed clock and output sinks |
| `isolation.mjs`, `safety.node.ts` | Worker admission and negative host-namespace cases |
| `build-inputs.mjs`, `build.expected.json` | Complete read-only pre-port unpacked-build manifest |
| `packaged.mjs`, timezone fixtures | Nine isolated packaged profiles, actual invoke/events/control/reload/capture/quit observations |

Renderer component effects use a controlled hook scheduler and actual component
functions. Other capability dependencies are inert injected slots; this is not a
DOM reconciler test. The package supplies independent DOM/control integration.
Clipboard/native image, native dialogs, logger filesystem and lifecycle hosts are
injected for source proof; no synthetic path is created on the host filesystem.

The packaged command launches only through the existing offline namespace
launcher. It uses a fresh lane-owned HOME, XDG roots, scratch user-data argument,
automation descriptor and MCP config. Portable mode's effective `Data/UserData`
also stays under that run. Cleanup signals the exact launcher owned by this
invocation. It never searches for an application by name.

```sh
TZ=UTC bun run test:foundation:packaged \
  --build apps/desktop/dist/linux-unpacked --scratch "$LANE" \
  --manifest "$LANE/candidate.json" --sha256 "$CANDIDATE_ASAR_SHA256"
```

Scratch must be under a lane containing `BRIEF.md`. The parent records a random
run identity and its host/owned namespace identities. Before any CDP connection
or secondary launch, the worker verifies that identity, canonical run/profile,
current/launcher/app user/net/mount namespace equality and difference from host,
loopback-only network interfaces, app executable, profile argv, descriptors and
archive/executable hashes. It checks the expected packaged renderer URL before
invoking anything. Direct workers without identity, or with identity in the host
namespace, refuse. The safety tests use a fake endpoint and require zero
connections. A child-only preload also forbids fetch/WebSocket access, so a
regression cannot fall through to any host-network CDP port during the negative test. There is no supported host-network worker mode.

Every comparison explicitly selects its candidate manifest using `--manifest`.
Generate it with the read-only `buildInputs(build)` export and keep it in scratch.
The immutable `build.expected.json` is required only for `--record`; comparisons
never re-record behavior to admit a new archive. Every comparison checks that
selected complete build manifest, plus archive and executable
before each primary launch. The secondary process and worker also verify the
archive; the worker verifies the executable. Recordings use this worktree's old
build, not the owner's checkout or installation. Its archive is
`f9d34a07af53e9fbd2574be46a935138f56ffa7faeb70288da1636f154467f7e` and executable is
`ee2102cb45937a2ea67082e0212be8807c1c8615e601f7f5505fc997a488a6cf`.

The parent asserts Node 22.23.4. Launch LANG/LC_ALL and cwd are explicit and
VIDBEE_LANGUAGE is unset. Use `TZ=UTC` or `TZ=Asia/Tokyo`: the fixtures remain
separate because the old fresh-install language differs. Source locale inputs
are independently injected, including environment and timezone.

The nine profiles cover fresh, controlled quit, second-instance rejection,
background, returning/stale marker, restart persistence, current marker, portable
relocation/malformed fields and ordinary malformed fields. Raw constructor,
unrelated single and unrelated batch storage are frozen before subsequent probes
can overwrite evidence. Reset has an observer mounted throughout. Settings/About
record text and a named settings switch is clicked, then checked after document
reload. The quit scenario schedules the real old `app.quit` and observes its owned
process exit; native message-box appearance remains a separate display exercise.

Only exact per-run HOME/portable roots and the exact prior HOME on restart are
normalized. Raw observations remain in each run directory before normalization.
The source fixture substitutes only its exact mkdtemp root in Conf errors. Known
BigInt/cyclic out-of-type engine failures require failure rather than the same
engine message/class, per PORT-GUIDE; all successful values and all other error,
state, argument and ordering contracts are compared exactly.

Recording is explicit and allowed only against unchanged old source/build:

```sh
node --import tsx scripts/desktop-foundation/observe.mjs --record
node --import tsx scripts/desktop-foundation/audit-observe.mjs --record
```

These source recorders write JSON to stdout. `packaged.mjs --record` writes the
selected timezone fixture only after all profiles finish successfully. Preserve
previous receipts and inspect each change. Re-recording cannot authorize a port
parity failure. No existing public golden or normalizer is changed by this suite.
New RPC validation, typed presentation, Effect Atom ownership, Cause forwarding
and transport capacity/overflow remain implementation work for part 2.


Third-pass additions include actual registry/service import ordering, real auth
module import/initialization effects, exact Promise-turn clocks through settings
and native-dialog application channels, complete parser operation matrices,
failed-constructor byte preservation and dotted reads. Window tests vary seeded
state, bounds and lifecycle flags and hold the real quit preparation dependencies.
Shared schema fixtures retain parse/safeParse values, issues and errors, including
missing versus explicitly undefined properties. Calendar hosts fix UTC and en-US.

The package now has fifteen profiles (thirteen successful boots and two invalid
JSON failures). The fresh profile additionally exercises real Show Home IPC across
absence/reload, a controlled snapshot/event race, and Settings control families
across General, Metadata and Advanced. Pickers use controlled owned-main handlers
for selection/cancellation/failure. Each changed control records outgoing writes,
visible values and reload persistence. Source coverage separately invokes 28
Settings handlers per picker outcome and freezes nondefault metadata projections.

The test launcher adds a loopback main inspector inside its owned namespace.
`inspector.mjs` repeats `verifyWorker` before opening any socket and checks the
inspected PID against the verified application. Its callers only change that
scratch instance's handlers and windows. There is no host-namespace inspector
mode. Native message boxes, clipboard readback, and physical window-manager
integration still need an owned headed display; no separate pre-change manual
receipts are supplied by this suite.

Packaged OS labels must exactly equal `Linux ` plus the current `os.release()` before their release
suffix becomes `<host-release>` in the behavioral fixture. The exact host value
is retained in each run's `host-environment.json`. Source OS transformation
vectors remain exact; UTC and Tokyo behavioral fixtures stay separate.

Fourth-pass containment applies before every foundation packaged launch:
`containment.mjs` runs the launcher beneath Bubblewrap with a recursively
read-only root, only the fresh suite work directory writable, and private
`/dev`, `/proc` and `/tmp` runtime mounts. The launch setup remounts the resolver
files read-only. Worker admission inspects mount flags before any connection.
The negative test requires `EROFS` for direct outside writes and a symlink escape,
and a successful owned write. A fixture path outside its profile/portable root
uses the owned `<home>/external-media` directory, whose preservation is asserted.
Bubblewrap is a required host executable; there is no uncontained fallback.

The real shared import graph now runs capability bodies, including ai-store's
constructor, prompt setup, native watcher registration and listener setup, in the
same loader through rejected-lock exit. Its ordered trace includes loaded files
and exact ESM provider SDK subpaths the synchronous source VM cannot require.
The native watcher is injected and SQLite uses the owned disposable profile.
The pi-durable/env/node SDK module executes. Nine remaining SDK subpaths
reject the pinned Node + tsx synchronous import route with
ERR_PACKAGE_PATH_NOT_EXPORTED, directly or through an import-only dependency.
Every exact failed dependency is frozen in the trace and separately verified by
a contained offline probe. Plain Node loads more subpaths; that is not the
source suite's tsx execution route.
Settings write clocks cover both actual registrations through the actual settings
host, successful writes and synchronous failure with caller continuation, ordered
side effects, broadcasts, console arguments and error identity. The calendar case
uses independent literal timestamps and directly freezes the midnight result.

Packaged Show Home uses the React commit host to hold the actual AppLayout effect
setup, unmounts/remounts the real React subtree for same-document absence, and holds the
actual router's navigation completion. The consumer callback is never replaced.
The independent delivery counter cannot navigate. Before-mount, slow navigation,
absence/resubscription and pending old-navigation/reload are separate observations.
The React root renderer is obtained from the actual consumer module through an
owned debugger pause; its public render method performs a genuine subtree
unmount/remount. DOM absence and return are checked. The lifecycle control does
not establish physical window-manager behavior. The new-document case reloads
the complete document. Proxy observations require the actual
input value to equal the nondefault selection after save and reload.

Final repeat receipts must bind all files in this directory before and after
every run. The third-pass twenty-run source receipt predates `scratch.mjs`; its
later five stress passes are separate evidence. Temporary mutation copies prove
that the repaired assertions reject the audit's regressions; no tracked source
or immutable recording build is mutated.
