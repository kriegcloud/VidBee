# Design: `@vidbee/task-queue` (phase 4)

Status: reviewed, findings resolved (section 11). Design gate per plan decision D14 as amended on
2026-11-17: drafted by the orchestrator, reviewed by an independent session, then implemented.

Inputs: a source inventory of the package (6,946 lines; surface, data shapes, state machine, side
effects, error behavior, concurrency, tests, hazards), [the db design](db.md), and the strict rule
set in `tsconfig.base.json` (among others `asyncFunction`, `globalTimers`, `globalDate`,
`globalJson`, `globalRandom`, `cryptoRandomUUID`, `nodeBuiltinImport`, all `error`, with no
suppression mechanism the port may use).

## 1. What the package is, and what makes its port risky

The host-neutral task kernel: task state machine, priority scheduler with global, per-group and
download caps, per-source admission, retry timing, progress, watchdog, process recovery,
persistence coordination and events. About sixty files in the desktop app, the CLI and four
packages import it; none of those is ported yet. The orchestrating class is `TaskQueueAPI`.

Four properties decide the design:

1. **Callers rely on synchronous behavior.** `get`, `list`, `stats`, `findDuplicateDownload`,
   `subscribe` and `on` return synchronously, and `findDuplicateDownload` probes the file system
   synchronously. Events are delivered synchronously, typed listeners before wildcard ones;
   listeners re-read queue state inside the callback. The in-memory store is updated before
   persistence is awaited.
