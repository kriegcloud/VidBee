# Desktop foundation amendment: preservation, delivery and operation ownership

**Status:** third revision for architect review. The architect will review, change and own these decisions. This amendment defines shared work for phase 9.0; it does not establish production implementation acceptance.

**Target:** `docs/effect-port/design/desktop-foundation-amendment.md`.

**Relationship to the approved foundation:** retain Electron IPC, `effect/rpc`, whole-message `RpcSerialization.json`, acknowledged streams, authenticated document generations, AtomRpc clients and the shared renderer runtime. This amendment replaces the foundation’s incomplete conventions for response dispatch, registration, observation preservation, invocation lifetime, accepted operations, overflow and recovery.

**Evidence baseline:** installed Effect 4.1.4 at `~/YeeBois/workstation-apps/worktrees/VidBee/port-desktop-foundation`. Source references below are repository-relative. `M/` means `apps/desktop/src/main/`, `R/` means `apps/desktop/src/renderer/src/`, and `S/` means `apps/desktop/src/shared/`.

**Scope of this revision:** local probes and the supplied copies at `designs/9.1/DESIGN.md` through `designs/9.5/DESIGN.md`. Repositories remained read-only. No network access, application launch, additional agent or coding CLI session was used.

## 1. Decisions and preservation boundary

Phase 9.0 implements each mechanism once. Phases 9.1–9.5 provide concrete schemas, operation dependencies, publisher policies, consumer recovery policies and application-specific lifetime tests.

| Mechanism | Adopted contract |
| --- | --- |
| Observable property presence | Transparent `RpcOptional`, `RpcValue` and `RpcUndefined` codecs |
| Retained permissive observations | Tagged recursive encoding, separate from authored validation and presentation interpretation |
| Unary completion | Invocation-correlated `Completion`, including application failure and per-operation family cuts |
| Renderer execution | Direct invocation-owned client Effects by default; optional fresh private result atoms |
| Subscription readiness | One first element, `Registered {token, epoch}`, after failure-atomic installation |
| Renderer response dispatch | Bounded per-request workers; shared receive drain never awaits stream queue admission |
| Subscription termination | Correlated Protocol control path that works while RpcServer is waiting for Ack |
| Publication | Immutable admission separately at each recipient’s old send point |
| Accepted work | Application-owned operation handle, persistent originating account, explicit logical completion and separately observable cleanup release |
| Transport repair | Opaque attempt identity and finite metadata |
| Existing consumer hydration | Preserve each consumer’s overlap and acceptance rules |
| Synchronous compatibility | Pre-admitted retained fiber, revocation before interruption, narrow cleanup authority and bounded quarantine |
| Notification publication | Shared `DesktopNotifications` sink with explicit recipients |
| Original failures | Main-only carrier; boundary-specific mappings |

The amendment introduces finite-capacity and delivery failures on the new path. It does not authorize changing existing application races, callback multiplicity within admitted capacity, acknowledgement boundaries, cancellation checks, partial commits or cleanup precedence.

There is no `Applied` RPC, main-side renderer-application fence, second application queue, second database handle or durable transport event log.

## 2. Shared implementation ownership

Existing files retain their names. New files follow the approved companion conventions.

| Production files | Responsibility |
| --- | --- |
| `S/RpcField.model.ts` | Transparent presence codecs and typed dense-array admission |
| `S/RpcObservation.model.ts` | Recursive retained-value codec and `RpcObserved` |
| `S/DocumentDelivery.model.ts` | `Token`, `Registered`, `Subscription`, `Cut`, `Completion` |
| `S/DocumentDelivery.errors.ts` | Registration, delivery, overflow, capacity and cleanup failures |
| `M/ipc/DocumentSubscriptions.service.ts`, `.layer.ts` | Registration acquisition, active identity, replacement and closure |
| `M/ipc/DocumentDelivery.service.ts`, `.layer.ts` | Publication sequences, terminal arbitration and delivery accounting |
| `M/ipc/ElectronRpcServer.layer.ts` | Main Protocol adaptation, including correlated forced termination |
| `R/transport/ElectronRpcClient.layer.ts` | Bounded response dispatch and terminal control adaptation |
| `R/transport/DocumentDelivery.service.ts`, `.layer.ts` | Application watermarks, invocation gates and retirement |
| `R/runtime/RendererInvocation.entry.ts` | Document invocation owner, startup handshake and Promise bridge |
| `R/runtime/Invocation.atoms.ts` | Optional private result-atom adapter |
| `M/runtime/ApplicationOperations.service.ts`, `.layer.ts` | Accepted work, reservations, cleanup ownership and shutdown |
| `R/runtime/StreamRecovery.atoms.ts` | Transport repair identities, bounded metadata and consumer policy bindings |
| `M/lib/DesktopNotifications.service.ts`, `.layer.ts` | Shared targeted notification sink |
| `M/lib/OriginalFailure.errors.ts` | Main-only original-failure carrier |
| `M/lib/JsonSyntax.service.ts` | Injected syntax-preserving primitive contract |
| Explicit compatibility parser implementation | Native parser primitive and its standards/removal disposition |
| `M/lib/SynchronousHost.service.ts` | Qualified synchronous primitives, revocable authority and narrow cleanup capabilities |
| Compatibility entrypoints | Warmed synchronous execution, retained-fiber ownership and drainage |

Capability-specific delivery modules bind families, dependencies and reducers to these services. They do not create another transport ledger, registration owner or application fence.

One integration writer owns shared bootstrap, preload, RPC composition, renderer entry/layout, declarations and ownership manifests.

## 3. Identities, envelopes and errors

### 3.1 Common declarations

The shared envelope forms remain:

