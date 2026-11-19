# Independent review remediation

Progress:

- [x] Review the eighteen findings against the pre-port sources and merged kernel.
- [x] Execute git-extracted pre-port functions under Node 22.23.4.
- [x] Restore confirmed behavior and add regression tests without changing an existing assertion.
- [x] Sweep all 105 ported TypeScript source files for truthiness drift; audit kernel/driver lifetimes and every `dual`.
- [x] Pass package checks/tests, repository check, three full test runs, catalog and ratchet.
- [x] Finish the final packaged build, CLI build and three isolated golden runs.
- [x] Complete second-round fixes, registry proofs and final gate receipts.
- [x] Complete third-round fixes, differential startup proof and final gate receipts.

## Scope and result

This reviews the merged logger, i18n, db and task-queue ports at `79f556b` against logger
`e36abab`, i18n `299551e`, db `0b3c04e` and task-queue `21d6718`. The migration's parity rule
preserves exact behavior within declared types and old returned results for the scalar cases
defined in PORT-GUIDE; old engine/Node failures require failure without error-text emulation.
Arrays and objects in scalar positions have no parity obligation. Old application bugs remain. No golden or existing characterization assertion
was edited. The changes restore legacy behavior and make the native scheduler's dispatch
reservation and executor-startup paths safe under interruption and concurrent control requests.

The old functions were extracted with `git show` and executed under pinned Node 22.23.4.
The extracted sources and receipts are kept in the run's scratch area, not committed. A generated matrix makes 400 old/new comparisons in each of `UTC`,
`America/Chicago` and `Asia/Tokyo`: 1,200 passing comparisons. It covers the six absent/falsy
values (undefined, null, zero, empty string, NaN and false), queue admission and filters,
language defaults, classifier application errors and failure on type-violating scalar inputs, projection fields, FSM inputs, and generated
Retry-After dates with local, UTC, EST, GMT and numeric-offset forms. Separate old-store
extraction and bundling against the 0.45.4 Drizzle alias passed five supplied-store failure
comparisons under pinned Node. The committed DB test also compares old/new prepared-query
failures for constraints, missing columns and missing tables, and checks original error identity.

The supplemental Node matrix also passed 320 queue interleavings (160 old, 160 new) with slot and admission-lease assertions, plus old/new stale-unsubscribe checks.

The differential, interleaving, source-sweep and gate receipts are `differential.mts`, `differential-*.log`, `queue-interleavings.mts`, `queue-interleavings.log`, `old-results.mts`,
`old-results.log`, `db-differential.mts`, `db-differential.log`, `source-sweep.tsv`,
`source-sweep.diff` and `gate-results.json`. Evidence paths and machine-specific paths do not
form part of the public report.

## Findings

| Finding | Severity | Resolution and proof |
| --- | --- | --- |
| M1 | Major | Reconciliation passes a store/active accessor to `sweepDeadSlots`; the scheduler evaluates it inside the lock body. A queue-injection test dispatches between requesting the sweep and evaluating its predicate; the scheduler test retains the slot, per-group count and admission lease. |
| M2 | Major | Falsy subscription IDs select the URL host; falsy raw arguments retain `sha256:none`. Legacy admission and strict hash matrices cover null, zero, empty string, NaN, false and undefined. |
| M3 | Major | Status, group, parent and kind filters use old truthiness, and nullish query skips trimming. The store matrix checks every falsy filter across root and child tasks. |
| M4 | Minor | The pure classifier accepts an explicit date-parsing capability. Compatibility supplies the original `Date.parse`; native defaults retain Effect DateTime semantics, explicitly documented for later cutover. Generated date matrices run in three timezones. |
| M5 | Minor | Empty captured event buckets remove the key unconditionally. This deliberately restores stale-unsubscribe behavior; the regression test proves a repeated old unsubscribe removes a replacement listener bucket. |
| M6 | Major | Scheduler reservation is masked, dispatch is restored to interruptibility, and `ensuring` rolls back every unfinished reservation in a batch. `withPermits` owns mutex release. Startup interruption completes its attempt Deferred; idle callbacks clear the fired timer before reconciliation. Tests interrupt suspended scheduler and queue dispatch, verify slot/group/lease release and complete history removal. Successful callback acceptance is committed in `onExit` before the timing turn, so interrupting that later turn retains the live slot and lease. |
| M7 | Major | Cancel while startup is pending retains the reservation and cancellation intent. Pause records intent without a handle only across a suspended executor startup. On return from a suspended start, the handle is registered and pending startup intent is delivered as detached work; insert/finish windows retain their old behavior. Repeated cancel/pause calls while startup is pending are covered. Suspended-executor tests verify operation delivery, terminal/paused state and capacity accounting. |
| M8 | Minor | Scheduler construction captures the receiving owner's context. Admission callbacks provide that context before starting detached dispatch in the owner scope. A foreign-runtime release test proves synchronous order, the owner log sink and `PreventSchedulerYield=true`. Subscription removal is scoped. |
| M9 | Minor | The add/import existing-ID guard uses truthiness. The subsequent nullish ID generator remains unchanged, preserving explicit zero/false/empty/NaN IDs and generating an ID for null/undefined. Fresh-store tests cover both methods. |
| M10 | Minor | Same event-bucket defect as M5; one restored implementation and regression test. |
| M11 | Minor | Same date parser defect as M4; compatibility uses `Date.parse` both for explicit headers and stderr-extracted Retry-After values. |
| M12 | Minor | Legacy `virtualError` and `defaultMaxAttempts` resolve through the legacy rule lookup and throw plain `Error` with `no rule for category …`. Tests check constructor and message. |
| M13 | Minor | Legacy `takeStderrTail` retains its Buffer-based implementation and plain legacy calling convention. Invalid type-violating calls must fail; discarded prevalidation and engine-error-text assertions are removed. The strict optional-byte `dual` predicate also distinguishes data from configuration by call shape. |
| M14 | Minor | The borrowed adapter clears savepoint state whenever SQLite says no transaction exists, resets it at each depth-zero begin, and clears a failed savepoint acquisition. An `INSERT OR ROLLBACK` host transaction test proves the next transaction commits and leaves the handle outside a transaction. |
| M15 | Minor | Runtime entries are keyed by `===` handle identity in an array registry. No foreign handle is modified, and no native Map/WeakMap is introduced. Separate memory handles and two handles on the same file have independent runtimes and independent disposal. Explicit `releaseHandle` removes each strong entry. |
| M16 | Major | Both supplied-Drizzle store factories wrap all their methods with the legacy driver-error translation. `rethrowQueryError` recognizes only a top-level Drizzle query wrapper with an Error cause and throws that original cause. Old/new Drizzle and git-extracted store comparisons prove SQLite constructor, code and message; a sentinel test proves identity. |
| M17 | Minor | `executeValues` maps schema-decode errors separately from driver errors. Its driver failure is classified once. Tests compare ordinary and values-mode UNIQUE failures and verify original SQLite cause plus cached object-mode restoration. |
| M18 | Minor | Language and locale helpers retain the old falsy guard through `Predicate.isTruthy`; corrupt zero/false/NaN settings return the old English/null/false defaults. Strict tests and Node differential matrices cover all six absent/falsy values. |