2. **Hosts own the edges and rely on the defaults.** Executors are callback objects implemented in
   unported packages and may emit events, including `finish`, synchronously inside `run`.
   The persistence adapter, the admission object, clock, timer functions, random source, file
   probe and kill function are constructor options. The desktop host passes almost none of them,
   so the defaults (`existsSync`, an unref'd idle timer, `Math.random`, `randomUUID`) are live
   behavior; the tests inject fakes for all of them.
3. **Its timing is promise timing.** Every `await` in the kernel, including awaits on values that
   are already available, is a point where another caller can interleave, and the 216 audit tests
   encode races that were fixed at exactly those points.
4. **Nothing validates today.** Only `ListInputSchema` is ever parsed; persisted JSON is read with
   `JSON.parse` and a cast.

## 2. Shape of the port: a strict kernel and an unported compatibility package

The rule set and the facade's obligations conflict in specific places: a synchronous file probe
needs `node:fs`; an unref'd timer needs `setTimeout`; `readPidStartTime` is a synchronous function
over `/proc`, `ps` and `getconf`; the retained zod schemas are zod; `TERMINAL_STATUSES` is a `Set`;
a legacy executor callback must run kernel code synchronously. Inside a ported package each of
those would need a suppression, which the standard forbids.

So this phase produces two packages:

- **`packages/task-queue` (`@vidbee/task-queue`), ported.** Schemas, services, layers, the kernel.
  Effect API only. No `legacy` entry.
- **`packages/task-queue-legacy` (`@vidbee/task-queue-legacy`), unported, temporary.** The old
  public API with its exact signatures and defaults, implemented on the new kernel through one
  `ManagedRuntime` per `TaskQueueAPI` instance (plan D9), plus the synchronous Node helpers and the
  four zod schemas, moved there unchanged. It is ordinary TypeScript: it may use `async`, timers,
  `node:fs` and `Set`. Unported consumers import from it. It shrinks as consumers are ported and
  is deleted in phase 10; until then `port:check` lists it as an unported unit.

This departs from the plan's wording (a `legacy` entry inside the ported package) and is recorded
in `OWNER-REVIEW.md`. It keeps the ported package free of exceptions and the old API free of
signature changes.

A ported unit cannot import an unported workspace package (its sources would be compiled under
the strict options). The dependency therefore points one way: `task-queue-legacy` imports
`task-queue`. Everything the kernel needs from the host arrives as a service.

## 3. Schemas (`@vidbee/task-queue`)

Files: `Task.model.ts` (domain), `TaskQueue.model.ts` (requests, stats), `Events.model.ts`,
`Executor.model.ts`, `Persist.model.ts`, `Classifier.model.ts`, `Projection.model.ts`. `types.ts`
keeps its name and re-exports the types.

**Literal kits**: `TaskKind` (18), `TaskStatus` (8), `ErrorCategory` (13), `TransitionTrigger`
(12), `ProcessJournalOp`, `ProcessKind`, `SubtitleDownloadStatus`, `TranscriptResultKind`,
`TaskOrigin`, `CookieSourceType`, `CollectionReason`, `StdStream`, `LegacyDownloadStatus`,
`LegacySubStatus`. `TaskPriority` is `S.Literals([0, 10, 20])`.

**Structs, not classes.** `Task`, `TaskInput`, `TaskOutput`, `TaskProgress`, `ClassifiedError`
and the rest are `S.Struct` schemas with a type alias of the existing name. Hosts build these
values as object literals, the state machine copies them with spread, the memory adapter clones
them structurally and rollback compares object identity; class instances would break each.

**The public types stay mutable where they are mutable today.** A plain `S.Struct` infers readonly
fields and `S.Array` a readonly array, but the existing interfaces are mutable and unported code
assigns to them (the yt-dlp executor fills `cookieSources`, `subtitleStatus`,
`subtitleAcquisition` and `subtitleLanguages` on an output it already built). Fields use
`S.mutableKey` and arrays `S.mutable(S.Array(...))` wherever the old declaration is not
`readonly`. The old interface declarations are kept as a test fixture, and compile-only checks
require each old type and its new alias to be mutually assignable, including at the mutation
sites and nested arrays.

**Numbers are `S.Finite`** (the rule set rejects `S.Number`); JSON cannot carry a non-finite
number, so this excludes nothing that can be stored.

**Types only, no refinement the code does not enforce.** The unused zod schemas constrain more
than the code does (progress percent 0 to 1, limits of 64 and 500, a non-null cursor). Those
constraints are not carried over. The value checks the code performs today (integer ≥ 1 in the
scheduler setters, title length 1 to 200 in `rename`) stay where they are performed.

**Events** are a tagged union on `type` (`transition`, `progress`, `snapshot-changed`,
`task-removed`, `orphan-killed`, `error-classified`, `log`). **Executor events** are a tagged
union (`spawn`, `progress`, `processing`, `std`, `finish`), replacing the five callbacks.

**Persisted JSON** (`input_json`, `progress_json`, `output_json`, `last_error_json`):

- **Unknown keys must survive a load and save.** A task is rewritten whole on every transition.
  Effect 4.1.4 has no "preserve" parse option (`onExcessProperty` is `"ignore" | "error"`, and
  `"ignore"` strips). The persisted codecs are therefore open at **every** object level:
  `S.StructWithRest(S.Struct(fields), [S.Record(S.String, S.Unknown)])` for the root of each
  column and for each nested object (`collectionSummary`, `subtitleAcquisition`, `transcript`,
  each `cookieSources` element, `agentConversation`). `TaskInput.options` is
  `Record<string, unknown>` and passes through untouched. The domain types stay closed; the
  persisted codecs are a separate set of schemas in `Persist.model.ts`.
- Fields the old loader defaults stay defaulted (missing progress becomes `EMPTY_PROGRESS`;
  `options.startedAt` is backfilled from the earliest attempt).
- What happens to a row that does not decode is a deliberate change, described in section 9.

**Inputs from hosts are not decoded.** `add`, `importCompleted`, `list` and executor events are
typed in-process calls. The process boundaries (HTTP, MCP, IPC) are decoded in front of the queue
by the desktop and CLI code, which keep their zod parsing until their own phases.

## 4. Errors

Schema-backed tagged errors, one per failure the kernel raises: `IllegalTransition` (from, to,
reason), `TaskNotFound`, `ParentTaskUnavailable`, `InvalidTitle`, `InvalidPathPair`, `FileInUse`,
`DependentTasksActive`, `TaskNotTerminal`, `InvalidConcurrency`, `ExecutorUnavailable`,
`DuplicateTaskId`, `StoreMissingTask`, `TaskRowDecodeError`, and `HostFailure` (a failure thrown
or rejected by a host-supplied adapter, executor or callback; it carries the original value).
Persistence failures from `layerSql` are `SqlError`.

Each carries `legacyMessage`, the exact string the old code throws. `task-queue-legacy` maps:
`IllegalTransition` to the legacy `IllegalTransitionError` class (same name, message format and
fields); `HostFailure` to the original thrown value, by identity; `SqlError` to the driver's
original error with `rethrowDriverError`; every other tagged error to `new Error(legacyMessage)`.
Failures that are synchronous throws today stay synchronous throws (the synchronous methods);
failures that are rejections stay rejections.

A host adapter's rejection must reach the kernel's **typed** error channel, because the kernel's
rollback paths recover from it. The bridges use `Effect.tryPromise` / `Effect.try` with
`HostFailure`, never `Effect.promise`, which would turn a rejection into a defect.

## 5. Services (`@vidbee/task-queue`)

All `Context.Service` classes; implementations in `*.layer.ts`; state in `Ref` /
`MutableHashMap` / `MutableHashSet`.

| Service | Contract | Native layer (Effect consumers, tests) | What `task-queue-legacy` provides instead |
| --- | --- | --- | --- |
| `TaskPersistence` | the twelve adapter operations as effects failing with `SqlError \| HostFailure \| TaskRowDecodeError`; `maintenance: Effect<void>`; closing is the layer's finalizer when the layer owns the connection | `layerMemory`; `layerSql` (needs `SqlClient`; today's fifteen statements; `BEGIN IMMEDIATE`; bigint `seq` and counts as numbers) | a bridge over the host's adapter object, one `tryPromise` per call |
| `TaskExecutor` | `run(ctx, sink): Effect<ExecutorHandle, HostFailure>`; `sink.emit(event): Effect<void>`; `ExecutorHandle = { cancel(timeoutMs?): Effect<void, HostFailure>; pause: Effect<void, HostFailure> }` | `router(default, byKind)` | a bridge over the host's callback executor (below) |
| `SourceAdmission` | `tryAcquire(url): Effect<Option<Release>>`; `acquire(url): Effect<Release>`: interrupting the fiber withdraws the waiter and stays an interruption (the legacy class turns an aborted `AbortSignal` into `null`, as today); `subscribe(listener): Effect<Unsubscribe>`; `Release = Effect<void>`, idempotent | `layer` | `layerFromShared(state)`: the legacy class and the queue's runtime hold the same state object |
| `TaskEvents` | `emit(event): Effect<void>`; `subscribe(listener)`, `on(type, listener)`: `Effect<Unsubscribe>`; `stream: Stream<TaskQueueEvent>` | `layer` | the same layer |
| `QueueTimers` | `now: Effect<number>`; `after(ms, effect, { keepAlive }): Effect<Cancel>`; `sleep(ms)` | on `Clock` and fibers forked in the queue's scope | host `clock` / `setTimer` / `clearTimer` when injected, else `Date.now` and `setTimeout`, with `unref` when `keepAlive` is false |
| `QueueRandom` | `next: Effect<number>`; `uuid: Effect<string>` | Effect `Random` for `next`; `SecureRandom.uuidV4` (synchronous, same lowercase hyphenated format) for `uuid` | host `rng` or `Math.random`; `randomUUID` |
| `OutputProbe` | `filePresent(path): Effect<boolean>` | on `FileSystem` (asynchronous) | host `filePresent`, else the old `existsSync` / `statSync` probe: synchronous |
| `ProcessControl` | `kill(pid, signal)`, `isAlive(pid)`, `startTime(pid)`: effects | `ProcessControl.driver.ts` on `effect/process` and `FileSystem` | host `killProcess` and the moved synchronous helpers |
| `LegacyTiming` | `turn(point): Effect<void>` | no-op | one microtask turn (section 7) |
| `TaskStore`, `Scheduler`, `RetryScheduler`, `Watchdog`, `ProcessRegistry` | their classes' operations as effects | one `layer` each | the same layers |
| `TaskQueue` | every `TaskQueueAPI` method as an effect, including `start` and `stop` | `layer`, requiring all of the above | the same layer |