```ts
export const Token = S.Struct({
  document: S.String,
  client: S.String,
  generation: S.Int,
  family: S.String,
  serial: S.Int
})

export const Registered = S.TaggedStruct("Registered", {
  token: Token,
  epoch: S.String
})

export const Cut = S.Struct({
  token: Token,
  epoch: S.String,
  through: S.Int
})

export const Subscription = <A extends S.Constraint>(value: A) =>
  S.Union([
    Registered,
    S.TaggedStruct("Observation", {
      token: Token,
      epoch: S.String,
      sequence: S.Int,
      value
    })
  ])

export const Completion = <
  A extends S.Constraint,
  E extends S.Constraint
>({
  success,
  error
}: {
  readonly success: A
  readonly error: E
}) =>
  S.Struct({
    exit: S.Union([
      S.TaggedStruct("Success", { value: success }),
      S.TaggedStruct("Failure", { error })
    ]),
    cuts: S.Array(Cut)
  })
```

Each exported schema has its same-name schema-derived type alias in production.

Tokens are main-issued identities, checked within authenticated transport context. Their fields do not confer authority. A token from another logical client, generation or document is invalid even if its family matches.

`epoch` identifies the application-service lifetime. It is independent of document generation, registration serial, catalog revision and entity sequence.

Counters are nonnegative safe integers. Exhaustion fails visibly; counters never wrap.

### 3.2 Unary error mapping

Every capability unary declaration uses:

```ts
Rpc.make("Capability.Operation", {
  payload: OperationPayload,
  success: Completion({
    success: OperationResult,
    error: OperationError
  }),
  error: DeliveryError
})
```

The mapping is:

1. The application service returns its ordinary result or main-only failure.
2. The RPC adapter captures the application Exit.
3. Expected application failures are mapped once into the declared public `OperationError`, including its user-visible message.
4. Both successful and failed application exits acquire the operation’s cuts.
5. The renderer waits for those cuts, then exposes the inner result or application failure.
6. Registration, delivery and transport failures use the outer failure path.

An ordinary application failure must not escape through the outer error channel and thereby bypass its cuts.

False, null, undefined, empty arrays and application result objects remain successful values where they are successful today. A required result that distinguishes undefined uses the shared required value/undefined codec.

Main application service contracts expose inner application results. They must not accidentally derive `Effect<Completion<…>>` from the revised RPC group. A schema-derived helper can extract the `Success.value` type for those contracts.

Streams use `Subscription(Event)` and a declared outer union containing their application stream error and `DeliveryError`.

## 4. Preservation codecs and the census

### 4.1 Presence

`RpcOptional(field)` preserves four distinct states:

| Application property | Encoded property | Decoded application property |
| --- | --- | --- |
| Omitted | Omitted | No own property |
| Own undefined | `RpcUndefined` | Own undefined |
| Null | `RpcValue(null)` | Own null |
| Defined value | `RpcValue(encoded value)` | Own decoded value |

The `RpcValue` branch rejects undefined even when `field` is `S.Unknown`. Otherwise JSON derivation can select the defined branch and convert undefined to null.

Markers are interpreted only at declared codec boundaries. Marker-shaped retained objects remain ordinary data inside the retained-value encoding.

This distinction is required by subscription patches, account projections, thread patches and returned observations subsequently submitted to operations. Installed `SchemaAST` maps undefined to JSON null; ordinary optional-nullable JSON is insufficient.

### 4.2 Authored, observed and presentation contracts

Each capability separates:

- **Authored input:** deliberately constructed values and their validation.
- **Observed output:** what existing interpretation and public projection actually return.
- **Presentation interpretation:** the guarantees one consumer needs from an observation.

A presentation view must not become a narrower serialization format for the retained observation.

`ObservedValue` encodes a fully tagged recursive tree:

| Value | Representation |
| --- | --- |
| Undefined and null | Distinct tags |
| String and boolean | Distinct tags and values |
| Number | Canonical token preserving `-0`, `NaN` and infinities |
| Bigint | Separate canonical token |
| Array | Ordered child nodes |
| Object | Ordered key/node entries |

The codec rejects cycles, duplicate encoded object keys, unsupported prototypes/descriptors and noncanonical numeric tokens. Node, depth and byte limits apply during traversal.

Objects preserve own enumerable key order. `__proto__` is data. Retained graphs are not reconstructed through closed DTOs.

`RpcObserved(view)` validates the type-side guarantees of a view while using `ObservedValue` for serialization. It does not preserve the view’s original codec transformations. That distinction is deliberate and must be reflected in evidence claims.

### 4.3 Arrays

Admitted arrays are dense data arrays with no extra own properties. The shared check independently validates array identity, length, every index, descriptors and own-key count.

Holes, accessor indices, nonenumerable indices, symbols and extra array properties fail on the new path. They are never silently removed.

Legacy sends retain their original serialization. New-path array rejection cannot suppress legacy delivery.

### 4.4 Census requirement and current evidence

The permanent census must use the selected operation’s complete declaration, including payload placement, `Completion` and subscription envelopes where applicable. It compares:

- Primitive identity with `Object.is`.
- Own-property presence.
- Observable retained-object key order.
- Array identity, length and each index’s presence.
- Nested retained values.
- The next outbound operation when an observation is returned to main.

A negative control must mutate the tested operation’s serialization path.

The v2 evidence is accurately described as **actual projector and selection values through a proposed observation wrapper**. It did not establish exact revised operation-codec coverage.

The v3 census adds three exact proposed declarations:

| Declaration | Tested shape |
| --- | --- |
| `Downloads.GetActiveDownloads` | `{token}` payload; `Completion` containing the observed active-list view |
| `History.GetHistory` | `{token}` payload; `Completion` containing the observed history-list view |
| `Downloads.StartDownload` | Typed `{id, options}` envelope; observation encoding at retained metadata subgraphs; Boolean inner completion |

For start-download, the existing options fields remain typed. The retained fields `title`, `thumbnail`, `description`, `channel`, `uploader`, `viewCount`, `duration` and `selectedFormat` use `RpcOptional(ObservedValue)`.

The probe imports actual projectors and actual renderer format selection. It carries selected metadata, nested own undefined and negative zero through the start request. A mutation replacing the tested active-download success codec with a closed ID-only DTO is detected.

Authored envelope field order follows its schema. Retained subgraphs preserve their observable order.

This establishes those three proposed declarations. It does not establish every capability codec or the production download handler.

## 5. Invocation ownership and startup

A result belongs to one invocation. Shared Atom state is a publication destination, not a correlated completion channel.