The review finding's M9 prose suggested every falsy ID generates a UUID. Executing the old code
showed a narrower contract: the existing-ID *lookup* uses truthiness, while ID creation uses
`req.id ?? randomUUID()`. This change preserves that exact split. Explicit falsy IDs other than
null/undefined remain IDs, and inserting the same one twice can still fail with duplicate ID.

## Second review round

Nine independently reproduced findings were checked against the first review's dirty change and
the pre-port task queue. R1/R7 and R2/R6 describe the same two defects. The six persistence-window
and lifecycle scenarios were executed unchanged against git-extracted `21d6718` and the current
compatibility implementation under Node 22.23.4; each implementation passes all six. These
receipts are kept in the run's scratch area, not committed. Existing characterization assertions
and goldens remain unchanged.

| Finding | Severity | Resolution and regression proof |
| --- | --- | --- |
| R1 / R7 | Major | Cancel retains intent without a handle only while the current executor start is in flight. Finish-window cancellation clears intent and releases capacity immediately, as before. The gated legacy closeAttempt test then manually retries and proves the second run receives no cancellation. Native rejection and interruption after startup cancel also retry cleanly. |
| R2 / R6 | Major | Pause without an active handle is a no-op except across suspended executor startup. Finish-window pause therefore cannot poison manual or automatic retry. Gated legacy closeAttempt tests exercise both retries; native rejection/interruption tests assert zero stale intent and a running retry. |
| R3 | Minor | The starting marker is published immediately before executor.run, after awaited insertAttempt, and cleared at handle registration or failed/interrupted start. Pause during insertAttempt is dropped; cancel there releases the slot and leaves the resulting run alone, matching old results. Delayed startup control delivery detaches, so dispatch/add does not await a newly introduced cancel/pause promise. Tests hold those promises while joining add, resume and retryManual dispatch callers. |
| R4 | Minor | started remains true until stop closes persistence. Concurrent stops both cancel and await close; start during stop returns without loading again. A separate stopping count prevents idle callback rearming. The pre-port/current gated-cancel test verifies both stop promises remain pending and both closes occur. |
| R5 | Minor | Every reserved-but-undispatched original heap entry is restored in finalization, preserving its priority and sequence. Batch-of-two and batch-of-three tests interrupt the first callback, then prove later IDs run without reconcile, before a later same-priority entry. A pending-interrupt
test gates the reservation lock, requests interruption before restore and proves a callback that
never starts is also requeued; that test fails against the preceding implementation. Normal acceptance adds no lock/timing turn, preserving the existing exact sequencing characterization. |
| R8 | Minor | Removed the legacy query trim pre-call and discarded classifier tail pre-scan. Audited added code for engine-error emulation; the only remaining Buffer.byteLength is the actual plain legacy tail implementation required by M13. Type-violating scalar tests assert failure without engine error text/code. M12's deliberate plain Error contract remains exact. PORT-GUIDE now defines the input parity boundary. |
| R9 | Minor | rethrowQueryError unwraps only a top-level DrizzleQueryError with an Error cause. Any other value is rethrown by identity. Direct helper and supplied-store tests preserve an outer Error whose cause is a DrizzleQueryError, alongside plain/scalar/nullish values. |

### Attempt registry outcomes

The `review-registries.test.ts` suite composes the real queue, scheduler, admission, event,
watchdog, retry and process registries with gated executor/persistence capabilities. Every settled
row asserts the full queue snapshot: active, finished, starting, pendingAdmissions, pendingPause,
pendingCancel, removing, progressDirty and progressLastWrite are all zero. It also asserts every
scheduler ownership registry (running, dispatching, reservations, leases and group counts), ready
heap, source-admission held keys, waiting callbacks and waiting-key map, event buckets, watchdog
entries and process handles. Stop-window tests assert the complete retained snapshot before unblocking
and the complete drained snapshot afterwards. Retry heap size is asserted separately. Configuration caps remain
unchanged; no per-group caps are installed by these scenarios.

| Attempt outcome / test case | Queue attempt and intent registries after settlement | Scheduler running / dispatching / reservations / leases / groups / ready | Admission held / waiting / waiting keys / listeners | Event buckets / watchdog / process handles | Retry heap |
| --- | --- | --- | --- | --- | --- |
| success | All zero | All zero | 0 / 0 / 0 / 1 | 0 / 0 / 0 | 0 |
| error without retry | All zero | All zero | 0 / 0 / 0 / 1 | 0 / 0 / 0 | 0 |
| error with retry | All zero | All zero | 0 / 0 / 0 / 1 | 0 / 0 / 0 | 1, the scheduled retry |
| cancelled | All zero | All zero | 0 / 0 / 0 / 1 | 0 / 0 / 0 | 0 |
| paused | All zero | All zero | 0 / 0 / 0 / 1 | 0 / 0 / 0 | 0 |
| executor rejection after cancel or pause | All zero; retry runs without either control | All zero before retry and after its finish | 0 / 0 / 0 / 1 | 0 / 0 / 0 | 0 |
| interrupted start after cancel or pause | All zero; retry runs without either control | All zero before retry and after its finish | 0 / 0 / 0 / 1 | 0 / 0 / 0 | 0 |
| illegal final transition | All zero despite failure | All zero | 0 / 0 / 0 / 1 | 0 / 0 / 0 | 0 |
| stop during start | While start is gated: starting=1, finished=1; after returned handle finishes: all zero | Reservation and lease remain owned until that finish, then all zero | Held key remains owned until finish, then 0 / 0 / 0 / 1 | 0 / 0 / 0 after finish | 0 |
| stop during finish | While closeAttempt is gated: finished=1, active=0; after finish: all zero | Reservation and lease remain owned until finish, then all zero | Held key remains owned until finish, then 0 / 0 / 0 / 1 | 0 / 0 / 0 after finish | 0 |