Contracts the table cannot hold:

- **`stop` is an operation, not the end of a scope.** Today `stop()` clears the idle timer, stops
  the retry scheduler, awaits `cancel(0)` on active runs, closes persistence when it owns it and
  resets `started`; the object stays readable, an empty queue can start again, finalizations
  already in flight continue, and armed watchdogs are not disarmed. `TaskQueue.stop` does exactly
  that and nothing more. The runtime the legacy class creates lives as long as the object.
- **The executor sink runs its synchronous part before it returns.** `sink.emit(event)` performs
  everything today's callback does before returning (for `finish`: stop accepting events; for
  `spawn`: update the task and start the journal and PID writes without waiting; for `progress`:
  update the store and emit) and forks the asynchronous continuation into the queue's scope
  itself. The legacy bridge calls a host executor's `run` inside `Effect.try` and turns each
  callback into `runtime.runSync(sink.emit(event))`, so a host that finishes synchronously inside
  `run` leaves no active handle, as the audit test requires. Executors ported in later phases
  call `sink.emit` from their own fibers with the same meaning. Where today's callback starts a
  write without awaiting it, the sink forks that write **with immediate start at the same position
  in the synchronous sequence** (for `spawn`: the journal append starts first, then the task is
  updated, then the PID write starts). The default fork policy would start the child only after
  the sink's own synchronous tail, which reorders the persistence calls.