Installed AtomRpc caches mutations by tag. Concurrent Atom execution can join running fibers, and atom-react Promise setters observe a settled atom result rather than the result belonging to a particular write. Neither shared default mutation atoms nor shared concurrent result atoms satisfy independent acknowledgements.

### 5.1 Default execution

`RendererInvocation.entry.ts` executes a direct client Effect once per call. A private result atom is optional when UI needs observable result state.

Each invocation reserves its slot and registers its settlement callback before startup. Application execution is held behind a Deferred start gate:

```text
reserve invocation
→ register cancellation and settlement
→ create fiber waiting on start gate
→ install fiber in invocation record
→ install Exit observer
→ release start gate
→ execute application/client Effect
```

A document closure can therefore observe only an installed execution fiber. If closure occurs before the gate opens, that fiber is interrupted before application execution. If application execution closes the document reentrantly, cancellation reaches the already installed fiber.

Settlement is idempotent. Immediate success, immediate failure, cancellation and document closure remove the pending record exactly once.

### 5.2 Teardown

Document termination:

1. Closes invocation admission.
2. Settles pending callers with the terminal delivery reason.
3. Interrupts their installed delivery fibers.
4. Disposes AtomRegistry after callers have been settled.
5. Retains separately owned application/native work under its actual-completion owner.

Components borrow the document registry. StrictMode detach/reattach is not document destruction. Permanent root departure, document replacement and HMR replacement explicitly close the old owner.

Component unmount follows the existing Promise callback policy. It does not automatically cancel accepted main work or add new late-result guards.

The v3 probe uses real ManagedRuntime and AtomRegistry, including a real `getResult` wait. It also executes immediate success/failure and closure from a synchronous effect prefix followed by a Deferred. V2 performs a late write in the latter sequence; v3 does not.

## 6. Registration and failure-atomic acquisition

Every subscription’s first element is:

```text
Registered { token, epoch }
```

No capability-local `ready`, cached readiness flag or family-only latch substitutes for it.

### 6.1 Acquisition order

```text
reserve registration and terminal capacity
→ publish acquisition identity and finalizer
→ allocate bounded queue and accounting
→ install source listener using incremental ownership
→ verify acquisition remains live
→ expose Registered
→ drain observations
```

The queue exists before any installer callback can publish synchronously.

The installer contract is:

```ts
install(
  publish: (value: Event) => void,
  ownRelease: (release: () => void) => void
): void
```

After each acquisition step, the installer registers its release before performing the next fallible step. It must not register a listener and then perform fallible work before reporting that listener’s cleanup.

A foreign primitive that can throw after internally acquiring a resource must itself be failure-atomic or expose an acquisition API that makes cleanup available before that failure. The foundation cannot recover an unsubscribe closure the primitive never supplied.

If installation publishes synchronously and then fails, the attempt closes, registered releases run, queued observations are discarded, and `Registered` is never exposed.

Cleanup visits every registered release even if one release fails. Failed cleanup remains visible and owned; it cannot justify forgetting the remaining releases.

### 6.2 Active-token use

Required initial reads and readiness/flush commands carry the relevant tokens:

- Initial active/history reads carry the downloads token.
- Initial `ShareCapture.Ready` carries both capture tokens.
- Subscription, transcript, AI and account initial dependencies carry their declared family tokens.

Main validates exact active identity against authenticated transport ownership before dispatch. Unknown, closed, replaced, foreign-client and old-generation tokens fail with `RegistrationClosed`.

The renderer waits for `Registered` locally. Main does not admit a read and wait for an unidentified future registration.

Replacement closes the old registration first. Finalizers capture registration objects; stale finalizers cannot delete replacements.

Stream-registration capacity is reserved separately from ordinary unary execution.

The v3 acquisition regression registers a real callback, publishes synchronously and then throws. V2 retains that callback; v3 releases it.

## 7. Bounded response dispatch and correlated termination

### 7.1 Why the Protocol needs adaptation

Installed `RpcClient` creates a bounded queue for each stream. Its Chunk callback suspends in `Queue.offerAll` when that queue is full.

Therefore this receive loop is invalid:

```text
take next document response
→ await RpcClient response callback
→ take next response
```

A full stream queue can hold the loop before an unrelated unary Exit reaches its client.

Installed `RpcServer` also waits for the current Chunk’s Ack before pulling the source again. Failing the source queue alone cannot terminate that request while Ack is withheld.

Both behaviors are reproduced through the installed library.

### 7.2 Response workers

The physical document receive drain performs only validation, routing, bounded reservation and nonblocking queue admission. It never awaits a request’s client-queue admission.

Before forwarding an outbound Request, the renderer reserves its dispatch record and installs its worker under the document transport scope. Workers do not belong to an individual request-send scope: request cancellation must not destroy the worker needed to receive and release its terminal response.

There is:

- One ordered physical receive drain per document.
- One ordered response worker per admitted request.
- One reserved terminal-control worker per logical client.
- Bounded routing records, queues and terminal history.

Normal Chunk and Exit messages for one request pass through its worker in arrival order. Other request workers progress independently.

Worker count is bounded by admitted requests and streams. Queue entries and retained bytes are charged before admission. No callback starts an untracked per-message fiber.

Queue or byte exhaustion uses the declared subscription/client failure path. It does not suspend the shared drain or allocate an overflow list.

### 7.3 Forced subscription terminal

The narrow adapter adds a transport control envelope carrying:

- Authenticated session and logical-client routing.
- The original request ID, preserving its number/string representation.
- Correlated subscription identity.
- One encoded ordinary RPC failure Exit.

The adapter encodes that Exit with the actual RPC’s `Rpc.exitSchema` through `RpcSerialization.json.codecFor`. It does not patch Effect internals or invent a parallel application error format.

On main:

1. Subscription closure atomically revokes its token and selects the terminal outcome.
2. It enqueues a bounded terminal command to an already owned main control worker.
3. That worker encodes and sends the correlated terminal using reserved capacity.
4. It sends the installed server Protocol an Interrupt for the streaming request, releasing the Ack wait.
5. The adapter suppresses the server’s subsequent interruption Exit and late Chunks for that forced-terminal request.
6. Request execution and native cleanup remain separately accounted.