The single admission listener is the scheduler's existing scope-owned subscription, unchanged
by attempt completion or stop; its existing acquireRelease unregisters it at scope exit. Stop
continues to close persistence without joining an already pending start/finish, preserving the
legacy lifecycle contract. These two rows therefore assert retained ownership before unblocking
and empty ownership afterwards. They do not claim that stop alone empties a still-live attempt.
The separate batch tests cover interrupted dispatch ownership and the existing accepted-callback
timing test proves that interruption after acceptance retains the live reservation and lease.

## Third review round

Three minor findings were reproduced and corrected. Synchronous starts are distinguished from
suspended starts by immediate child-fiber execution and its completion state, independent of the
executor's package. The child is owned by the dispatch fiber, so interruption retains cleanup.

| Finding | Resolution and proof |
| --- | --- |
| U1 | A start that completes synchronously drops re-entrant pause and leaves cancel delivery to the original control call, preserving one executor cancellation. Deferred controls apply after a suspended start. The same scenario source runs against git-extracted `21d6718`: seven operation sets by four follow-ups match in all 28 inside-run cases; another 28 cases emit finish synchronously inside run, with and without controls. The committed old-result fixture pins all 56. A native synchronous-start test also drops pause, proving the decision does not use package identity. |
| U2 | Removed DrizzleQueryError handling from rethrowDriverError; its function body matches HEAD. Mixed SQL failure plus bare or nested Drizzle defects preserve the SQL driver object by identity. Supplied stores retain the separate top-level-only rethrowQueryError boundary. |
| U3 | The legacy detectSystemProfile wrapper now applies the old locale-list truthiness guard before computing its Intl default. Its matrix includes null, false, zero, empty string, NaN and undefined, each retaining the pre-port French environment fallback. Both affected truthiness-table rows are corrected. |

The native gated-start test setup now yields after its entered Deferred: Effect resumes Deferred
waiters inline, so without that yield a control and gate release can both run before the executor
reaches its awaited gate. Assertions are unchanged; the setup now exercises the intended suspended
start. The full second-round registry and lifecycle suites remain required gates.

## Final verification and what stays open

After the third round, one more independent reviewer ran the pre-port kernel, the port before
these fixes and the fixed tree side by side through the compatibility package: 300 scenarios
(pause and cancel in every window of an attempt, including re-entrantly inside the executor's
synchronous start and with a finish emitted during the start, each followed by a manual retry, a
resume, a retry tick or nothing). The fixed tree differs from the pre-port kernel in none of
them, every registry is empty after each, and promise settlement turns are unchanged from the
port before the fixes. The db and i18n fixes were re-verified the same way (2,100 locale inputs,
real SQLite failures through the subscriptions store).

Two minor findings of that pass concern only the strict kernel when it is driven by a native
executor and native persistence, which nothing in the application does until phase 9.1. They
are not fixed here and are obligations of that phase:

1. With persistence that completes synchronously, a cancel issued re-entrantly during a
   synchronous executor start is recorded but never delivered to the executor; the slot stays
   held until the run ends by itself, and a manual retry issued meanwhile leaves the task
   `queued` until the next reconcile.
2. A pause issued by another fiber before an asynchronous executor start first suspends is
   dropped: the kernel tells a re-entrant control call from an external one by whether the start
   has suspended yet, not by who is calling. The suspended-start tests yield once before the
   control call, which is why they pass.

## Truthiness sweep

Every current ported source file was inventoried and diffed against its pre-port counterpart,
its source of moved behavior, or an empty baseline for a newly introduced model/service/helper.
The evidence TSV names the original 104 files and their references; the accompanying unified diff retains
those comparisons. The new optional RegistryInspection service was additionally inspected: it
only declares count snapshots and the receiving callback contract. The table below records non-boolean legacy guards and their rewrites.
Membership results, comparisons and flags statically typed boolean were also inspected but do
not change truthiness. New schema/service declarations have no replaced runtime guard.

`P.isTruthy` below is `effect/Predicate.isTruthy`. Additional null/undefined guards retained for
TypeScript narrowing do not replace it.