- **Synchronous methods must be synchronous effects.** `get`, `list`, `stats`, `subscribe`, `on`
  and `findDuplicateDownload` may only use services whose provided implementation is synchronous.
  That holds for the legacy bridges (`OutputProbe` there is the synchronous probe). With the
  native layers `findDuplicateDownload` is asynchronous; Effect consumers do not need it to be
  otherwise. The legacy class builds its runtime so that these methods also work before `start()`.
- **Event delivery** is synchronous, typed listeners then wildcard listeners, each in registration
  order, with the old bus's iteration rule: a listener added during delivery of the same key is
  called in that delivery, a removed one that has not run yet is skipped. A listener's throw is
  logged and delivery continues; a returned promise is ignored. `stream` is fed through a sliding
  `PubSub` (capacity 1,024) so a slow stream consumer can never suspend `emit`.
- **Admission**: a release grants the first waiter synchronously and only then notifies
  subscribers; an interrupted or aborted wait resolves empty; invalid URLs get a no-op release;
  the scheduler's subscription lives as long as the queue (today it is never removed).
- **Process registry**: its `sleep`, grace period, liveness and start-time seams become
  `QueueTimers.sleep` and `ProcessControl`; the legacy bridge maps the old `ProcessRegistryDeps`
  fields onto them.

## 6. Pure modules

`fsm`, `classifier`, `projection`, `complete`, `download-identity`, the predicates and constants
are pure and synchronous. Changes the rule set forces, none of them observable:

- `transition` and `parseRetryAfter` take the current time as an argument (today they default to
  `Date.now()`); `transition` returns a `Result`. The legacy package passes the time and throws.
- `downloadIdentity` builds its key with Schema-based JSON encoding and `HashSet` lookups. The key
  is compared in memory only; tests pin that equal and unequal inputs still compare the same.
- `TRANSCRIBABLE_TASK_KINDS` and `TERMINAL_STATUSES` are `HashSet`s here; the legacy package
  exports real `ReadonlySet`s with the same members.
- The argument hash keeps its format (`sha256:` of the arguments joined by a space, `sha256:none`
  when empty) and stays synchronous: Effect's digest service is asynchronous and would add a
  suspension where there is none, so the kernel uses a small pure SHA-256 with test vectors.

## 7. Timing

`LegacyTiming.turn(point)` marks every place where the old code awaits. The kernel calls it at
each of them, named (`"scheduler.lock.acquire"`, `"scheduler.lock.body"`,
`"admission.pending"`, …). With the legacy layer a turn is one microtask turn, the same
suspension an `await` on an available value produces; with the native layer it is a no-op.

The rule for the implementation is mechanical: **each `await` in the old kernel becomes either a
host-bridge call (one `tryPromise`) or one `turn`, in the same place and order; each synchronous
stretch between awaits stays one synchronous stretch.** The report contains sequencing tables for
admission, dispatch, pause, cancel, finish and slot release (synchronous prefix, every old await,
detached writes, when the public promise settles), derived from the source before porting.

Two properties of the Effect runtime would otherwise add or move suspension points, and the
legacy package neutralizes both:

- **Automatic yielding.** A fiber yields after 2,048 operations, so a long synchronous stretch
  (a scan, a delivery to many listeners) could gain an interleaving point. The legacy runtime
  sets the scheduler's `PreventSchedulerYield` reference.
- **Promise settlement.** `ManagedRuntime.runPromise` settles through an extra `.then`, one turn
  later than the old `async` method. The legacy class does not use it: each Promise method runs
  its effect with `runFork` and settles its own promise from the fiber's exit observer, with the
  error mapping applied there and not in a further `.catch`. The characterization tests place
  settlement markers on representative methods (`hasTask`, `add`, `cancel`, `pause`). If a
  residual difference of a fixed number of turns remains that this mechanism cannot remove, it is
  added to section 9 as a declared change with the measured sequence; it is not papered over by
  loosening the tests.

This is deliberate scaffolding. It is confined to one service, its call sites are greppable, and
it is removed when the last legacy consumer is gone; whether the native kernel should keep any of
those suspension points is a question for the phases that port the consumers.

## 8. The compatibility package (`@vidbee/task-queue-legacy`)

| Export (same entry structure as today) | Implementation |
| --- | --- |
| `TaskQueueAPI` | one `ManagedRuntime` from `TaskQueue.layer` and the bridges, built in the constructor from `opts` with today's defaults; synchronous methods `runSync`, Promise methods `runPromise` with the error mapping of section 4 |
| `MemoryPersistAdapter`, `SqlitePersistAdapter` | the old `PersistAdapter` interface over `TaskPersistence.layerMemory` / `layerSql`; SQLite runs on `runtimeForHandle(db)` from `@vidbee/db/legacy`, applies the same three pragmas in the same `try`, honors `ownsConnection`, keeps `maintenance()` and `close()`; methods do their work synchronously and return settled promises, as today |
| `ExecutorRouter`, `Executor*` callback types, `IllegalTransitionError`, `SourceAdmission` | thin classes over the kernel's pure functions and services |
| `./process`: `readPidStartTime`, `setReadPidStartTimeImpl`, `isPidAlive`, `killProcessTree`, `lowerChildPriority`, `backgroundChildSpawnOptions`, `FFMPEG_ENCODE_THREADS` | the existing files, moved unchanged |
| `./schemas`: `TaskKindSchema`, `TaskStatusSchema`, `ListInputSchema`, `DownloadCookieSourceSchema` | the existing zod schemas, moved; their literal lists come from the ported literal kits. The other fourteen zod schemas, which nothing uses, are deleted |
| types, constants, predicates, `classify`, `virtualError`, `sanitizeOutput`, `projectTaskToLegacy`, `downloadIdentity`, `isOutputComplete` | re-exports of the ported package where the signature is unchanged; wrappers where the ported form takes the time or returns a `Result` |

Consumer source changes only its import specifier, from `@vidbee/task-queue…` to
`@vidbee/task-queue-legacy…`. The wiring around it changes too:

- Manifests: the dependency key in desktop, CLI, `downloader-core`, `transcription`,
  `browser-capture` and `subscriptions-core`; the new package's own dependencies and complete
  subpath exports (`.`, `./types`, `./schemas`, `./process`, `./source-admission`, …).
- Desktop bundling: `bundledWorkspacePackages` in `apps/desktop/electron.vite.config.ts` lists
  the packages that are bundled instead of externalized; both packages must be on it, and the
  packaged main bundle is checked for an unresolved `@vidbee/task-queue*` import.
- Tests: root `test:audit` globs `packages/task-queue/test/*.test.ts` for `tsx --test`; the
  compatibility suites move to `packages/task-queue-legacy/test` and the glob follows; the
  kernel's vitest suites run through its package script and the root Turbo filters.
- Lint and checks: the kernel joins `biome.jsonc` and the root `check` / `test` filters. The
  compatibility package is typechecked by its own `tsc --noEmit` script, added to the root
  `check`. (The old package was not covered by the legacy Biome run, which lints from
  `apps/desktop`; the compatibility package is not either.)
- Relative imports inside both packages use `.js` specifiers, as the port guide requires. `apps/desktop/test/transcription-lifecycle.test.ts`
imports the package's source by relative path and switches to the package entry. `./types` and
`./schemas` stay free of `node:` imports because the renderer loads them.