Normal completion and forced termination share one terminal arbiter. Whichever terminal outcome is committed first wins. An already committed normal terminal cannot be replaced by an overflow terminal; a committed forced terminal cannot be followed by another visible result.

On renderer:

1. The shared drain offers terminal control without waiting for the stream worker.
2. The logical-client control worker marks that registration ended and fails unsatisfied cuts.
3. It discards pending dispatcher data for that request.
4. It delivers the correlated typed Exit to RpcClient.
5. Only then does it interrupt and join any blocked data-dispatch worker.
6. It retires routing and releases storage that has actually been released.

Delivering Exit before interrupting the blocked worker matters: interruption must not replace the selected typed failure.

Installed Queue failure can leave buffered values in a closing queue. This design therefore does not depend on queue failure alone waking a blocked offer. The control worker owns interruption of the blocked dispatcher after installing the terminal Exit.

### 7.4 Failure scope, Eof and accounting

A per-stream overflow ends that subscription. It does not stop generation or unrelated requests.

If terminal encoding, reserved control admission, physical send or local client termination fails, the adapter escalates to logical-client termination. Physical connection failure retains the foundation’s connection-wide scope.

Eof closes new request admission while allowing existing Ack, Interrupt and terminal work to drain. Forced stream termination still releases the server request so Eof can finish.

Terminal history remains bounded and cannot retire while late server output could be mistaken for a new request. Capacity exhaustion fails the logical client rather than keeping unlimited tombstones.

Accounting distinguishes physical frames, dispatcher queues, in-progress writes, RpcClient-retained decoded values and consumer-owned observations. Transfer between them has no uncharged interval. Successful queue admission is not proof of renderer application or release of the decoded value.

The local probe uses smaller bounds to force pressure: 32 request workers, four client control workers, four queued dispatch frames per request, and separate data/control frame and byte allowances. Those are probe limits, not replacements for the foundation’s production ceilings.

The probe establishes independent replies with an actually full RpcClient queue. The overflow test uses the bounded subscription owner, withholds the first Ack permanently, triggers overflow, receives the typed terminal, fails a dependent cut and completes Eof. It checks zero remaining dispatcher charges and request workers. Full production memory-ledger instrumentation remains an implementation gate.

## 8. Per-operation reply cuts

### 8.1 Publication boundary

Publication occurs when an immutable recipient observation is successfully admitted at the output send replacing that recipient’s old `webContents.send`, after existing projection/coalescing.

It is not raw progress arrival, coalescer insertion or eventual physical Chunk delivery.

An admitted observation can therefore contribute to a cut while still behind Ack.

### 8.2 Capture and application

Each unary declares its dependency families. At successful or failed application exit, main captures their current published sequences and returns them in `Completion`.

Main never waits for renderer application or Ack before returning that completion.

The renderer applies observations using the existing synchronous consumer prefix. After that prefix completes, it advances the token’s application watermark. Detached continuations start according to their old policy; their eventual completion is not part of the watermark.

Only the invocation whose cuts remain unsatisfied waits.

RPC Ack means queue admission, not application. No application receipt is sent to main.

### 8.3 Closure and retirement

- Termination fails unsatisfied cuts for that token.
- Already satisfied cuts remain satisfied while their records are retained.
- Replacement cannot satisfy an old token’s cut.
- Empty cuts complete immediately.
- Client termination fails that client’s pending gates.
- Reload destroys old-generation state.
- Retirement waits for requests that may still receive or reference a cut.
- History exhaustion fails the offending client.

A missing live registration contributes no optional cut. Closure of a registration explicitly required by an operation cannot be used to bypass that operation’s token requirement.

Transcript source selection remains the motivating discriminator: earlier ASR/caption observations must be applied before the selection reply is exposed, preserving the existing broadcast-before-return boundary without a main-side fence.

## 9. Publication and overflow

### 9.1 Preserve the legacy exception boundary

At each recipient’s original send point:

1. Preserve the existing source-specific listener and recipient order.
2. Invoke a retained legacy send with its original value and exception boundary.
3. Independently snapshot, encode, reserve and admit the migrated route for that recipient.
4. Contain new-path codec or capacity failures within their declared subscription/client scope.
5. Commit the migrated publication sequence only after successful admission.

No new codec runs for a legacy-only recipient.

For a recipient using both routes, a legacy send failure retains its original propagation before successful new publication is claimed for that recipient. Earlier recipients remain delivered.

New-path failure reporting must itself be nonthrowing. It cannot prevent a later legacy recipient from receiving an event that the old loop would have delivered.

| Publisher | Preserved order |
| --- | --- |
| Chat | In-process listeners, then windows |
| AI settings | Windows, then in-process listeners |
| Downloads | Raw synchronous listeners separately from coalesced renderer output |
| Transcript | Pending partial flush, automatic-skill hook, updated publication |
| Account notifications | Existing explicit recipients and catch boundaries |

Reentrant publication follows actual synchronous traversal. Sequences are not sorted afterward.

The regression publishes a decorated array accepted by legacy structured clone but rejected by the new observation codec. V2 suppresses legacy delivery; v3 contains the new-path failure and preserves the extra property on the legacy route.

### 9.2 Overflow scope

| Exhausted resource | Scope |
| --- | --- |
| Subscription pending entries | Subscription |
| Subscription retained bytes, including in-flight data | Subscription |
| Logical-client/document aggregate retention | Offending logical client |
| Cut/terminal-history metadata | Offending logical client |
| Physical connection | Existing connection scope |
| Temporary repair-attempt metadata | That repair attempt |
| Entity-watermark metadata | That recovery owner, with explicit stale/capacity failure |

Subscription overflow closes its token and uses the correlated terminal path. It never slides loss-sensitive data.

Copies remain charged until their actual owners release them. Closing a source queue does not release copies in RPC, renderer queues or native operations.

## 10. Application-owned operations

### 10.1 Published interface

The probe now implements this interface, including `accept({run})`, explicit completion and Effect-valued signals:

```ts
export interface OperationHandle<A, E> {
  readonly originAccount: string

  readonly grow:
    (bytes: number) => Effect.Effect<void, DeliveryError>

  readonly registerCleanup:
    (cleanup: Effect.Effect<void>) => Effect.Effect<void, DeliveryError>

  readonly complete:
    (exit: Exit.Exit<A, E>) => Effect.Effect<void, DeliveryError>

  readonly logical: Effect.Effect<Exit.Exit<A, E>>

  readonly released: Effect.Effect<void, DeliveryError>
}

export interface OperationOwner {
  readonly accept: <A, E>(options: {
    readonly originAccount: string
    readonly reserveBytes: number
    readonly run:
      (handle: OperationHandle<A, E>) => Effect.Effect<void>
  }) => Effect.Effect<OperationHandle<A, E>, DeliveryError>

  readonly closeAdmission: Effect.Effect<void>
  readonly drain: Effect.Effect<void, DeliveryError>
}
```

`released` now fails visibly with cleanup failure while the record remains retained and charged. An indefinite wait is not the sole representation of failed cleanup.

### 10.2 Admission and transitions

Acceptance reserves an application work slot, persistent originating-window/native slot and initial retention before executing the factory. Reservation failure starts no application work.

The owner inserts its active record before execution. It evaluates `run(handle)` inside `Effect.suspend`, so a synchronous factory throw enters the owned failure path.

| Transition | Result |
| --- | --- |
| Admission refused | Typed capacity failure; no factory execution |
| Factory throws or run defects before completion | Logical defect Exit; registered cleanup still runs |
| Run returns without `complete` | Logical `OperationIncomplete` defect; cleanup runs |
| First `complete(exit)` | Settles logical result once |
| Duplicate completion | Typed `AlreadyCompleted`; first result remains |
| Run defects after completion | Logical result remains; run failure is reported; cleanup still runs |
| Growth while open | Reserve before retaining |
| Growth refused | No additional retention; existing ownership remains |
| Cleanup registration while open | Accepted within cleanup count/byte limits |
| Run ends | Seal growth and cleanup registration |
| Registration after sealing | Typed `CleanupClosed` |
| Cleanup succeeds | Release actual charges and settle `released` successfully |
| Cleanup fails | Fail `released`; retain record, slots and charges |
| Shutdown | Close admission, apply existing operation cancellation policy, drain accepted ownership |

Cleanup registration and sealing use one serialized state transition. A racing registration is either included or refused; it cannot succeed without becoming owned.

The generic owner does not rewrite application cleanup precedence. An operation can register a composite cleanup Effect preserving its existing `finally` behavior and failure ordering.

Cleanup closures and records are themselves admitted under finite count and byte budgets. The probe allows at most 16 cleanup registrations per operation.

### 10.3 Resource transfer

Register cleanup before resources escape an acquisition stage.

Transfer requires an explicit receiving owner and its reservation before the operation relinquishes ownership. A registered cleanup closure can observe the completed transfer and avoid double cleanup. Accounting remains charged through the transfer boundary.

For image attachment, transfer occurs only after the complete successful save/publication boundary. `agent-chat-runner.ts` places save and broadcast in one try/catch. Broadcast failure restores the in-memory image list and removes imported files even when save succeeded. The amendment preserves that partial-commit behavior.

### 10.4 Accepted continuation policy

| Work | Required continuation ownership |
| --- | --- |
| Download start | Existing startup, cancellation checks, expansion, hydration and admission chain |
| Subscription refresh | Preserve detached profile/all acknowledgement and awaited feed refresh |
| Transcript import/edit/export | Existing accepted mutation and cleanup boundaries |
| Agent generation | Application run owner; existing explicit stop/quit |
| Image selection | Dialog, import, latest-thread reread, capacity check, save/publication or cleanup |
| Thread deletion | Remaining destructive stages, SQL deletion and publication |
| Card/paginated capture | Existing queued closure and native cleanup |
| Mermaid capture | Existing explicit signal and abort checks |
| Pi disposal | Cleanup ownership after logical execution completion |

Transport cancellation discards delivery interest according to this matrix. It does not become a new application cancellation source.

Agent active-run admission is released at logical completion, preserving admission of a second run while first-run disposal remains pending. Old cleanup uses attempt identity and cannot clear the newer run.

### 10.5 Shutdown

Close operation admission before draining. Providers remain available while accepted cleanup depends on them.

A bounded shutdown wait may report retained operations and failed cleanup. It cannot mark them released, erase charges, replay uncertain native work or dispose dependencies still needed by cleanup.

## 11. Transport repair and consumer overlap

### 11.1 Opaque repair identity

`begin(epoch)` returns an opaque attempt identity. Completion requires that exact identity and epoch:

```ts
const attempt = repair.begin(epoch)

// Later:
if (repair.accept(attempt, epoch)) {
  applyRepair(result)
}
```

Replacement invalidates the old attempt even within the same epoch. Success, failure, cancellation, replacement and exhaustion retire its temporary touched metadata.

The identity belongs specifically to transport repair. It is not a universal guard around every existing consumer read.

### 11.2 Preserve existing consumer races

`use-agent-task-events.ts` permits overlapping focus/online hydrations. Each result can apply unless unmounted. Its identity comparison protects clearing the current touched set; it does not reject the older result.

V3 preserves that behavior. A source-extracted probe starts A and B, applies B’s newer result, then A’s older result, and observes both applications.

The same rule applies to subscription late-list overwrites and unguarded transcript partial restoration. Existing guarded detail/cue/model consumers retain their own guards.

Transport repair may replace a prior repair. Ordinary consumer reads retain their independently specified acceptance behavior.

### 11.3 Separate metadata domains

| Metadata | Limit and exhaustion |
| --- | --- |
| Repair attempts | One current transport-repair attempt per consumer; at most 16/document |
| Touched IDs per attempt | 4,096 entries and 512 KiB |
| Entity watermarks per recovery owner | 4,096 entries and 512 KiB |
| Document recovery aggregate | 32,768 entries and 4 MiB |

Temporary touched-set exhaustion invalidates that attempt.