| Current file / moved source | Old expression | Port expression reviewed / final expression | Verdict |
| --- | --- | --- | --- |
| `schema/src/*` | No predecessor | Introduced literal/schema helpers and exports | No replaced legacy guard. |
| `logger/src/{client,node}.ts`, drivers, layer and facades | `instanceof Error`, `typeof first === 'string'`, `rest.length === 0` | Same type/length tests; sink message array check | Equivalent for the named values. |
| `logger/src/Node.driver.ts` | `NODE_ENV ?? 'development'`, `pretty ?? …` | Same nullish defaults | Preserve empty strings and false intentionally. |
| `i18n/src/languages.ts` | `if (!code)` | Explicit null/undefined/empty checks → `!P.isTruthy(code)` | Fixed M18: zero, NaN and false fall back. |
| `i18n/src/languages.ts` | `if (directMatch)` | `directMatch !== undefined` | Equivalent: search returns a supported nonempty code or undefined. |
| `i18n/src/system-locale.ts` | `if (!tag)` | Explicit null/undefined/empty checks → `!P.isTruthy(tag)` | Fixed M18. |
| `i18n/src/system-locale.ts` | `!cleaned`, `country ? …`, `primaryLanguage && …` | Empty-string/null checks | Equivalent: trimmed strings and supported nonempty language codes. |
| `i18n/src/{system-locale,legacy/system-locale}.ts` | `input.locales && input.locales.length > 0` | Undefined-only guards → truthiness plus narrowing in both kernel and facade | M18 fixed the kernel; U3 completes the legacy null/falsy fallback before Intl default selection. |
| `i18n/src/{init,I18n.driver}.ts` | `if (instance.isInitialized)` | Same boolean flag | Unchanged. |
| `i18n/src/resources.ts`, other defaults in `legacy/system-locale.ts` | Nullish resource/environment defaults | Same nullish defaults; locale-list truthiness is covered above | Intentional native explicit-input boundary; the facade locale guard was a falsy rewrite corrected in U3. |
| `db/src/{subscriptions,transcripts,prompt-runs}.ts` and `Migrations.layer.ts` | `!columns.includes(...)`, `segmentColumns.length > 0` | Effect membership checks and same length comparison | Equivalent boolean results. |
| `db/src/*model*`, errors, services, table definitions and legacy appliers | No additional non-boolean runtime guard | Schemas, typed table metadata and direct facade calls | No changed truthiness site. |
| `task-queue/src/TaskQueue.layer.ts` | `if (req.id)` in add/import | Undefined/length guard → `P.isTruthy(request.id)` | Fixed M2/M9; nullish ID creation left unchanged. |
| Same | `if (input.subscriptionId)` | Undefined/length guard → `P.isTruthy(input.subscriptionId)` | Fixed M2/M9. |
| `task-queue/src/util/sha256.ts` | `!args || args.length === 0` | Undefined-only guard → `!P.isTruthy(args) || …` | Fixed M2: every falsy value gives the old sentinel. |
| `task-queue/src/TaskStore.layer.ts` | `opts?.status`, `opts?.groupKey`, `opts?.parentId`, `kind` | Undefined/empty checks → truthiness for candidate selection and filtering | Fixed M3, including cacheability. |
| Same | `opts?.query?.trim()` | Undefined-only trim → nullish guard followed by trim | Fixed null; numeric/boolean query still throws. The strict method fails for wrong-kind scalar queries; no discarded facade pre-call emulates engine text. |
| Same | `!(query || kind)` | Undefined-only cache guard → both falsy | Fixed cache eligibility for falsy kind. |
| Same | `opts?.cursor ? … : 0` | Nonnull/empty guard → `P.isTruthy(cursor)` | Restored zero/false/NaN behavior. |
| Same | `if (t)`, `if (listing)` | Undefined checks on internally stored task/listing objects | Equivalent: stored values are objects. |
| `task-queue/src/TaskQueue.layer.ts` | `req.parentId && …` | Nonnull length guard | Equivalent for null/zero/empty/NaN/false; no dereference of null. |
| Same | `if (!identity)`, `if (duplicate)`, `if (active)` | Null/undefined checks | Equivalent: identity is a nonempty serialized string, records are objects. |
| Same | `options ? { … } : undefined` in retry | Undefined-only guard → `P.isTruthy(opts)` | Fixed falsy retry options replacing an existing input. |
| Same | `if (input)` in transition | Undefined-only choice → truthiness plus narrowing | Fixed falsy replacement input. |
| Same | `!(from && to)` in relocation | Length-only guard → `!P.isTruthy(from) || !P.isTruthy(to)` | Restored error for every falsy path. |
| Same | `task.parentId && affectedIds.has(...)` | Nonnull guard → truthiness plus narrowing | Restored falsy parent guard. |
| Same | `output.collectionSummary && …`, directory/transcript/file checks | Object presence + preserved boolean conversion/truthiness | Restored summary guard; directory/transcript/file truthiness retained. |
| Same | `attempt.stdoutTail?.trim()` / stderr | Null guard plus trimmed-string length | Equivalent for persisted null/string columns; invalid non-string methods still fail. |
| Same | `pauseReason !== undefined`, `ctx.reason ?? null`, numeric `??` defaults | Same expressions | Preserve empty strings, false and zero where the old code did. |
| `task-queue/src/classifier/index.ts` | `!header` | Nullish/empty guard → `!P.isTruthy(header)` | Restored zero/false/NaN absent-header handling. |
| Same | `!trimmed`, `!rule.regex`, `m && m[1]` | Empty string/null/undefined checks | Equivalent: trimmed/regex-match strings and the fixed normative rule table. |
| `task-queue/src/fsm/index.ts` | `!ctx.output`, `if (ctx.error)` | Undefined-only checks → truthiness | Restored falsy output rejection and ignored falsy errors. |
| Same | `reason ? suffix : ''` | Undefined/length test → `P.isTruthy(reason)` | Restored falsy diagnostic suffix behavior. |
| Same | `LEGAL_TRANSITIONS[from]?.has(to) ?? false` | Direct map access → guarded access | Restore false for missing/falsy source status. |
| `task-queue/src/projection/index.ts` | `opts.tags ? [...opts.tags] : undefined` | Nullish guard → truthiness plus narrowing | Restored ignored false/zero/NaN/empty tags. |
| Same | `proj.collectionSummary`, `task.output`, `task.lastError` | Nullish guards → truthiness plus narrowing | Restored old optional object guards. |
| Same | `out.cookieSources`, `formatId`, `subtitleStatus`, `subtitleLanguages` | Nullish/undefined guards → truthiness plus narrowing | Restored ignored falsy optional output metadata. |
| Same | `out.filePath && …` | Empty-string-only guard → `P.isTruthy(out.filePath)` | Restored social projection's falsy media-path behavior. |
| Same | `subStatus`, `mediaFilePath ? …` | Undefined check | Equivalent: internal projection enums and paths are nonempty strings or undefined after the restored guard. |
| `task-queue/src/TaskPersistence.layer.ts` | `t.output ? JSON.stringify(...) : null`, same for lastError | Nonnull check → `P.isTruthy(...)` | Restored null SQL bindings for all falsy write-side values. |
| Same | `r.progress_json`, `r.output_json`, `r.last_error_json` | Null/empty guards after row schema decode | Equivalent for decoded string/null columns; malformed semantic reads remain boundary decode failures by design. |
| Same | Memory map task/attempt guards | Undefined checks | Equivalent: values are object records. |
| `task-queue/src/TaskExecutor.layer.ts` | `!(byKind[kind] || useDefault)`, then `?? default` | Undefined-only selection → original two-step truthy availability/nullish selection | Restored null fallback and falsy unsupported-kind errors. |
| `task-queue/src/scheduler/Scheduler.layer.ts` | `if (groupKey)`, `if (!victim)` | Empty-string/undefined checks → truthiness | Restored the old counter/victim semantics for falsy keys/IDs. |
| Same | Task/candidate/release object guards, nullable caps | Undefined/Option checks; unchanged `cap == null` | Equivalent object presence and old nullish caps. |
| `task-queue/src/scheduler/RetryScheduler.layer.ts` | `!top`, `!item`, nullable timer checks | Undefined/null checks | Equivalent: heap items and cancellation Effects are objects. |
| `task-queue/src/process/{Watchdog,ProcessRegistry}.layer.ts` | `!entry`, `!handle`, regex match, nullable timer/start identity checks | Undefined/null/Option checks | Equivalent: internally registered objects and decoded numeric identities. |
| `task-queue/src/ProcessControl.driver.ts` | Empty process output / regex result / cached tick checks | Decoded text/Option/null checks | Equivalent for decoded string/null probes; native platform capabilities remain explicit. |
| `task-queue/src/{complete,download-identity}.ts` | Output truthiness; URL username/password/ID strings | Existing boolean conversion; explicit empty/null checks on URL-derived strings | Equivalent. URL and regex APIs return strings/null, never numeric/boolean values. |
| `task-queue/src/SourceAdmission.layer.ts` | Key/release/listener object presence | Option/undefined checks | Equivalent: parsed host key is a nonempty string, other values are internal objects. |
| `task-queue/src/util/min-heap.ts` and remaining index/model/service files | Numeric size/index/comparator checks, boolean membership, declarations | Same conditions or no runtime body | No changed non-boolean truthiness guard. |