Exports nothing outside the package imports (`Scheduler`, `RetryScheduler`, `Watchdog`,
`TaskStore`, `EventBus`, `ProcessRegistry`, `LEGAL_TRANSITIONS`, …) get no legacy form.

Logging: `logCaughtError(event, error)` becomes `Effect.logError` with the full cause (D34); the
legacy runtime includes `@vidbee/logger`'s node layer. The line's shape changes from
`{ event, error, stack }` to the layer's form. Log format is not pinned behavior.

## 9. Deliberate changes (each recorded in `OWNER-REVIEW.md`)

The port changes nothing else. These three are consequences of the plan's own requirements:

1. **A persisted task row that does not match its schema is skipped and logged**, with its id and
   the schema issue, and the queue starts without it. Today such a row is loaded with wrong types
   (or, for some shapes, makes `start()` throw during the timestamp backfill, after which the
   desktop host falls back to an in-memory queue). The plan requires database rows to be decoded;
   skipping is the choice that keeps the rest of the queue working. Characterization tests record
   what the old loader does with well-formed wrong-shaped values, missing progress, and backfill
   failures, so the difference is documented exactly. Before the phase merges, every task row of
   the golden fixture and of a copy of the owner's database must decode.
2. **A syntactically invalid JSON column still makes `start()` reject, but with a different
   error object.** Schema's JSON decoding replaces the engine's `SyntaxError`; `globalJson`
   forbids calling `JSON.parse` to keep it. The legacy class rejects with a `SyntaxError` whose
   message names the task and column. (The engine's own message already differs between Node and
   Bun.)
3. **Log line shape**, as in section 8.

4. **Under `better-sqlite3`'s safe-integer mode, every integer column is converted to a number.**
   The old adapter converted only the journal sequence and the attempt count and let the other
   integer fields through as `bigint`, against their declared types. No host enables that mode
   (it exists in a characterization test), so nothing changes in the app.

The characterization tests written against the old kernel pin the old behavior of items 1, 2
and 4 in twenty assertions. Those twenty are rewritten to the behavior declared here, each with
the old expectation kept next to it as a comment and listed in the phase report; every other
characterization assertion passes unchanged.

A further one was possible and was decided by measurement: a fixed extra number of
microtask turns before a public promise settles (section 7). The implementation reproduces all twelve
characterized sequences exactly, so none is declared.

## 10. Verification the implementation owes

- **Characterization first, against the old code**, as `node:test` suites that later run
  unchanged against `task-queue-legacy`: the SQLite adapter on a real driver (every statement,
  immediate transactions, descendant deletion, malformed and wrong-shaped JSON, bigint); the
  state-machine edge and guard matrix; every classifier rule with redaction and `Retry-After`;
  projection formatting; `start`, `stop`, empty restart, reads and subscriptions after `stop`,
  repeated `stop`, a finish arriving during and after `stop`; rollback per operation (transition:
  identity-guarded; `add` and `importCompleted`: unconditional removal, including after another
  operation replaced the stored object); listener add and remove during delivery; the admission
  handoff order; the sequencing tables of section 7 with immediate reads and microtask markers;
  an unknown-key round trip (decode, transition, encode, reload) with unknown fields in input,
  progress, output, error and each nested object.
- The seven existing `node:test` suites stay `node:test`, move with the legacy package where they
  exercise the public API, and pass with assertions unchanged. The suites that test internal
  classes directly (`timers`, `store`, `process-recovery`) are ported to `@effect/vitest` against
  the services with the same assertions: a recording `QueueTimers` layer keeps the handle-count,
  rearm-delay and handle-`0` assertions; `TestClock` tests are added, not substituted.
- `TaskPersistence.layerSql` against both SQL clients (db design, rule 7).
- Every task row of the golden fixture and of a copy of the owner's database decodes.
- Process exit: each CLI command that starts a local queue exits by itself with the same code on
  a scratch database, before and after.
- A packaged build passes the golden suite with zero golden changes; an offline launch exercises
  a local-file import, a conversion task, pause, resume, cancel and retry by hand.

## 11. Review