Entity-watermark exhaustion is separate: the owner becomes explicitly stale/capacity-failed and follows its bounded authoritative recovery policy. It cannot clear watermarks and continue accepting potentially old events as current. If the required state cannot fit, the consumer remains visibly failed rather than entering an unlimited retry loop.

Thread sequence, global catalog revision and entity watermarks remain distinct. Conversation repair alone cannot recover deletion or approval changes in another thread. History, per-download lists and task activity each re-list their affected catalog.

Transient logs and commands are not reconstructed or replayed.

## 12. Synchronous compatibility and bounded retained authority

### 12.1 Qualified execution

A synchronous facade uses one already acquired, warmed runtime.

Its closure may contain qualified synchronous filesystem/path/secret primitives, borrowed synchronous store/SQL work with proven reentry, pure interpretation and synchronous listener prefixes.

It cannot lazily acquire Layers, await dialogs/HTTP/process work, yield, sleep or contend for an unavailable permit.

### 12.2 Admission and revocation order

Before invoking the factory, reserve a finite cleanup/quarantine slot and its retention charge.

```text
reserve slot and retention
→ create revocable call authority
→ execute under synchronous scheduler
→ flush and inspect Exit
→ revoke ordinary authority
→ if incomplete, request interruption
→ flush interruption/finalizers
→ retain and drain actual completion
```

Revocation occurs before interruption. Otherwise an interruption finalizer can mutate through authority that is still live.

Every ordinary host operation checks the call authority at execution. This also prevents a resumed accidentally uninterruptible continuation from performing a later qualified host mutation.

### 12.3 Narrow cleanup authority

Cleanup receives only captured releases for already acquired resources. It does not receive a generic host executor or a new admission capability.

Cleanup authority can close a captured handle, remove operation-owned temporary files or release an existing reservation. It cannot acquire new work, publish application mutations or write unrelated settings.

Failed cleanup remains retained and charged, with a visible `CleanupFailed` drain result.

### 12.4 Bounds

The production proposal reserves at most:

- 64 synchronous cleanup/quarantine slots per persistent window account.
- 1,024 application-wide.
- A declared conservative retention charge before each call, subordinate to existing window/application bytes.
- Eight captured cleanup releases per qualified call.

The probe uses two slots and a 4 KiB logical retention charge per slot to force exhaustion. This is an accounting test, not a measured heap-size claim.

Exhaustion refuses the next call before its factory executes. A never-completing uninterruptible fiber retains its finite reservation.

Arbitrary unguarded JavaScript effects cannot be revoked by this mechanism. Such code is outside the qualified synchronous-host contract.

## 13. Shared notifications, detached callbacks and original failures

### 13.1 Notification sink

`DesktopNotifications` accepts explicit recipients:

```ts
type Recipients =
  | { readonly kind: "all-live-windows" }
  | { readonly kind: "active-main" }
  | { readonly kind: "window"; readonly account: string }
```

`AccountNotifications` is a domain alias or adapter over that sink. It owns no independent recipient map, queue or state.

Cloud transcription retains its all-live-window send before successful return and its second outer-finalizer send. Pre-try session failure acquires no new finalizer notification. Deep-link/auth publication retains active-main targeting and existing pending booleans.

No transport coalescing removes either successful Cloud publication.

### 13.2 Detached consumption and auth retention

For detached callbacks, execute synchronous prefixes in source order and independently own their continuations. Two auth events still open Settings and initiate two user reads before either read finishes.

The existing effective document-lifetime auth callback multiplicity is preserved within admitted capacity. Physical stream cleanup does not silently repair the old wrapper-removal leak.

Logical auth registrations have their own admission:

- At most 256 callbacks/document.
- At most 256 KiB/document of conservatively charged retained callback state.
- Reserve before registration.
- Refuse additional registration visibly on exhaustion.
- Never evict an existing callback to make room.
- Clear callbacks and charges on document destruction.

Detached continuations additionally consume invocation/operation admission. Token limits do not substitute for callback limits.

### 13.3 Original failures and JSON syntax

Main-only failure carriers retain the actual original thrown value and required diagnostic text. They never cross RPC or enter persisted public diagnostics.

| Boundary | Mapping |
| --- | --- |
| Foreign primitive → strict main | Capture original value and text |
| Package → application | Read actual text fields, including `legacyMessage` |
| Main → RPC | Map declared public fields once |
| Main → legacy invoke/facade | Unwrap recognized carrier at the original boundary |
| Completion → renderer | Await cuts, expose populated public message |
| MCP/HTTP | Preserve each surface’s original envelope and prefix position |

Do not unwrap arbitrary objects merely because they contain `original` or `cause`.

`JsonSyntax` remains a narrow injected compatibility primitive where native syntax diagnostics must be preserved. Effect’s generic JSON syntax issue cannot reconstruct the discarded parser exception.

Metadata retains full-output parsing, the existing first eligible line fallback and its original prefix boundary. Naming the parser `.driver.ts` grants no standards exemption. Its final strict-graph disposition remains explicit under the PLAN.

## 14. Admission and implementation gates

Retain the approved foundation’s session, client, request, stream, frame, persistent-window/native and application ceilings.

Additional records remain subordinate to those accounts:

| Resource | Proposed bound |
| --- | --- |
| Pending renderer invocations | 256/client; 1,024/document |
| Dependency families per operation | 16 |
| Cut metadata | 4 KiB/completion; 4 MiB/document |
| Active/retired registration watermarks | 1,024/client; 4,096/document; 2 MiB/document |
| Registration storage | Reserve before acquisition, independently of unary execution |
| Response workers | One per admitted request, bounded by request/stream admission |
| Terminal-control workers | One per admitted logical client |
| Terminal records | Bounded within live/retired request accounting |
| Repair metadata | Section 11 |
| Logical auth callbacks | Section 13 |
| Quarantined synchronous work | Section 12 |

Encoded bytes, decoded retained values, native buffers, closures and physical copies have separate charges. Measurements must confirm conservative formulas before cutover.

Production acceptance still requires:

1. Strict source/test graphs and textual standards checks.
2. Supervision of every drain and worker.
3. Admission, terminal-race, duplicate-ID, Eof, reload and retirement tests.
4. Instrumented transfer of all retention charges.
5. Real React StrictMode/provider/HMR integration.
6. Actual native dialog, capture, filesystem, deletion and Pi cleanup scenarios.
7. Every capability’s operation dependency ledger and complete codec corpus.
8. Packaged Linux launch and unchanged goldens.
9. Separate reporting of hosted, authenticated and other-platform evidence.

A passing local mechanism probe is not any of those broader gates.

## 15. Executed evidence

The final verification receipt is `probes/v3/verification.json`. All four commands exited zero:

```sh
node probes/node_modules/tsrs/bin/tsrs -p probes/v3/tsconfig.json
node probes/v3/run.mjs
node probes/v3/consumer-overlap.mjs
bun probes/v3/census.mjs
```

The TypeScript check extends the repository base configuration with unchanged diagnostic severities. It checks the TypeScript probe modules. It does not typecheck the JavaScript harnesses or establish the complete production textual standards gate.

| Artifact | Evidence |
| --- | --- |
| `probes/v3/Transport.mjs` | Installed RpcServer/RpcClient Protocol pair, ordered physical receive drain, bounded dispatch workers and reserved terminal workers |
| `probes/v3/run.raw.txt` | V2/v3 differential outcomes and additional lifecycle/accounting assertions |
| `probes/v3/typecheck.raw.txt` | Empty diagnostics |
| `probes/v3/consumer-overlap.raw.txt` | Actual source-extracted hydration overlap trace |
| `probes/v3/Downloads.rpc.mjs` | Three exact proposed revised operation declarations |
| `probes/v3/census.raw.txt` | Actual projector/selection values through those declarations and mutation of the tested success path |
| `probes/v3/design-edits.json` | Applied local capability-document edit ledger |
| `probes/v3/*.status.txt` | Saved exit statuses |

The differential harness preserves v2 modules and executes their reported failures as expected negative outcomes. The corresponding fixed expectations hold for v3:

| Regression | V2 outcome | V3 outcome |
| --- | --- | --- |
| Full renderer queue, same/other-client unrelated replies | Both blocked behind shared receive callback | Both progress |
| Source overflow while first Ack remains withheld | No terminal before Ack | Correlated typed terminal, dependent-cut failure and Eof completion |
| Document closes in synchronous execution prefix | Late write occurs | No late write |
| Listener registers, publishes, then installer throws | Callback retained | Callback released |
| Operation factory throws after reservation | 20 bytes leaked | Owned failure, cleanup and release |
| Same-epoch repair replacement | Old completion accepted | Old opaque identity rejected |
| New codec rejects before later legacy recipient | Legacy recipient receives nothing | Legacy recipient receives original cloneable value |
| Interruption finalizer uses ordinary host authority | Mutation occurs | Authority already revoked |

Additional passing checks cover immediate invocation success/failure, real AtomRegistry teardown, operation incomplete/defect/domain exits, duplicate completion, held cleanup, cleanup failure retention, growth refusal, shutdown admission, quarantine exhaustion, narrow cleanup after revocation, failed cleanup retention, auth callback count/bytes and selected codec omission detection.

The old consumer overlap test is a source-level policy differential. The three-operation census is exact proposed-declaration evidence. Neither is described as packaged application proof.

## 16. Edits applied to capability designs

Only amendment consequences were applied to the supplied local copies.

| File | Sections | Applied edits |
| --- | --- | --- |
| `designs/9.1/DESIGN.md` | Introduction; §2 foundation/main manifests; §3 field encoding and census; §5 declarations/registration/overflow; §6 application types; §13 prerequisites | Assigned shared implementations to 9.0; canonicalized shared paths; explicitly allocated `M/lib/import-local-media.ts` to 9.1, including the in-loop transcript hook; added exact selected census declaration rules; made unary results `Completion` with `DownloadsFailure` inside and `DeliveryError` outside; wrapped stream declarations; replaced family latches with active tokens; added downloads tokens and both capture tokens; corrected overflow scope; made application-derived types expose inner results; changed the foundation lane to prerequisite adoption. |
| `designs/9.2/DESIGN.md` | §5 RPC declarations/Changes policy; §7 invocation; §13 prerequisites | Wrapped all seven unary declarations with `Completion` and mapped `SubscriptionOperationError` inside; added initial-list token payload; wrapped Changes with the shared subscription envelope; replaced client-wide stream-overflow wording with subscription versus aggregate-client failure; replaced the private-atom-default implementation recipe with direct invocation-owned Effects and the optional document-owned adapter; assigned generic implementation to 9.0. |
| `designs/9.3/DESIGN.md` | §2 external/shared/renderer ownership; §5 RPC/registration/ordering; §6 application types; §7 invocation; verification references | Wrapped all 26 unary declarations with `Completion`, preserving `TranscriptOperationError` inside; wrapped three streams; replaced `ready` with `Registered`; removed the transcript-local ledger and main-send fence; bound transcript policy to shared `DocumentDelivery`; corrected application result extraction; assigned `social-profile-manager.ts` to 9.1; stated that 9.4 implements capability/management hosts and 9.5 performs final delegation wiring; assigned `AgentResponseContent` to 9.1 and the share dialog to 9.4; replaced stale shared-provider assumptions and invocation names. |
| `designs/9.4/DESIGN.md` | §2 renderer manifest; §5 unary/stream/publication contracts; §8 ownership references | Applied `Completion` and explicit `AiOperationError`/`DeliveryError` mapping to every unary in the operation census; replaced readiness with `Registered`; corrected the acquisition example; replaced whole-window-loop publication with per-recipient publication and contained migrated failures; explicitly allocated `TranscriptShareImageDialog.tsx` to 9.4 while retaining `AgentResponseContent` and capture presentation with 9.1; added canonical shared imports and lifecycle requirements. |
| `designs/9.5/DESIGN.md` | §2 notification disposition; §5 RPC/notification/stream/auth contracts; §6 service composition | Wrapped every MCP/account unary declaration with `Completion`, using its existing domain error inside and `DeliveryError` outside; wrapped both account streams; made `AccountNotifications` a stateless domain adapter over `DesktopNotifications`; corrected subscription versus aggregate-client overflow wording; assigned registration implementation to 9.0; added independent count/byte admission for retained logical auth callbacks and admission for detached continuations. |