## Resource-lifetime and registration sweep

The kernel and borrowed DB driver were inspected for cleanup statements following `yield*`,
generator `try`/`finally` or `try`/`catch`, and registration after a possibly synchronous fork.
Pure JavaScript `try`/`finally` around synchronous `statement.raw(...)` stays correct and is
not an Effect generator finalizer.

| File / site | Class and outcome |
| --- | --- |
| `scheduler/Scheduler.layer.ts`: lock | Manual take followed by installation of release was replaced by `withPermits(1)`. |
| Same: reserve/dispatch batch | Mask reservation and install `ensuring` before restoring interruptible callbacks. Every still-dispatching ID rolls back. Original heap entries for IDs whose callback never started are restored with their priority and sequence; the accepted path adds no lock/timing turn. |
| Same: admission subscription | `acquireRelease` unregisters the callback at scope exit; detached work receives the captured owner context. |
| Same: lease release / dead sweep / demotion | Lease entry is removed before its idempotent release. Dispatch rollback is a finalizer; group rebuilding remains under the mutex. No cleanup is expressed as generator `finally`. |
| `TaskQueue.layer.ts`: executor startup | Attempt cleanup is installed with `onError` before running the asynchronous executor and `ensuring(complete)` around rejected-start finalization. A per-attempt starting marker brackets only executor.run. Successful handles receive pending intent through detached work; every completion clears that attempt's intent. |
| Same: finish handling | Install slot-release finalization before watchdog disarm; active-map removal also occurs in the finalizer. Finish-event detached work already ensures attempt completion. |
| Same: transition and rename | Install `onError` around store update plus persistence; restore the old object by identity on failure or interruption. |
| Same: relocation | Install one `onError` around the entire update/write sequence; restore each still-owned in-memory object by identity. |
| Same: pending admission write | Its Deferred is completed by the child write, independently of the joining caller. Publication still follows the host adapter's synchronous prefix, as required by the existing reentrancy characterization. Synchronous child completion is safe: the Deferred already exists before fork, and join cleanup follows map registration. |
| Same: reconcile/history flags | Existing `ensuring` clears `reconcileBusy` and removal markers. No generator finalizers. |
| Same: idle timer / stop | Fired callbacks clear `idleTimer` before entering reconciliation; stop retains `started` until persistence closes, as before. A separate stopping count prevents idle rearming during shutdown without interrupting an already fired callback. |
| `process/Watchdog.layer.ts`: arm/disarm | Publish the entry before scheduling a callback; remove it on failed scheduling. Disarm removes the entry before awaiting cancellation. |
| `scheduler/RetryScheduler.layer.ts`: tick/rearm/stop | Existing tick `ensuring` resets/rearms. Capture cancellation and clear the stored timer before awaiting it, rather than leaving reset after `yield*`. |
| `TaskEvents.layer.ts` / `SourceAdmission.layer.ts` | Existing `ensuring` unwinds traversal depth and prunes listener tombstones. Admission callback cancellation removes its waiter through `Effect.callback` cleanup. |
| `QueueTimers.layer.ts` | Scoped fork owns native timer lifetime. Its cancellation Effect is returned by `Effect.map`, so a synchronous fired body does not require a later registration map entry. |
| `process/ProcessRegistry.layer.ts` | Handle registration precedes journal append; close removes the handle before append. Cancel removes only after the kill operation returns: an interrupted kill retains the identity record for subsequent recovery. |
| `TaskPersistence.layer.ts` | SQL transaction cleanup belongs to the client; memory operations do not fork or acquire external resources. |
| `BetterSqlite.driver.ts` | Cache has a scope finalizer; permit availability probe is uninterruptible; SQL client owns transaction release. Borrowed savepoint state follows `handle.inTransaction`, including host auto-rollback. Raw-mode restoration uses synchronous JavaScript `finally` inside the driver thunk. |
| Remaining kernel models/services/pure helpers and drivers | No generator `try`/`catch` or `try`/`finally`; no further publication-after-fork site requiring registration. |

## `dual` audit

All sixteen source call sites are listed here.