Reviewer: an independent session on the review-panel tier (GPT-6 Astra, highest effort), read-only,
2026-11-18. It read the plan, the port guide, the rule set, the draft, the inventory, the db
design, the package and its consumers and tests, and the installed Effect 4.1.4 sources, and ran
in-memory probes. One blocker, seven major, one minor, two questions:

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | blocker | `onExcessProperty: "preserve"` does not exist in Effect 4.1.4; unknown keys would be erased on the next save (reproduced). | Section 3: open codecs with `StructWithRest` at every object level; round-trip characterization. |
| 2 | major | Disposing the runtime in `stop()` changes post-stop reads, restart and in-flight finalization. | Section 5: `stop` is an operation; the runtime outlives it. |
| 3 | major | `findDuplicateDownload` probes the file system synchronously; a `FileSystem`-backed probe cannot run under `runSync` (reproduced). | Sections 2 and 5: the legacy package supplies the old synchronous probe as the `OutputProbe` implementation. |
| 4 | major | Schema JSON decoding discards the native `SyntaxError`; `Effect.promise` turns adapter rejections into defects that rollback cannot catch. | Section 9 item 2 (declared change); section 4 (`HostFailure` through `tryPromise`, original value rethrown by identity). |
| 5 | major | An effect-valued sink does not by itself preserve synchronous executor callbacks; `Effect.run*` is not allowed in a driver file. | Section 5: the sink's synchronous-prefix contract; the bridge lives in the unported package. |
| 6 | major | The old code yields at awaits unrelated to persistence (the async mutex, awaiting a possibly-absent pending admission); the digest service would add a new one. | Section 7 (`LegacyTiming`, one turn per old await, sequencing tables); section 6 (synchronous SHA-256). |
| 7 | major | `legacy/` does not exempt files from the ported unit; several "pure" functions read the clock, use JSON or native sets; the process helpers are not one-liners. | Section 2: an unported compatibility package holds what the rules cannot express; section 6 for the pure modules. |
| 8 | major | Skip-and-log for undecodable rows is a behavior change, not a consequence-free schema introduction. | Section 9 item 1: declared as a deliberate change, with characterization of the old loader. |
| 9 | minor | Identity-guarded rollback applies to transitions only; `add` and `importCompleted` remove unconditionally. | Section 10: rollback characterized per operation. |
| 10 | question | What the timer bridge must preserve beyond deadlines; the default Effect clock cannot `unref`. | Section 5: `QueueTimers.after` has `keepAlive`; the legacy package keeps the unref'd idle timer; section 10 keeps the handle-count assertions. |
| 11 | question | Ordering and ownership left open in `SourceAdmission`, `TaskEvents`, `ProcessControl`, `TaskPersistence`. | Section 5, contracts below the table. |

A second pass by another independent session of the same tier checked the resolutions and the
revision itself. No blocker; it confirmed by probe that the open codecs preserve unknown keys at
every level through the memory adapter's structural clone, and that a nested `runSync` from a host
callback inside a fiber of the same runtime is safe and sees current state. Its findings:

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 12 | major | One turn per old `await` does not fix promise settlement (`runPromise` adds a turn; measured on `hasTask`) or automatic yields after 2,048 operations. | Section 7: `runFork` with an exit observer, `PreventSchedulerYield`, settlement markers, and a declared change only if measured. |
| 13 | major | Schema-inferred structs and arrays are readonly; the old public types are mutable and unported code assigns to them. | Section 3: `mutableKey` / `mutable` arrays; compile-only mutual-assignability checks against the old declarations. |
| 14 | major | The split needs build and test wiring the draft did not list (desktop's bundled-package list, `test:audit` globs, manifests, lint scope). | Section 8, wiring list. |
| 15 | minor | UUIDs come from `SecureRandom.uuidV4`, not `Random`. | Section 5. |
| 16 | question | Which fork policy keeps each callback's launch order. | Section 5: immediate start at the old position. |
| 17 | question | Admission cancellation: interruption or an empty success. | Section 5: interruption natively; `null` in the legacy class. |

The reviewers found sound: structs over classes and dropping the unused zod refinements; that
synchronous reads while another fiber is suspended work on a warmed `ManagedRuntime`;
store-before-persist and transition-before-snapshot as read from the source; the command-and-sink
direction for executors; the db integration; that no consumer imports the internal classes the
design drops; and deferring host-input decoding to the host phases.