Across all five copies, §5 now states the same boundary mapping: application tables describe inner results; main maps original failures once; both application exits carry cuts; renderer adapters expose ordinary results/errors after those cuts; delivery failures remain distinct.

The ownership allocation is now consistent:

| Surface | Implementation owner | Integration responsibility |
| --- | --- | --- |
| Shared foundation primitives | 9.0 | One shared composition writer |
| `social-profile-manager.ts` | 9.1 | Consumers inject its existing owner |
| Serial `import-local-media.ts` orchestrator | 9.1 | 9.3 supplies the in-loop transcript capability |
| Player state/lifecycle and capture presentation | 9.1 | Transcript/conversation data injected |
| Subtitle execution | 9.3 | Existing queue/executor composition |
| `AgentResponseContent.tsx` | 9.1 | 9.4 supplies artifact/state operations |
| `TranscriptShareImageDialog.tsx` | 9.4 | Foundation platform operation and 9.1 capture injected |
| Capability/management hosts | 9.4 | 9.5 owns final delegation wiring |
| Extension sessions, HTTP and SSE | 9.5 | Invoke existing capability owners |
| Account notification state/publication | Foundation `DesktopNotifications` | 9.5 domain alias; 9.3 producer integration |

## 17. REVIEW-2 disposition

| Finding | Disposition in v3 | Executed evidence and remaining boundary |
| --- | --- | --- |
| **1. Shared receive drain blocks unrelated replies** | **Addressed.** Shared drain performs bounded nonblocking routing; request workers own queue admission under the transport scope. | Actual full RpcClient queue blocks both unrelated replies in v2 and neither in v3. Dispatcher charges/workers release. Production supervision and complete decoded-value accounting remain implementation gates. |
| **2. Source failure cannot terminate stalled Ack wait** | **Addressed with a narrow Protocol adapter.** Source closure enqueues correlated terminal control; main interrupts the installed server request; renderer installs one typed Exit before interrupting blocked dispatch. | Actual subscription overflow with first Ack permanently withheld terminates in v3, fails its dependent cut and completes Eof. V2 remains pending. Production terminal arbitration, saturation and malformed-control tests remain owed. |
| **3. Reentrant invocation startup and partial listener acquisition** | **Addressed.** Start gate installs the fiber before application execution; installers register ownership incrementally. | V2 late write and retained listener reproduced. V3 prevents the write and releases the callback after synchronous publication followed by installation failure. |
| **4. Operation interface/prototype mismatch and factory leak** | **Addressed.** Probe implements the published `OperationOwner`; factory evaluation is suspended inside ownership; logical and cleanup outcomes are explicit. Image transfer boundary includes publication. | Factory leak reproduced in v2. V3 exercises incomplete return, defects before/after completion, domain completion, duplicate completion, growth, held/failed cleanup and shutdown. Real native continuations remain phase gates. |
| **5. Missing repair identity and overgeneralized replacement** | **Addressed.** Opaque identity applies to transport repair; consumer overlap remains consumer-specific; entity metadata has separate exhaustion. | Same-epoch old completion is accepted by v2 and rejected by v3. Actual source-extracted hydration applies B then A under the preserved consumer policy. Full entity/catalog churn remains owed. |
| **6. New encoder suppresses legacy publication** | **Addressed.** Legacy send remains at its original boundary; migrated encoding/admission failures are contained per recipient. | Decorated-array rejection suppresses legacy in v2; v3 preserves legacy delivery and its extra property. Existing recipient-order and listener semantics remain binding. |
| **7. Late revocation and unbounded quarantine/auth callbacks** | **Addressed.** Revoke before interruption; reserve finite retention before execution; narrow cleanup authority; separately bound logical auth registrations. | V2 interruption-finalizer mutation reproduced; v3 prevents it. Quarantine exhaustion refuses factory execution; captured cleanup runs after revocation; failed cleanup stays charged; auth count/byte admission and document release pass. |
| **8. Capability ownership and mechanical edits incomplete** | **Addressed in the supplied copies.** Ownership rows, canonical names, unary completion/error contracts and overflow scopes were edited directly. | Applied changes are listed in §16 and `probes/v3/design-edits.json`. No repository design or implementation file was edited. |
| **9. Census claim broader than its evidence** | **Corrected and strengthened.** V2 evidence is named truthfully; v3 tests three exact proposed declarations with completion/token/subgraph placement and mutates the tested success path. | Active/history projector round trips and selected-format request path pass. Whole-capability and production-handler codec coverage is not claimed. |
## Review status and how this amendment is frozen

Three independent reviews examined this amendment. Each round confirmed its decisions and found defects in the probe modules that demonstrated them. The third review endorses: per-operation reply cuts applied in the renderer with no receipts and no document-wide fence; one `Registered {token, epoch}` handshake; transparent presence codecs with tagged retained subgraphs and dense-array admission; direct invocation-owned effects with a document owner; owned operations with separate logical completion and cleanup; per-recipient publication with publisher-specific order; explicit-recipient notification sinks; original-failure carriers; and synchronous hosts that revoke before interrupting.

The architect freezes those decisions. The remaining findings of the third review are implementation requirements of the 9.0 transport lane, each with its counter-example as a regression test that must fail on the probe module and pass on the production module:

1. Ordinary subscriptions emit the declared observation envelope.
2. Terminal arbitration and failure escalation are implemented in the Protocol adapter.
3. The bounded dispatcher has bounded failed-admission bookkeeping and releases in-flight charges on every exit.
4. Replacing a registration during an operation cannot erase its ordering obligation.
5. Teardown attempts every release even after one fails, and reports all failures.
6. Captured synchronous cleanup runs on immediate success and immediate failure.
7. The generic publisher preserves the original live listener traversal and its owner.
8. Capability declarations construct without error; ownership and canonical paths in the capability designs follow section 16.
9. Defects after logical completion are reported, never discarded.

The capability designs (9.1 to 9.5) reference these mechanisms by their production module names and are checked against the production modules once they exist.