| File / export | Data-first / data-last dispatch | Result |
| --- | --- | --- |
| `logger/src/legacy/node.ts`: `logCaughtError` | Fixed arity 2: `(event,error)` / `(error)(event)` | Correct; legacy two-argument shape retained and data-last sink payload tested. |
| `i18n/src/legacy/index.ts`: `initSharedI18n` | Fixed arity 2: `(instance,binding)` / `(binding)(instance)` | Correct; the instance/binding order is retained and data-last initialization tested. |
| `db/src/legacy/subscriptions.ts`: applier | Fixed arity 2: `(exec,columns)` / `(columns)(exec)` | Correct; both shapes are executed against recording SQL callbacks and their statement arrays compared. |
| `db/src/legacy/prompt-runs.ts`: applier | Fixed arity 2: `(exec,columns)` / `(columns)(exec)` | Correct; both shapes are executed against recording SQL callbacks and their statement arrays compared. |
| `task-queue/src/types.ts`: `canAdmitTranscription` | Fixed arity 2 | Both shapes compared in regression test. |
| `task-queue/src/classifier/index.ts`: `takeStderrTail` | Optional numeric configuration: one string is data; zero args, explicit undefined or one numeric argument configures data-last; two args are data-first | Predicate corrected. Both valid shapes and explicit undefined configuration tested; invalid scalar data fails through the plain legacy function. |
| Same: `parseRetryAfter`, `classify`, `virtualError` | Fixed arity 2 | Both shapes compared in regression test. Legacy wrappers retain their original single-/two-argument signatures. |
| Same: `parseRetryAfterWithDateParser`, `classifyWithDateParser` | Fixed arity 3 | New parsing capability overloads; both shapes tested. |
| `task-queue/src/process/Watchdog.layer.ts`: `layer` | First argument is a function for data-first; optional options select data-last | Correct: callbacks are functions, options are objects/undefined. Both shapes execute with omitted/default and explicit options in layer tests. |
| `task-queue/src/complete.ts`: `isOutputComplete` | Fixed arity 3 | Both shapes compared in regression test. |
| `task-queue/src/fsm/index.ts`: `isLegalTransition`, `transition` | Fixed arity 2 / 3 | Both shapes compared in regression test. Legacy transition wrapper remains plain. |
| `task-queue/src/scheduler/RetryScheduler.layer.ts`: `computeBackoffMs` | Fixed arity 3 | Both shapes compared in regression test. |
| `schema/src/*` | No `dual` call | No overload to audit. |

## Unported boundary touched for M16

`packages/subscriptions-core/src/store.ts` is the only unported consumer source changed for M16. Compatibility classifier and queue-list facade edits separately restore the named legacy contracts.
Both `createSqliteSubscriptionsStore` and `createSqliteMetaStore` receive a supplied Drizzle
object; each returned public method is wrapped once at the store boundary. This retains the
owned plain object and copies each original method descriptor, name, arity and function
prototype. Tests check stable method identity, own descriptor/enumeration, object prototype,
freeze behavior, Promise return and receiver forwarding. A direct original driver throw is
also observed unchanged through the returned method's rejection. Synchronous failures
and Promise rejections pass through `rethrowQueryError`, the DB legacy helper that unwraps only a top-level `DrizzleQueryError` with an `Error` cause.
Other values, including errors with nested query/driver causes, retain identity. The original SQLite error object escapes the wrapper, including its
constructor, `code` and message. Consequently the existing subscriptions API's unchanged
`error.message` assignment to `last_error` receives SQLite's text again.

Changing only the desktop database factory would miss CLI/tests/other callers supplying their
own Drizzle object. Changing only DB migration appliers would not intercept store queries.
Changing the subscriptions API's catch sites would miss direct store callers and change only
one consumer. Wrapping the two supplied-store factories is the smallest shared boundary that
covers all of these callers without rewriting SQL or upgrading the unported store. Root `test`
adds the nested review Vitest directory to the existing final Vitest invocation, keeping the
legacy node:test glob and its assertions intact.

## Gate and limits

The third-round final-source gates run under Node 22.23.4 on PATH, with the build's uv shim
and temporary directories confined to the run's scratch area, not committed. The earlier
400-case/timezone, six-scenario lifecycle and 320-interleaving receipts above remain supplemental
second-round evidence. The current round reruns the full repository tests and registry suite,
and adds the 56-case startup and six-case legacy-locale differential. Its command receipts are:

| Gate / command | Exit | Result |
| --- | --- | --- |
| `node --import tsx <run-evidence>/verify-parity.mts` | 0 | 56 old/current startup scenarios, six locale comparisons, extracted-source byte checks, driver helper identical to HEAD |
| `bun run --cwd packages/schema check` | 0 | Passed |
| `bun run --cwd packages/schema test` | 0 | 42 tests |
| `bun run --cwd packages/logger check` | 0 | Passed |
| `bun run --cwd packages/logger test` | 0 | 8 tests |
| `bun run --cwd packages/i18n check` | 0 | Passed |
| `bun run --cwd packages/i18n test` | 0 | 16 tests |
| `bun run --cwd packages/db check` | 0 | Passed |
| `bun run --cwd packages/db test` | 0 | 70 main + 20 borrowed + 20 node tests |
| `bun run --cwd packages/task-queue check` | 0 | Passed |
| `bun run --cwd packages/task-queue test` | 0 | 90 tests |
| `bun run --cwd packages/task-queue-legacy check` | 0 | Passed |
| `bun run --cwd packages/subscriptions-core test` | 0 | 11 tests |
| `bun run check` | 0 | 10 ported configs, zero violations |
| `bun run test` | 0 | 382 audit + ported suites + 3 script tests + 78 final Vitest cases |
| `bun run test` | 0 | Same complete suite, second pass |
| `bun run test` | 0 | Same complete suite, third pass |
| `bun run deps:check` | 0 | No issues |
| `bun run port:check` | 0 | 10 ported configs, zero violations |
| `bun run build:linux` | 0 | Linux unpacked app, AppImage and deb built |
| `bun run --cwd apps/cli build` | 0 | CLI bundle built; restored to original HEAD after goldens |
| `bun run test:golden --scratch <run-evidence>/golden` | 0 | 379/379, zero failures; 58.3s; `suite-zo7HUB` |
| `bun run test:golden --scratch <run-evidence>/golden` | 0 | 379/379, zero failures; 59.9s; `suite-qEZZsE` |

The final-source package checks/tests, repository check, three repository test runs,
`deps:check` and `port:check` pass. The task queue now has 90 passing tests. DB runs 70 main tests,
then 20 borrowed-client and 20 node-client cases in separate processes; the 20 skipped client
cases in the unselected main process are executed in those separate processes. The ratchet
reports 10 ported configurations and zero violations.

The final Linux and CLI builds pass. Both consecutive third-round golden runs compare 379 of
379 cases (378 initial comparisons plus one persisted-restart comparison), with zero failures.
Tracked source/config hashes remain unchanged from the final gate through packaging; an
additional tracked-and-untracked source/config hash snapshot remains unchanged through golden
closeout. The generated CLI bundle is restored byte-for-byte from original HEAD `79f556b`.
There are zero CLI-dist, characterization or golden-file changes, no staged changes, and
`git diff --check` passes. Earlier-round packaged/golden receipts are retained as supplemental evidence; the table records
the third-round build and golden results.

`task-queue-legacy` has no package `test` script: the repository's unchanged audit glob runs its
characterization suite on each full run, and the added Vitest boundary suite exercises its
classifier/admission errors. `subscriptions-core` has no `check` script; its own `test` runs
separately and its product source is checked by desktop typechecking. Its optional standalone
`typecheck` has a documented baseline of six pre-existing diagnostics in untouched
`downloader-core/src/social-media.ts` and `threads.ts`; the first review recorded those diagnostics,
and this second review does not rerun that optional command. It remains outside the required gate;
the required desktop typecheck and supplied-store tests pass.

This change does not install a build, open the owner's profile, signal the owner's running app,
validate production data, or claim final native-driver cutover readiness. Native async-executor
coverage uses deterministic suspended test executors; it does not launch a real downloader.
SQLite automatic rollback is exercised with an OR ROLLBACK conflict, rather than filling a disk.
The identity registry retains handles strongly until the caller invokes `releaseHandle`, as
required by the ownership contract. The native Effect date parser's documented difference is
still present; compatibility always supplies the original Date.parse behavior.

Native startup rejection and interruption after cancel/pause are now covered, including a clean
manual retry. The deterministic tests inspect internal registry counts directly through an optional
`RegistryInspection` service. It receives read-only count snapshots, is absent in production, and
does not change the public queue, scheduler, admission or event service contracts. The counts are
schema-modeled; mutable registries are never exposed.

## For OWNER-REVIEW

- M5/M10 deliberately restores the old stale-unsubscribe bug: a repeated unsubscribe from a
  removed bucket can delete a newly registered bucket with the same event key.
- M16 was an undeclared phase-3 behavior change that reached the installed build. Restoring
  driver errors requires the narrow unported store-boundary edit described above.
- Executed old code confirms the exact M9 ID split; the review finding's UUID wording was broader.
- The byte-tail helper has an existing non-progress case when a caller chooses a byte limit
  below the encoded length of a string shorter than ten characters: the old loop can slice
  zero characters forever. This change leaves that bug intact; overload tests use a progressing
  input and limit. The normal default is 8 KiB.
- The native date-parser difference is intentionally exposed as a capability at the compatibility
  boundary rather than implementing a second JavaScript date parser. Later native cutover must
  make that choice explicitly.
- R3 preserves the old insertAttempt window: pause is dropped, and cancel releases capacity
  while the subsequently returned run is left alone. Changing that behavior needs a separate
  behavior change; deferred native control delivery is limited to actual executor startup.
- The array identity registry is a deliberate compliant alternative to native Map/WeakMap. It
  preserves foreign-handle identity without changing the handle or adding an allowlist entry.

## Complete per-file sweep inventory

This index expands the grouped expression/lifetime tables above. The first review inventoried
104 files; the optional inspection contract added here brings the current source count to 105. A moved companion was diffed
against the legacy implementation it replaces; a new declaration-only companion has no old
runtime conditional. Every inventory row has a corresponding diff in the evidence receipt.

| Ported source file | Pre-port comparison | Coverage |
| --- | --- | --- |
| `packages/schema/src/LiteralKit/LiteralKit.errors.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/schema/src/LiteralKit/LiteralKit.schema.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/schema/src/LiteralKit/index.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/schema/src/LiteralKit/internal/builders.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/logger/src/Client.driver.ts` | `e36abab:packages/logger/src/client.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/logger/src/Logger.layer.ts` | `e36abab:packages/logger/src/client.ts`; `e36abab:packages/logger/src/node.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/logger/src/Logger.model.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/logger/src/Logger.service.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/logger/src/Node.driver.ts` | `e36abab:packages/logger/src/node.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/logger/src/client.ts` | `e36abab:packages/logger/src/client.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/logger/src/legacy/client.ts` | `e36abab:packages/logger/src/client.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/logger/src/legacy/node.ts` | `e36abab:packages/logger/src/node.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/logger/src/node.ts` | `e36abab:packages/logger/src/node.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/i18n/src/I18n.driver.ts` | `299551e:packages/i18n/src/init.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/i18n/src/I18n.errors.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/i18n/src/I18n.model.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/i18n/src/I18n.service.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/i18n/src/index.ts` | `299551e:packages/i18n/src/index.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/i18n/src/init.ts` | `299551e:packages/i18n/src/init.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/i18n/src/languages.ts` | `299551e:packages/i18n/src/languages.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/i18n/src/legacy/index.ts` | `299551e:packages/i18n/src/init.ts`; `299551e:packages/i18n/src/index.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/i18n/src/legacy/system-locale.ts` | `299551e:packages/i18n/src/system-locale.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/i18n/src/resources.ts` | `299551e:packages/i18n/src/resources.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/i18n/src/system-locale.ts` | `299551e:packages/i18n/src/system-locale.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/db/src/BetterSqlite.driver.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/db/src/Db.errors.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/db/src/Drizzle.service.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/db/src/History.model.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/db/src/Migrations.layer.ts` | `0b3c04e:packages/db/src/subscriptions.ts`; `0b3c04e:packages/db/src/transcripts.ts`; `0b3c04e:packages/db/src/prompt-runs.ts`; `0b3c04e:packages/db/src/task-queue.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/db/src/Migrations.service.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/db/src/NodeSqlite.layer.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/db/src/PromptRuns.model.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/db/src/Query.model.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/db/src/Row.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/db/src/Subscriptions.model.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/db/src/TaskQueue.model.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/db/src/Transcripts.model.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/db/src/history.ts` | `0b3c04e:packages/db/src/history.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/db/src/index.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/db/src/legacy/index.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/db/src/legacy/prompt-runs.ts` | `0b3c04e:packages/db/src/prompt-runs.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/db/src/legacy/subscriptions.ts` | `0b3c04e:packages/db/src/subscriptions.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/db/src/legacy/task-queue.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/db/src/legacy/transcripts.ts` | `0b3c04e:packages/db/src/transcripts.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/db/src/prompt-runs.ts` | `0b3c04e:packages/db/src/prompt-runs.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/db/src/subscriptions.ts` | `0b3c04e:packages/db/src/subscriptions.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/db/src/task-queue.ts` | `0b3c04e:packages/db/src/task-queue.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/db/src/transcripts.ts` | `0b3c04e:packages/db/src/transcripts.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/task-queue/src/RegistryInspection.service.ts` | Introduced by this change | Optional read-only count schema and callback contract; no replaced legacy guard or owned resource. |
| `packages/task-queue/src/Classifier.model.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/task-queue/src/Events.model.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/task-queue/src/Executor.model.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/task-queue/src/LegacyTiming.service.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/task-queue/src/OutputProbe.layer.ts` | `21d6718:packages/task-queue/src/api/index.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/task-queue/src/OutputProbe.service.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/task-queue/src/Persist.model.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/task-queue/src/ProcessControl.driver.ts` | `21d6718:packages/task-queue/src/process/pid-start-time.ts`; `21d6718:packages/task-queue/src/process/kill-process-tree.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/task-queue/src/ProcessControl.model.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/task-queue/src/ProcessControl.service.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/task-queue/src/Projection.model.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/task-queue/src/QueueRandom.layer.ts` | `21d6718:packages/task-queue/src/api/index.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/task-queue/src/QueueRandom.service.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/task-queue/src/QueueTimers.layer.ts` | `21d6718:packages/task-queue/src/api/index.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/task-queue/src/QueueTimers.service.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/task-queue/src/SourceAdmission.layer.ts` | `21d6718:packages/task-queue/src/source-admission.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/task-queue/src/SourceAdmission.service.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/task-queue/src/Task.model.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/task-queue/src/TaskEvents.layer.ts` | `21d6718:packages/task-queue/src/events/index.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/task-queue/src/TaskEvents.service.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/task-queue/src/TaskExecutor.layer.ts` | `21d6718:packages/task-queue/src/executor/router.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/task-queue/src/TaskExecutor.service.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/task-queue/src/TaskPersistence.layer.ts` | `21d6718:packages/task-queue/src/persist/memory.ts`; `21d6718:packages/task-queue/src/persist/sqlite.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/task-queue/src/TaskPersistence.service.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/task-queue/src/TaskQueue.errors.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/task-queue/src/TaskQueue.layer.ts` | `21d6718:packages/task-queue/src/api/index.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/task-queue/src/TaskQueue.model.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/task-queue/src/TaskQueue.service.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/task-queue/src/TaskStore.layer.ts` | `21d6718:packages/task-queue/src/store/index.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/task-queue/src/TaskStore.service.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/task-queue/src/classifier/index.ts` | `21d6718:packages/task-queue/src/classifier/index.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/task-queue/src/complete.ts` | `21d6718:packages/task-queue/src/complete.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/task-queue/src/download-identity.ts` | `21d6718:packages/task-queue/src/download-identity.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/task-queue/src/events/index.ts` | `21d6718:packages/task-queue/src/events/index.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/task-queue/src/executor/index.ts` | `21d6718:packages/task-queue/src/executor/index.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/task-queue/src/fsm/index.ts` | `21d6718:packages/task-queue/src/fsm/index.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/task-queue/src/index.ts` | `21d6718:packages/task-queue/src/index.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/task-queue/src/persist/Rows.model.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/task-queue/src/persist/Sql.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/task-queue/src/persist/index.ts` | `21d6718:packages/task-queue/src/persist/index.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/task-queue/src/process/ProcessRegistry.layer.ts` | `21d6718:packages/task-queue/src/process/registry.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/task-queue/src/process/ProcessRegistry.service.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/task-queue/src/process/Watchdog.layer.ts` | `21d6718:packages/task-queue/src/process/watchdog.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/task-queue/src/process/Watchdog.service.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/task-queue/src/process/index.ts` | `21d6718:packages/task-queue/src/process/index.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/task-queue/src/projection/index.ts` | `21d6718:packages/task-queue/src/projection/index.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/task-queue/src/scheduler/RetryScheduler.layer.ts` | `21d6718:packages/task-queue/src/scheduler/retry-scheduler.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/task-queue/src/scheduler/RetryScheduler.service.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/task-queue/src/scheduler/Scheduler.layer.ts` | `21d6718:packages/task-queue/src/scheduler/scheduler.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/task-queue/src/scheduler/Scheduler.service.ts` | Introduced by port | New declaration/helper; inspected for added runtime guards, cleanup and fork registration. |
| `packages/task-queue/src/scheduler/index.ts` | `21d6718:packages/task-queue/src/scheduler/index.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/task-queue/src/schemas.ts` | `21d6718:packages/task-queue/src/schemas.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/task-queue/src/source-admission.ts` | `21d6718:packages/task-queue/src/source-admission.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/task-queue/src/types.ts` | `21d6718:packages/task-queue/src/types.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/task-queue/src/util/min-heap.ts` | `21d6718:packages/task-queue/src/util/min-heap.ts` | Expression/lifetime tables above; compared mapped implementation. |
| `packages/task-queue/src/util/sha256.ts` | `21d6718:packages/task-queue/src/api/index.ts` | Expression/lifetime tables above; compared mapped implementation. |
