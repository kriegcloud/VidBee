# Design: desktop subscriptions (phase 9.2)

Status: frozen on 2026-11-22 after three independent review rounds; the implementation requirements section binds every implementation lane. Text before the freeze: third revision for architect review. Section 16 disposes of `REVIEW.md` and carries forward the first review’s implementation obligations. The architect owns the decisions. Local declaration and mechanism probes pass; production implementation, current-build characterization, complete screen compilation and packaged acceptance remain gates.

Inputs: `PLAN.md` sections 3–7, “Phases 9.1 to 9.5” and Amendments; `PORT-GUIDE.md`; the approved desktop-foundation design, including its capability recipe; the frozen foundation amendment; `reports/9.0.md`; the db, task-queue, downloader-core and subscriptions-core designs and their reviews; the standards-tooling editions of schema-first, identity, JSDoc and Effect-first rules; the supplied inventory, previous design and reviews; the model review’s corrections; current source and installed Effect 4.1.4.

Source references use:

| Abbreviation | Location |
| --- | --- |
| **V** | `~/YeeBois/workstation-apps/worktrees/VidBee/port-desktop-foundation`, HEAD `990ed4fe`; desktop source and approved foundation |
| **G** | `~/YeeBois/workstation-apps/worktrees/VidBee/port-goldens-8`, HEAD `7c94ea05`; ported packages and current integration coverage |
| **M/** | `apps/desktop/src/main/` |
| **R/** | `apps/desktop/src/renderer/src/` |
| **S/** | `apps/desktop/src/shared/` |
| **C/** | `packages/subscriptions-core/src/` |

Paths and line references are repository-relative. Desktop source references identify V; ported package references identify G. Proposed symbols and files are declarations of this design, not claims that those exports exist.

Repositories remained read-only. Writes were confined to probes in the drafting directory. No network, application, additional agent or coding-agent CLI session was used.

## 1. What this capability is, and what makes it risky

Subscriptions save feed and profile rules, discover and retain items, track queue links and admit selected items to the shared download queue. The desktop supplies settings, database access, metadata hydration, profile mapping, history lookup and authoritative task existence. The screen presents attached item snapshots and supports creation, editing, enabling, removal, refresh and manual admission.

This phase ports the subscription service, its main-process host and its renderer consumers. It reuses the foundation transport, application runtime and document registry. It creates no second database connection, subscription coordinator, queue, admission owner, inspector or social mapper.

The following distinctions govern the port:

1. **Desktop results are projections.** They carry attached `items`, with queue links named `downloadId`. Core results use `taskId` (`M/lib/subscriptions-host.ts:235–312`).
2. **Acknowledgement is operation-specific.** Desktop create starts refresh and returns the created snapshot. All-refresh and profile refresh detach; feed refresh waits. MCP and HTTP retain their different boundaries (`M/ipc/services/subscription-service.ts:48–145`).
3. **Forced passes differ from scheduler passes.** Scheduler passes share running/pending state. Direct `refreshAll({ force: true })` calls enter independently. Per-ID work still uses core’s existing in-flight behavior (`C/SubscriptionScheduler.layer.ts:40–115`; `C/Subscriptions.layer.ts:305–374`).
4. **Feed and profile notifications differ.** Feed checking does not emit changed; profile checking does. Their cleanup, early-return and final-publication paths differ (`C/Subscriptions.layer.ts:143–303`).
5. **Mutation results differ from stored reads.** A successful update returns the constructed row, then attached children. SQLite coercion and conditional column omission can make a later reread different. A legacy desktop update can successfully return `downloadDirectory: null`.
6. **Presence and numeric identity are observable.** Omission, own-property undefined and null must remain distinct where core distinguishes them. Ordinary JSON also loses negative zero.
7. **Renderer races are retained.** Independent load, event, poll and update results publish by completion. An older pending result can overwrite a newer view.
8. **Notifications can precede failure.** Queue admission can publish a download before link marking rejects. Removal can publish cancellation before its acknowledgement. Application failures therefore carry reply cuts too.

A2 and A6 cover results, errors, synchronous prefixes, callback delivery, settlement turns, property presence, truthiness and partial outcomes. Existing bugs are listed for owner review. Promise orchestration wrapped in Effect is not a completed port.

## 2. Scope and file dispositions

Existing implementation filenames stay. New companions follow the approved grammar: `Foo.model.ts`, `Foo.errors.ts`, `Foo.service.ts`, `Foo.layer.ts`, `Foo.driver.ts`, `Foo.rpc.ts`, `Foo.atoms.ts` and permitted entrypoints.

The tables allocate complete ownership of the slice. Shared composition edits have one integrator.

### Main, shared and preload

| Existing file or owned portion | Disposition and target |
| --- | --- |
| `M/ipc/services/subscription-service.ts` | **Ported in place.** Replace decorated `SubscriptionService` execution with native application operations. Contracts are `M/lib/DesktopSubscriptions.service.ts` and `.errors.ts`; composition is `DesktopSubscriptions.layer.ts`. |
| `M/ipc/index.ts:13,32` | **Split, integrator-owned.** Remove subscription class registration. Install seven exact old-channel forwarders through foundation compatibility registration. Other decorated services remain. |
| `M/lib/subscriptions-host.ts` | **Split.** Retain strict host orchestration and canonical projection here. Move old callable exports to `M/lib/legacy/subscriptions-host.ts`. |
| `M/lib/SubscriptionHosts.service.ts`, `.layer.ts` | **New strict.** Native queue/admission/profile/settings dependencies and their composition. |
| `M/lib/SubscriptionHost.driver.ts` | **New strict edge adapter where required.** Host primitives only; no old subscription/profile coordinator hidden behind a driver. |
| `M/lib/subscription-enqueue.ts` | **Ported in place.** Preserve the synchronous task-input calculation. Boundary models go in `SubscriptionEnqueue.model.ts` when not already supplied by 9.1. |
| `M/lib/profile-subscriptions.ts` | **Ported in place.** Native Effect orchestration over the existing inspector, mapper and enqueue owners. Pure category/error/title decisions remain at their existing call sites. |
| `M/lib/social-profile-manager.ts` | **Kept, 9.1-owned.** Borrow its existing owner through native injection. No second singleton. |
| `M/index.ts:511–515,628–630`, startup and quit portions | **Split, integrator-owned.** Install one subscription owner and broadcast adapter at the existing points. Bootstrap remains explicitly legacy. |
| `M/ipc/SubscriptionDelivery.service.ts`, `.layer.ts` | **New strict capability binding.** Bind subscription families, token requirements, reducers and the dependency ledger to foundation delivery services. Own no independent transport ledger. |
| `M/lib/agent-management-host.ts:274–454` | **Kept legacy.** Import rewiring only. Preserve probing, path approval, defaults and envelopes. |
| `M/mcp/subscription-tools.ts` | **Kept legacy.** Preserve nine tools, zod metadata and surface validation until its phase. |
| `M/local-api.ts:372–427` | **Kept legacy.** Preserve body handling, coercion, unchecked low-level mutations, status codes and envelopes. |
| `S/types/index.ts`, subscription declarations | **Split.** Preserve old exported mutable structural declarations. Strict subscription consumers import application models directly. |
| `S/subscriptions/SubscriptionLegacy.model.ts` | **New declaration companion if not already supplied by 9.0.** Match old declarations, including writable keys, nested mutable arrays and explicit undefined. No legacy implementation. |
| `S/subscriptions/Subscription.model.ts` | **New strict.** Typed desktop inputs, observed result contracts and renderer view. |
| `S/subscriptions/Subscription.errors.ts` | **New strict.** Serializable operation error with working user-visible message. |
| `S/subscriptions/Subscription.rpc.ts` | **New strict.** Exact `SubscriptionRpcs` below. |
| `S/types/ipc.ts` | **Kept transitional.** Exact seven positional subscription signatures; no dependency on main implementation. |
| `src/preload/index.ts`, `src/preload/index.d.ts` | **Kept foundation-owned.** Use `window.vidbeeRpc`; add no capability bridge. Preserve actual old helpers and invoke access. |
| Desktop RPC composition, strict configs, ownership manifests and bundler/manifests | **Integrator-owned edits.** Merge group and handlers; promote the exact compiler-resolved closure. |

Database ownership, journal migration infrastructure, queue execution, metadata commands, binary discovery, history and download notifications retain their existing owners.

### Foundation additions and prerequisites

Phase 9.0 implements these shared mechanisms once, under the frozen amendment:

| Production path | Subscription requirement |
| --- | --- |
| `S/RpcField.model.ts` | `RpcOptional`, `RpcValue`, `RpcUndefined`, dense-array admission |
| `S/RpcObservation.model.ts` | Tagged retained-value representation and `RpcObserved`, including exact numeric tokens |
| `S/DocumentDelivery.model.ts`, `.errors.ts` | `Token`, `Registered`, `Subscription`, `Cut`, `Completion`, `DeliveryError` |
| `M/ipc/DocumentSubscriptions.service.ts`, `.layer.ts` | Failure-atomic registration, exact active-token validation, replacement and closure |
| `M/ipc/DocumentDelivery.service.ts`, `.layer.ts` | Per-recipient publication sequences and cuts pinned to registration identities |
| `R/transport/DocumentDelivery.service.ts`, `.layer.ts` | Application watermarks, invocation-local cut waits and retirement |
| `R/runtime/RendererInvocation.entry.ts` | Reusable invocation-owned execution and Promise acknowledgement |
| `R/runtime/Invocation.atoms.ts` | Optional private result-atom adapter over the same document invocation owner |
| `R/runtime/StreamRecovery.atoms.ts` | Repair identities and lifecycle; this capability supplies section 7’s recovery policy |
| `M/runtime/ApplicationOperations.service.ts`, `.layer.ts` | Accepted work with separate logical completion and cleanup release |
| `M/lib/OriginalFailure.errors.ts` | Main-only original-failure carrier |
| `M/lib/JsonSyntax.service.ts` | Original parser-error primitive where exact syntax diagnostics are required |

The presence helper and per-invocation acknowledgement primitive are foundation additions requested by this capability. This phase imports them; it does not implement competing copies.

The amendment’s final implementation requirements remain binding, including observation envelopes, terminal arbitration, bounded failed-admission bookkeeping, replacement-safe ordering obligations, all-release teardown, immediate synchronous cleanup, live listener traversal, construction of capability declarations and reporting defects after logical completion. Passing a supplied prototype probe does not discharge those production requirements.

### Mandatory package seam

| Package file | Disposition |
| --- | --- |
| `packages/subscriptions-core-legacy/src/api.ts` | **Split construction from facade binding.** Preserve existing constructor behavior for old callers; add the owner-binding seam in section 6. |
| `packages/subscriptions-core-legacy/src/SubscriptionOwner.entry.ts` | **New compatibility entrypoint.** Construct and warm one owner; bind its native service and legacy facade; own disposal and captured execution context. |
| `C/Subscription.model.ts`, `C/Subscriptions.service.ts`, `C/Subscriptions.layer.ts` | **Narrow integration edit.** Admit persisted preference strings through a native desktop update operation sharing the existing update body. Keep the old narrow legacy declaration. |
| `C/SubscriptionRules.model.ts` | **New pure module.** Extract create/update interpretation at unchanged call sites. |
| Existing compatibility edge providers | **Kept explicitly.** Supplied-Drizzle execution, feed transport, timing, timers, dispatch, entropy and date semantics remain selected until their cutover gates pass. |

The owner seam is mandatory before the host lane passes its gate.

### Renderer, components and atoms

| Existing file or symbol | Disposition and replacement |
| --- | --- |
| `R/store/subscriptions.ts` | **Split.** `R/store/Subscription.atoms.ts` owns strict state/actions. The old file projects that registry and forwards actions while compatibility consumers or baseline probes remain. |
| `subscriptionsAtom` | Writable Effect Atom, initial `[]`, document lifetime. |
| `setSubscriptionsAtom` | Publish with existing serialized equality suppression. |
| `loadSubscriptionsAtom` | Fresh invocation-owned List; concurrent; log/swallow failure; publish on completion. |
| `createSubscriptionAtom` | Normalize comma lists and invoke create; no local append. |
| `updateSubscriptionAtom` | Publish returned row into matching existing entries before its own acknowledgement; no append or optimistic patch. |
| `removeSubscriptionAtom` | Await removal; no eager deletion. |
| `refreshSubscriptionAtom` | Preserve absent/profile/feed acknowledgement boundaries. |
| `resolveFeedAtom` | Invocation-owned syntactic resolution. |
| `subscriptions:updated` consumption | `Subscriptions.Changes`, retaining old-channel publication for old consumers. |
| `R/pages/Subscriptions.tsx` | **Ported in place.** Preserve `Subscriptions`, `SubscriptionTab`, `SubscriptionItems`, sorting, keys, selection, polling, visible-window status, toasts and rendering. |
| `R/components/subscription/SubscriptionFormDialog.tsx` | **Ported in place.** Strict settings/subscription state; injected browser-safe directory and external-open operations. |
| `R/components/subscription/useProfileSubscribe.tsx` | **Ported in place.** Preserve the no-argument hook, returned contract, owner comparison and forwarded subset. |
| `R/runtime/SubscriptionCapabilities.service.ts` | **New strict browser-safe contract.** Directory selection, external opening, clipboard, images and structural download/history access. |
| `R/composition/SubscriptionCapabilitiesProvider.tsx` | **New composition adapter.** Supply actual existing capabilities application-wide. Own no subscription state. |
| `R/main.tsx`, `R/App.tsx` | **Integrator-owned.** Mount the provider over both subscription and download profile-dialog consumers. |
| `R/app-layout.tsx:286–301` | **Split, integrator-owned.** Mount Changes and the existing application-layout load. No stream-owned initial list. |
| `R/router.tsx` | **Integrator-owned wiring if needed.** No new state owner. |
| `R/components/download/DownloadDialog.tsx:110,1617` | **Kept, 9.1-owned.** Its hook/dialog runs under the application-wide provider. |
| `R/components/download/UnifiedDownloadHistory.tsx:683–686` | **Kept, 9.1-owned.** Same provider and state owner. |
| `R/lib/ipc.ts` | **Kept legacy.** Strict subscription modules cease executable imports. |
| `R/store/downloads.ts`, `download-live-patch.ts`, `R/hooks/use-download-events.ts` | **Kept, 9.1-owned.** Supply existing structural status and shared completion behavior. |
| `R/components/ui/remote-image.tsx` | **Kept with its owner or promoted through actual strict closure.** Strict subscription components receive an image capability when its implementation remains legacy. |

A provider scoped only to the Subscriptions route is insufficient.

### Shared UI and tests

| File | Disposition |
| --- | --- |
| `packages/ui/src/components/subscription/subscription-form-dialog.tsx` | **Kept presentation; strict adaptation assigned.** Edit presentation and control state admit retained preference strings. Preserve defaults and control behavior. |
| `packages/ui/src/components/ui/subscription-virtual-grid.tsx` | **Kept presentation/lifecycle; strict closure assigned.** Preserve observer cleanup, responsive columns, keys and visible-range reporting. |
| `packages/ui/src/components/ui/subscription-all-tab.tsx` | **Kept presentation; strict closure assigned.** |
| Reached local `badge`, `button`, `card`, `context-menu`, `hover-card`, `scroll-area`, `tooltip` adapters and resolved dependencies | **Promoted in place where reached.** No blanket legacy exemption. |
| Existing subscription package tests, scheduler audits and golden scripts/artifacts | **Kept.** Extend missing observations; retain assertions and baseline provenance. |
| `apps/desktop/test/subscriptions/Subscription.model.test.ts` | **New.** Presence, numbers, retained values, result order and declaration parity. |
| `…/Subscription.service.test.ts` | **New.** Operations, error mapping and acknowledgement traces. |
| `…/SubscriptionHost.test.ts` | **New.** Owner construction, admission, profile orchestration and lifecycle. |
| `…/SubscriptionStreams.test.ts` | **New.** Registration, cuts, capacity, cancellation, recovery and terminal delivery. |
| `…/SubscriptionRenderer.test.tsx` | **New.** Actual consumers, independent acknowledgements, races, cache lifetime and both dialog mounts. |
| `apps/desktop/scripts/port/subscriptions/` | **New JavaScript characterization probes**, permitted by D7. Section 12 names their required observations. |

Delete only the decorated subscription implementation and superseded executable action bodies after replacement. Retain old channels, facades, structural declarations and projections until phase 10 and their final consumer/probe migration.

## 3. Schemas

### Boundary distinctions

The desktop projector defines the response, not core’s nominal rule declaration (`M/lib/subscriptions-host.ts:235–312`).

| Contract | Interpretation |
| --- | --- |
| Stored read | Required identity/text/flags/arrays/times, attached items, permissive persisted platform/status/preference strings |
| Typed mutation result | Same consumer-usable desktop shape, produced from the immediate constructed result without rereading |
| Main-only compatibility mutation | Broad schema-backed projection of core `SubscriptionMutationResult`; preserves successful legacy scalar/null/undefined values |
| Authored create | Current desktop create vocabulary; no new interval-range, URL-availability or nonempty-string restriction |
| Authored update | Existing patch fields; retained preference strings; interval omitted/undefined/null/number distinction |
| Renderer view | Union of typed read and typed mutation result, never the broad compatibility result |
| Missing update | Undefined, not null |
| Queue result | Desktop Boolean; core/MCP/HTTP retain `{ queued, taskId: string | null }` |

Unknown stored text remains text. `sourceKind` retains the store’s existing interpretation. The projector includes optional values when `!== undefined`; empty strings and null values on the broad mutation route therefore remain observable.

### Shared presence and observation codecs

Foundation uses whole-message `RpcSerialization.json`. Its ordinary schema derivation turns undefined into null. The shared helper preserves presence explicitly:

```ts
import * as S from "effect/Schema"
import * as Getter from "effect/SchemaGetter"

export const RpcUndefined = S.TaggedStruct("RpcUndefined", {}).pipe(
  S.decodeTo(S.Undefined, {
    decode: Getter.transform(() => undefined),
    encode: Getter.transform(
      (): { readonly _tag: "RpcUndefined" } => ({
        _tag: "RpcUndefined"
      })
    )
  })
)

export const RpcValue = <A, I, RD, RE>(
  field: S.Codec<A, I, RD, RE>
) =>
  S.TaggedStruct("RpcValue", { value: field }).pipe(
    S.decodeTo(
      S.toType(field).check(
        S.makeFilter((value) => value !== undefined)
      ),
      {
        decode: Getter.transform(({ value }) => value),
        encode: Getter.transform(
          (value): {
            readonly _tag: "RpcValue"
            readonly value: A
          } => ({ _tag: "RpcValue", value })
        )
      }
    )
  )

export const RpcOptional = <A, I, RD, RE>(
  field: S.Codec<A, I, RD, RE>
) =>
  S.Union([RpcValue(field), RpcUndefined]).pipe(
    S.optionalKey,
    S.mutableKey
  )
```

The defined branch rejects undefined even for `S.Unknown`. Marker-shaped retained objects remain ordinary data inside `ObservedValue`; markers are interpreted only at declared codec boundaries.

| Application property | Wire property | Decoded property |
| --- | --- | --- |
| Omitted | Omitted | No own property |
| Own undefined | `RpcUndefined` | Own undefined |
| Null, where admitted | `RpcValue(null)` | Own null |
| Defined | `RpcValue(encoded value)` | Own decoded value |

Do not globally strip undefined. Core update removes interval undefined during destructuring, while other supplied undefined fields remain in its spread patch (`C/Subscriptions.layer.ts:477–509`). Preserve the distinction until that existing interpretation.

Use the amendment’s `RpcObserved(view)` for observed outputs and its tagged number representation for authored numeric fields. `RpcObserved(S.Finite)` admits finite numbers while preserving `-0`. Ordinary `S.Finite` followed by JSON is insufficient.

The retained encoding distinguishes undefined, null, strings, booleans, canonical numeric tokens, bigint, dense arrays and ordered object entries. It preserves own keys and key order. Unsupported prototypes, descriptors, cycles, sparse/decorated arrays and noncanonical tokens fail explicitly on the new route. Traversal limits remain foundation-owned.

Authored closed structs strip unknown keys. Observed retained graphs preserve their admitted own keys. The desktop projector still selects its existing fields and drops unrelated core keys before transport. These are three separate policies.

### Typechecked application declarations

The following declarations use real package exports. The executable counterparts are under `probes/revision3/src/`.

```ts
import { $DesktopId } from "@vidbee/identity/packages"
import * as Core from "@vidbee/subscriptions-core/Subscription.model"
import * as Stored from "@vidbee/subscriptions-core/Feed.model"
import {
  OneClickContainerOption,
  OneClickQualityPreset
} from "@vidbee/downloader-core/format-preferences"
import * as S from "effect/Schema"
import { RpcOptional } from "../RpcField.model.js"
import { RpcObserved } from "../RpcObservation.model.js"

const $I = $DesktopId.create(
  "shared/subscriptions/Subscription.model"
)

export const RpcFinite = RpcObserved(S.Finite)

export class DesktopSubscriptionItem extends S.Opaque<
  DesktopSubscriptionItem,
  { readonly brand: unique symbol }
>()(
  S.Struct({
    id: S.String.pipe(S.mutableKey),
    url: S.String.pipe(S.mutableKey),
    title: S.String.pipe(S.mutableKey),
    publishedAt: RpcFinite.pipe(S.mutableKey),
    addedToQueue: S.Boolean.pipe(S.mutableKey),
    thumbnail: RpcOptional(S.String),
    downloadId: RpcOptional(S.String)
  }).pipe(
    $I.annoteSchema("DesktopSubscriptionItem", {
      description: "Attached item linked under downloadId."
    })
  )
) {}

const f = Stored.StoredSubscriptionRule.fields

export const desktopFields = {
  id: f.id,
  title: f.title,
  sourceUrl: f.sourceUrl,
  feedUrl: f.feedUrl,
  platform: f.platform,
  keywords: f.keywords,
  tags: f.tags,
  onlyDownloadLatest: f.onlyDownloadLatest,
  autoDownload: f.autoDownload,
  enabled: f.enabled,
  status: f.status,
  createdAt: f.createdAt,
  updatedAt: f.updatedAt,
  sourceKind: f.sourceKind,
  categories: f.categories,
  items: S.Array(DesktopSubscriptionItem).pipe(
    S.mutable,
    S.mutableKey
  ),
  profileOwner: RpcOptional(S.String),
  checkIntervalMs: RpcOptional(RpcFinite),
  nextCheckAt: RpcOptional(RpcFinite),
  coverUrl: RpcOptional(S.String),
  latestVideoTitle: RpcOptional(S.String),
  latestVideoPublishedAt: RpcOptional(RpcFinite),
  lastCheckedAt: RpcOptional(RpcFinite),
  lastSuccessAt: RpcOptional(RpcFinite),
  lastError: RpcOptional(S.String),
  downloadDirectory: RpcOptional(S.String),
  namingTemplate: RpcOptional(S.String),
  downloadType: RpcOptional(S.String),
  downloadQuality: RpcOptional(S.String),
  downloadContainer: RpcOptional(S.String)
}

export class DesktopSubscription extends S.Opaque<
  DesktopSubscription,
  { readonly brand: unique symbol }
>()(
  S.Struct(desktopFields).pipe(
    $I.annoteSchema("DesktopSubscription", {
      description: "Stored desktop snapshot in projector order."
    })
  )
) {}

export class DesktopSubscriptionMutation extends S.Opaque<
  DesktopSubscriptionMutation,
  { readonly brand: unique symbol }
>()(
  S.Struct(desktopFields).pipe(
    $I.annoteSchema("DesktopSubscriptionMutation", {
      description:
        "Immediate successful typed update projection without a reread."
    })
  )
) {}

const preferences = {
  downloadType: RpcOptional(Core.SubscriptionDownloadType),
  downloadQuality: RpcOptional(OneClickQualityPreset),
  downloadContainer: RpcOptional(OneClickContainerOption)
}

export class CreateSubscription extends S.Opaque<
  CreateSubscription,
  { readonly brand: unique symbol }
>()(
  S.Struct({
    ...preferences,
    url: S.String.pipe(S.mutableKey),
    keywords: S.Array(S.String).pipe(S.mutable, RpcOptional),
    tags: S.Array(S.String).pipe(S.mutable, RpcOptional),
    onlyDownloadLatest: RpcOptional(S.Boolean),
    autoDownload: RpcOptional(S.Boolean),
    downloadDirectory: RpcOptional(S.String),
    namingTemplate: RpcOptional(S.String),
    enabled: RpcOptional(S.Boolean),
    categories: S.Array(S.String).pipe(S.mutable, RpcOptional),
    checkIntervalMs: RpcOptional(RpcFinite)
  }).pipe(
    $I.annoteSchema("CreateSubscription", {
      description: "Desktop create input before existing defaults."
    })
  )
) {}

export class UpdateSubscription extends S.Opaque<
  UpdateSubscription,
  { readonly brand: unique symbol }
>()(
  S.Struct({
    downloadType: RpcOptional(S.String),
    downloadQuality: RpcOptional(S.String),
    downloadContainer: RpcOptional(S.String),
    title: RpcOptional(S.String),
    sourceUrl: RpcOptional(S.String),
    feedUrl: RpcOptional(S.String),
    platform: RpcOptional(Core.SubscriptionPlatform),
    keywords: S.Array(S.String).pipe(S.mutable, RpcOptional),
    tags: S.Array(S.String).pipe(S.mutable, RpcOptional),
    onlyDownloadLatest: RpcOptional(S.Boolean),
    autoDownload: RpcOptional(S.Boolean),
    enabled: RpcOptional(S.Boolean),
    downloadDirectory: RpcOptional(S.String),
    namingTemplate: RpcOptional(S.String),
    categories: S.Array(S.String).pipe(S.mutable, RpcOptional),
    checkIntervalMs: S.NullOr(RpcFinite).pipe(RpcOptional),
    items: S.Array(DesktopSubscriptionItem).pipe(
      S.mutable,
      RpcOptional
    )
  }).pipe(
    $I.annoteSchema("UpdateSubscription", {
      description:
        "Desktop patch preserving omission, own undefined and null."
    })
  )
) {}

export const DesktopSubscriptionList =
  S.Array(DesktopSubscription).pipe(S.mutable)
export type DesktopSubscriptionList =
  typeof DesktopSubscriptionList.Type

export const DesktopSubscriptionView = S.Union([
  DesktopSubscription,
  DesktopSubscriptionMutation
])
export type DesktopSubscriptionView =
  typeof DesktopSubscriptionView.Type

export const SubscriptionId = S.Struct({ id: S.String })
export type SubscriptionId = typeof SubscriptionId.Type

export const ResolveSubscription = S.Struct({ url: S.String })
export type ResolveSubscription = typeof ResolveSubscription.Type

export const UpdateSubscriptionRequest = S.Struct({
  id: S.String,
  updates: UpdateSubscription
})
export type UpdateSubscriptionRequest =
  typeof UpdateSubscriptionRequest.Type

export const RefreshSubscription = S.Struct({
  id: RpcOptional(S.String)
})
export type RefreshSubscription = typeof RefreshSubscription.Type

export const QueueSubscriptionItem = S.Struct({
  id: S.String,
  itemId: S.String
})
export type QueueSubscriptionItem =
  typeof QueueSubscriptionItem.Type

export const ResolvedFeed = S.Struct({
  ...Core.ResolvedFeed.fields,
  profileOwner: RpcOptional(S.String)
})
export type ResolvedFeed = typeof ResolvedFeed.Type
```

Whole observed responses use `RpcObserved` in the RPC declarations. That preserves required numeric fields such as `createdAt` as well as optional numeric fields and preserves projector key order without reconstructing through the schema’s encoded fields.

Production owning declarations receive the standards-required identity annotations, same-name type companions, JSDoc categories, version and compiling titled Examples. The probe typecheck is not a claim that the production textual/documentation gates have run.

### Lossless main-only compatibility result

A successful legacy result must have a route around the narrowed typed DTO.

```ts
export const DesktopLegacyMutation = S.Struct({
  ...Stored.SubscriptionMutationResult.fields,
  items: S.Array(DesktopSubscriptionItem).pipe(
    S.mutable,
    S.mutableKey
  )
})
export type DesktopLegacyMutation =
  typeof DesktopLegacyMutation.Type
```

This is a main-only validation contract. It is not placed directly in a JSON RPC union. Its permissive scalar fields come from the actual package mutation result, including null, own undefined, unusual numeric values and artwork bigint.

The common creation operation returns `DesktopLegacyMutation` for both entrypoints. It resolves and reads settings before add, preserves the existing defaults and truthiness, applies duplicate reconstruction at the existing catch, starts refresh at the existing detach point even when disabled, and returns the immediate canonical projection without rereading or coercion. Only the typed RPC adapter narrows it to `DesktopSubscription`.

The retained declaration is `CreateSubscriptionOptions` in `S/subscriptions/SubscriptionLegacy.model.ts`, matching `M/ipc/services/subscription-service.ts:20–32`:

```ts
export interface CreateSubscriptionOptions
  extends Core.SubscriptionDownloadPreferences {
  url: string
  keywords?: string[] | undefined
  tags?: string[] | undefined
  onlyDownloadLatest?: boolean | undefined
  autoDownload?: boolean | undefined
  downloadDirectory?: string | undefined
  namingTemplate?: string | undefined
  enabled?: boolean | undefined
  categories?: string[] | undefined
  checkIntervalMs?: number | undefined
}
```

The common update sequence is:

```text
copy patch
→ sanitize namingTemplate only when it is a string
→ call the one native update body with { id, ...normalized }
→ apply duplicate reconstruction / missing-prefix catch
→ canonical desktop projection
→ validate the broad main-only result without replacing its object
→ return that exact projected result
```

Two update entrypoints share that sequence; the create entrypoints share the common creation operation:

| Entrypoint | Input and result boundary |
| --- | --- |
| `DesktopSubscriptions.createCompatibility` | Retain `CreateSubscriptionOptions`; do not decode legacy arguments through new RPC codecs. Return `DesktopLegacyMutation` to the old facade/invoke mapper. |
| `DesktopSubscriptions.create` | Accept typed `CreateSubscription`; return the same broad main creation result. Only the typed RPC adapter narrows it to `DesktopSubscription`. |
| `DesktopSubscriptions.updateCompatibility` | Retain the old declared input; do not decode legacy arguments through new RPC codecs. Return `DesktopLegacyMutation | undefined` to the old facade/invoke mapper. |
| `DesktopSubscriptions.update` | Accept typed `UpdateSubscription`; return the same broad main result. Only the typed RPC adapter decodes it into `DesktopSubscriptionMutation | undefined`. |

The compatibility facade projects the broad runtime result into its existing narrow structural declaration only at the compatibility boundary. Strict renderer code never imports that declaration projection.

The create cases are resolved now: `{ enabled: false, autoDownload: 0 }` on the retained old create channel fulfills with numeric `autoDownload: 0`; supplied `checkIntervalMs: NaN` can fulfill immediately with NaN. Both bypass the narrow typed-result decoder, launch refresh at the same point and retain the immediate projection (`M/ipc/services/subscription-service.ts:56–83`; `packages/subscriptions-core-legacy/src/DrizzleSubscriptions.driver.ts:220–255`). The broad projection schema above covers these values.

The null-directory case is resolved now: `{ downloadDirectory: null }` on the retained old update channel commits and returns null. It does not pass through the narrow typed-result decoder. A malformed result encountered by the new typed adapter fails that invocation through the declared application-error completion, with its cuts; it does not rewrite the row or reread it.

### Projection and consumer guarantees

Read and mutation publication use the same projector order:

1. Required fields in `desktopFields` order through `items`.
2. Optional fields in the order above, appended only when not undefined.
3. Item fields `id`, `url`, `title`, `publishedAt`, `addedToQueue`, then conditional `thumbnail`, `downloadId`.

Decode boundaries into trust, then preserve or reconstruct this canonical projection. Do not publish a spread of the package schema’s differently ordered fields. Do not replace serialized equality with semantic equality.

The typed view retains usable identity, owner strings, arrays and item links. The timeline can consume it; owner comparison remains string comparison; keywords and tags retain joins. Shared form edit/control state admits retained platform and preference strings. Outgoing preference strings are not cast to enums or normalized.

Old structural declarations remain separate and are checked under their original optional-property interpretation. Compile fixtures include property reassignment, `patch.items = items`, nested mutation and explicit undefined.

## 4. Errors

Wire errors carry operation and exact user-visible text. Main-only failures also retain the actual original value.

```ts
export class SubscriptionOperationError extends S.TaggedError<
  SubscriptionOperationError,
  { readonly brand: unique symbol }
>($I`SubscriptionOperationError`)(
  "SubscriptionOperationError",
  {
    operation: S.String,
    legacyMessage: S.String
  },
  $I.annote("SubscriptionOperationError", {
    description: "Serializable subscription operation failure."
  })
) {
  override get message() {
    return this.legacyMessage
  }
}

export class DesktopSubscriptionFailure extends S.TaggedError<
  DesktopSubscriptionFailure,
  { readonly brand: unique symbol }
>($I`DesktopSubscriptionFailure`)(
  "DesktopSubscriptionFailure",
  {
    operation: S.String,
    legacyMessage: S.String,
    cause: S.Defect({ includeStack: true })
  },
  $I.annote("DesktopSubscriptionFailure", {
    description: "Main-only subscription failure retaining its original."
  })
) {
  override get message() {
    return this.legacyMessage
  }
}
```

Each file uses its truthful file composer. The shared foundation original carrier may implement the main-only retention boundary; no second generic failure-unwrapping convention is introduced.

| Boundary | Mapping |
| --- | --- |
| Core error with `legacyMessage` | Read that field, including when `.message` is empty. |
| Recognized original carrier | Retain and unwrap the actual original only at its declared compatibility boundary. |
| Duplicate desktop create/update | Reconstruct ordinary Error with duplicate text, dropping `duplicateOf` and original identity as today. |
| Missing desktop update | Existing message-prefix catch returns undefined. |
| Native/Drizzle/parser/traversal/callback failure | Preserve original value, text and existing escape/catch position. |
| Main application → RPC | Map once to `SubscriptionOperationError`; put it inside `Completion`. |
| RPC → renderer | Await cuts, then expose the populated message. Do not expose `FiberFailure`. |
| MCP/HTTP | Preserve their own envelope, sanitization, fallback and prefix positions. |

### Owned and delegated error texts

| Text or family | Producer and handling |
| --- | --- |
| `SUBSCRIPTION_DUPLICATE_FEED_URL` | Core duplicate scan, `C/Subscriptions.layer.ts:467–486`; desktop reconstruction, `M/ipc/services/subscription-service.ts:84–88,105–108`. |
| `Subscription not found: <id>` | Core get/update/refresh/items, `C/Subscriptions.layer.ts:446–449,488–498,518–535`; desktop update alone converts the prefix to undefined. |
| `Choose at least one category to follow.` | Category validation, `C/Subscriptions.layer.ts:74–80`; update uses the existing platform. |
| `SUBSCRIPTION_PROFILE_DESKTOP_ONLY` | Profile creation without configured host, `C/Subscriptions.layer.ts:465–466`. |
| `Status code <status>` | Feed status boundary; normal checks save text and fulfill. |
| `Request timed out after 180000ms` | Feed request/body timeout; caller-abort precedence remains unchanged. |
| Original fetch/body/XML/traversal failures and abort reasons | Existing feed catches and compatibility mapper; preserve non-Error and falsy abort reasons. |
| `id is required`, `itemId is required`, `Unsupported subscription action`, `url is required` | Agent guards, `M/lib/agent-management-host.ts:375–441`. |
| `downloadDirectory must be an absolute path` | Agent-only validation, `:402`. |
| `downloadDirectory must stay inside the library folder unless the user approved this path.` | Agent-only approval guard, `:407–411`. |
| `Metadata request aborted`, name `AbortError` | `M/lib/yt-dlp-metadata-command.ts:45–48`. |
| `yt-dlp metadata exceeds the 64 MiB safety limit` | Metadata stdout limit, `:59`. |
| Captured stderr or `yt-dlp metadata exited with code <code>` | Metadata close failure, `:76–79`. |
| `Failed to parse video info: <error>` | `M/lib/yt-dlp-info.ts:80–81`; hydration normally logs/falls back. |
| `yt-dlp kernel is not activated` | Yt-dlp binary manager. |
| `GALLERY_DL_PATH does not exist: <path>` | Gallery binary override discovery. |
| `gallery-dl binary not found. Set GALLERY_DL_PATH or package <name> in resources.` | Gallery binary discovery; retain platform package name. |
| `Enter a Facebook, X, TikTok, Redgifs, VSCO, Threads, Pinterest, or Snapchat profile URL.` | Downloader social source guard, `social-profile-manager.ts:54–62`. |
| `Saved social profile identity does not match.` | Social inventory identity guard, `:120–124`. |
| `Unsupported profile category.` | Social category guard, `:163–182`. |
| `This profile is already mapping. Stop it or wait for completion.` | Active-map guard, `:169–174`. |
| `Saved Instagram profile could not be read. Restore its backup before rescanning.` | Instagram inventory read/parse failure. |
| `Instagram profile inspection expired. Scan the profile again.` | `InstagramEnqueue.service.ts:52–73`. |
| `Instagram category "<category>" is not ready to download.` | Same enqueue validation. |
| `Instagram <category>: <errorCode>` | Desktop summary, `M/lib/profile-subscriptions.ts:99–104`. |
| `<category> mapping did not finish` | Desktop social fallback, `:147–153`. |
| `RateLimited…`, text containing `AuthRequired`, `<label> mapping timed out.`, `<label> mapping exceeded its output limit.`, stderr or `<label> mapper exited with code <code>.` | Mapper diagnostics and existing desktop classification. |
| Original SQL, filesystem, queue, logger and callback errors | Preserve delegated owner’s exact error and existing catch boundary; no new generic replacement. |
| `drizzle migrations folder not found for desktop` | Lazy migration discovery during host acquisition. |
| `Unknown subscriptions op: <op>` | HTTP 404. |
| `Subscriptions handler failed` | HTTP 500 fallback for non-Error rejection. |
| Body-parser error or `Invalid request body` | HTTP 400. |
| MCP schema/validation errors and sanitized tool text | MCP-owned; retain its 4000-character text cap. |
| Old Electron invoke wrapping | Installed compatibility registrar; retain its logging and wrapping. |
| `RegistrationClosed`, stream/capacity/delivery terminal failures | Foundation-owned outer failure path; no application error is fabricated from them. |

Automatic enqueue/mark failures remain caught per item. Check failures generally become stored status/error text. Initial checking writes, failure-state writes and fallible loggers retain their escape positions. Directory creation remains warning-and-continue. Desktop detached refresh catches remain swallowed.

Full Causes use the foundation logger with minimum level `"All"`. Ordinary Effect logging does not replace the recoverable `SubscriptionLog` callback contract.

## 5. RpcGroups and streams

Use the foundation’s `Completion`, `Subscription`, `Token`, `Registered`, `Cut` and `DeliveryError`. Each unary has:

- Inner application success or `SubscriptionOperationError`.
- Cuts on both application success and failure.
- Outer `DeliveryError` for registration/delivery failure.
- Invocation-local renderer waiting; no main-side renderer fence or receipt RPC.

### Complete declarations

```ts
import * as S from "effect/Schema"
import * as Rpc from "effect/rpc/Rpc"
import * as RpcGroup from "effect/rpc/RpcGroup"
import * as M from "./Subscription.model.js"
import { SubscriptionOperationError } from "./Subscription.errors.js"
import { RpcUndefined } from "../RpcField.model.js"
import { RpcObserved } from "../RpcObservation.model.js"
import {
  Token,
  Completion,
  Subscription
} from "../DocumentDelivery.model.js"
import { DeliveryError } from "../DocumentDelivery.errors.js"

export const SubscriptionDependency = S.Struct({
  subscriptions: Token
})
export type SubscriptionDependency =
  typeof SubscriptionDependency.Type

export const QueueDependencies = S.Struct({
  subscriptions: Token,
  downloads: Token
})
export type QueueDependencies = typeof QueueDependencies.Type

export const SubscriptionRpcs = RpcGroup.make(
  Rpc.make("Subscriptions.List", {
    payload: { token: Token },
    success: Completion({
      success: RpcObserved(M.DesktopSubscriptionList),
      error: SubscriptionOperationError
    }),
    error: DeliveryError
  }),
  Rpc.make("Subscriptions.Resolve", {
    payload: M.ResolveSubscription,
    success: Completion({
      success: RpcObserved(M.ResolvedFeed),
      error: SubscriptionOperationError
    }),
    error: DeliveryError
  }),
  Rpc.make("Subscriptions.Create", {
    payload: {
      input: M.CreateSubscription,
      delivery: QueueDependencies
    },
    success: Completion({
      success: RpcObserved(M.DesktopSubscription),
      error: SubscriptionOperationError
    }),
    error: DeliveryError
  }),
  Rpc.make("Subscriptions.Update", {
    payload: {
      ...M.UpdateSubscriptionRequest.fields,
      delivery: SubscriptionDependency
    },
    success: Completion({
      success: S.Union([
        RpcObserved(M.DesktopSubscriptionMutation),
        RpcUndefined
      ]),
      error: SubscriptionOperationError
    }),
    error: DeliveryError
  }),
  Rpc.make("Subscriptions.Remove", {
    payload: {
      ...M.SubscriptionId.fields,
      delivery: QueueDependencies
    },
    success: Completion({
      success: S.Boolean,
      error: SubscriptionOperationError
    }),
    error: DeliveryError
  }),
  Rpc.make("Subscriptions.Refresh", {
    payload: {
      ...M.RefreshSubscription.fields,
      delivery: QueueDependencies
    },
    success: Completion({
      success: S.Void,
      error: SubscriptionOperationError
    }),
    error: DeliveryError
  }),
  Rpc.make("Subscriptions.QueueItem", {
    payload: {
      ...M.QueueSubscriptionItem.fields,
      delivery: QueueDependencies
    },
    success: Completion({
      success: S.Boolean,
      error: SubscriptionOperationError
    }),
    error: DeliveryError
  }),
  Rpc.make("Subscriptions.Changes", {
    success: M.DesktopSubscriptionList.pipe(
      RpcObserved,
      Subscription
    ),
    error: S.Union([
      SubscriptionOperationError,
      DeliveryError
    ]),
    stream: true
  })
)
```

The new payload placement is intentional. Old positional channels retain their exact arguments and do not pass through these envelopes.

`S.Void` is appropriate for refresh’s successful no-value result. Missing update uses explicit `RpcUndefined`.

### Dependency families and reply cuts

`subscriptions` identifies the registered full-snapshot observation family. `downloads` identifies 9.1’s registered download-event family, including its existing coalesced output. Tokens are main-issued and checked against authenticated document, logical client, generation and exact active registration identity. Matching family text alone grants no authority.

Required tokens are validated before application execution. The adapter pins the registration objects for the invocation. Replacement or closure during execution cannot make capture silently use a replacement or return an empty dependency set. Capture retains the old identity’s ordering obligation or fails delivery explicitly under the amendment.

| Operation | Required token payload | Reply dependency families | Old publication boundary and exclusions |
| --- | --- | --- | --- |
| List | `token`: active `subscriptions` token | **None.** A list read does not publish an observation. Return `cuts: []`. | `M/ipc/services/subscription-service.ts:38–39`; `M/lib/subscriptions-host.ts:320–323`. The token establishes subscribe-before-read, not a mutation cut. |
| Resolve | None | **None.** Syntactic resolution performs no publication. | `subscription-service.ts:43–44`. Lazy owner acquisition retains its existing side effects; resolution adds no event. |
| Create | `delivery.subscriptions`, `delivery.downloads` | `subscriptions`, `downloads` | Core add emits changed before returning (`C/Subscriptions.layer.ts:467–475`), which starts an independent snapshot read at `M/index.ts:511–514`. Initial refresh starts before create returns (`subscription-service.ts:80–83`). Capture only observations actually admitted before application exit, including any download publication that has occurred by then. Do not join refresh or pending snapshot reads. |
| Update | `delivery.subscriptions` | `subscriptions` | Core changed precedes result (`C/Subscriptions.layer.ts:500–508`); broadcast read is independent (`M/index.ts:511–514`). Update itself admits/cancels no task. The page’s later detached refresh is another invocation (`R/pages/Subscriptions.tsx:330–333`). |
| Remove | `delivery.subscriptions`, `delivery.downloads` | `subscriptions`, `downloads` | Core removal emits changed; host then cancels linked and grouped tasks (`C/Subscriptions.layer.ts:511–517`; `M/lib/subscriptions-host.ts:195–224`). Cancellation/download sends already made before reply are dependencies. Pending subscription snapshots, later process completion and unrelated future link batches are excluded. |
| Refresh | `delivery.subscriptions`, `delivery.downloads` | `subscriptions`, `downloads` | Profile checking/final events and feed final events may publish; admission may publish downloads (`C/Subscriptions.layer.ts:143–303`). All/profile paths capture at their detached acknowledgement; feed captures after awaited refresh (`subscription-service.ts:123–136`). Do not join detached work or pending snapshot reads to obtain a stronger cut. |
| QueueItem | `delivery.subscriptions`, `delivery.downloads` | `subscriptions`, `downloads` | Admission precedes link marking and final changed (`C/Subscriptions.layer.ts:554–561`). Download queued/updated observations can precede a link failure. Capture both families even on application failure. Missing item/live-link no-op paths still use the same declared dependency set. |

A declared dependency with no admitted observation has a zero-through cut or an already satisfied equivalent under the foundation contract. It does not require a synthetic event. No dependency is inferred from raw callback arrival or a pending asynchronous read.

Publication sequence advances at successful immutable recipient admission replacing the old send:

| Family | Main admission point | Renderer prefix before watermark advancement |
| --- | --- | --- |
| `subscriptions` | Completed list/project at `M/index.ts:513` and existing window-load send at `:629`; not core changed emission or list start | Existing array acceptance and serialized-equality publication, `R/app-layout.tsx:296–299`; `R/store/subscriptions.ts:29–37` |
| `downloads` | Existing sends after projection/coalescing: queued/updated/started at `M/index.ts:780–794`; progress/log at `:735–748`; terminal flush then terminal send at `:805–817`; removed at `:776–778` | Existing synchronous reducers in `R/hooks/use-download-events.ts:76–135,211–240`; detached history/notification work is started at its old position and is not awaited by the watermark |

`M/lib/download-facade.ts:367–396` produces transition observations synchronously; `snapshot-changed` produces updated at `:360–365`. Raw events and entries only pushed into a coalescer do not advance the renderer-publication sequence.

On either application exit, main maps the application result/error and captures these pinned dependencies without waiting for renderer application. The renderer waits only for that invocation’s cuts. It then publishes any immediate operation result and settles that invocation. An application failure cannot bypass its cuts by escaping through the outer RPC error channel.

### Acknowledgement and cancellation

| Procedure | Inner successful completion |
| --- | --- |
| List | Core list and attached projection settle. |
| Resolve | Syntactic resolver completes; old in-process method remains synchronous. |
| Create | Add settles; initial refresh starts at the existing detach point; return created projection without joining it. |
| Update | Common update sequence settles; return immediate projection or undefined after missing-prefix handling. |
| Remove | Core removal and best-effort cancellation iteration settle; return true, including ordinary unknown-ID removal. |
| Refresh absent/empty ID | Start direct forced all-pass and acknowledge without joining. |
| Refresh profile | Await get, begin refresh, acknowledge without joining refresh. |
| Refresh feed | Await get and refresh. Dedupe can return without a new fetch. |
| QueueItem | Manual admission/link operation settles; return only `queued`. |

Request interruption stops delivery interest. It does not roll back persistence, remove an admitted task or become profile-removal cancellation. Work that old invocations continued is accepted by `ApplicationOperations` before execution, with immediate synchronous prefixes at the old positions. Logical acknowledgement and cleanup release are separate. Retention charges survive delivery teardown until their actual owners release them.

### Changes registration and stream policy

`Changes` owns registration and changed observations. It performs **no initial list**.

| Property | Contract |
| --- | --- |
| Acquisition | Reserve registration and terminal capacity; publish acquisition/finalizer state; allocate bounded queue; install subscriber with incremental release ownership; verify live; expose `Registered`; drain observations. |
| Handshake | Exactly one first `Registered { token, epoch }`. An installer failure exposes no Registered. Synchronously produced values queue behind it. |
| Initial reads | Existing application-layout and page loads wait locally for Registered, then issue their own List with its token. No stream-owned extra read. |
| Existing window-load producer | Keep `M/index.ts:628–630` at its existing point. Its completed snapshot may reach live migrated subscribers through the shared publication bridge; no absent-subscriber backlog. |
| Changed production | One application broadcast bridge starts the existing independent list/project read per core changed callback. Subscribers do not each start another core read. |
| Order | Completed snapshots publish in completion order. No trigger-time, timestamp or revision sorting. |
| Coalescing | None at producer. Existing renderer serialized equality may suppress identical state publication. |
| Capacity | At most 256 queued snapshots, excluding the one in-flight Chunk awaiting Ack. Count every retained copy under byte budgets. |
| Chunking | One snapshot per emitted element/Chunk; demand-driven single take. No unaccounted bulk drain. |
| Enqueue | One nonblocking path checks live state, validates/snapshots, reserves bytes and admits the observation. |
| Changed-read failure | Log at the existing broadcast failure boundary; omit that failed snapshot; retain registration and accept later events. |
| List application failure | Log/swallow at the existing load boundary; leave Changes and its token active. |
| Overflow | Per-subscription entry/byte overflow terminates that subscription with visible typed failure. Aggregate exhaustion terminates the offending logical client. |
| Terminal delivery | Reserved correlated terminal control works while Ack is withheld. It closes the token and fails unsatisfied cuts independently of the stalled data worker. |
| Cancellation | Unregister this subscriber and release its queue. Shared reads already started may finish but cannot publish into closed registration state. |
| Replay | None. Replacement starts a new registration. |
| Absence | No subscriber backlog. Retain old-channel behavior for old recipients. |
| Presentation on termination | Keep last successful view, record/log the delivery failure and enter section 7’s recovery policy. Do not invent an empty success. |

The 256-entry limit is provisional until retained-memory measurement confirms it. Bounded ordered delivery and explicit failure are settled; silent coalescing is not an alternative.

Legacy delivery remains at each original recipient boundary. A migrated encoding/admission failure cannot suppress a later legacy recipient. The foundation preserves original listener/recipient traversal, exception boundaries and per-recipient sequence admission.

## 6. Services, drivers and Layers

Schemas precede contracts. Application services expose inner values, not `Completion`.

```ts
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import type * as Stream from "effect/Stream"
import type * as Core from
  "@vidbee/subscriptions-core/Subscription.model"
import type { TaskQueueShape } from
  "@vidbee/task-queue/TaskQueue.service"
import type { StoredEnqueueItemContext } from
  "@vidbee/subscriptions-core/Subscriptions.model"
import type { SubscriptionFailure } from
  "@vidbee/subscriptions-core/SubscriptionTimers.service"
import type { CreateSubscriptionOptions } from
  "../../shared/subscriptions/SubscriptionLegacy.model.js"

type Operation<A> =
  Effect.Effect<A, DesktopSubscriptionFailure>

export class DesktopSubscriptions extends Context.Service<
  DesktopSubscriptions,
  {
    readonly list: Operation<DesktopSubscriptionList>
    readonly resolve:
      (url: string) => Operation<Core.ResolvedFeed>
    readonly create:
      (input: CreateSubscription) =>
        Operation<DesktopLegacyMutation>
    readonly createCompatibility:
      (input: CreateSubscriptionOptions) =>
        Operation<DesktopLegacyMutation>
    readonly update:
      (id: string, updates: UpdateSubscription) =>
        Operation<DesktopLegacyMutation | undefined>
    readonly updateCompatibility:
      (id: string, updates: Core.SubscriptionUpdateInput) =>
        Operation<DesktopLegacyMutation | undefined>
    readonly remove:
      (id: string) => Operation<boolean>
    readonly refresh:
      (id?: string | undefined) => Operation<void>
    readonly queueItem:
      (id: string, itemId: string) => Operation<boolean>
    readonly changes: Stream.Stream<
      DesktopSubscriptionList,
      DesktopSubscriptionFailure
    >
  }
>()($I`DesktopSubscriptions`) {}

export class DesktopSubscriptionHost extends Context.Service<
  DesktopSubscriptionHost,
  {
    readonly start: Operation<void>
    readonly stop: Operation<void>
  }
>()($I`DesktopSubscriptionHost`) {}

export class SubscriptionTaskAccess extends Context.Service<
  SubscriptionTaskAccess,
  Pick<
    TaskQueueShape,
    | "add"
    | "hasTask"
    | "get"
    | "list"
    | "cancel"
    | "setMaxPerGroup"
    | "on"
    | "retryManual"
  >
>()($I`SubscriptionTaskAccess`) {}

export class SubscriptionAdmission extends Context.Service<
  SubscriptionAdmission,
  {
    readonly enqueue:
      (context: StoredEnqueueItemContext) =>
        Effect.Effect<string | null, SubscriptionFailure>
    readonly historyContains:
      (url: unknown) =>
        Effect.Effect<boolean, SubscriptionFailure>
  }
>()($I`SubscriptionAdmission`) {}
```

Each owning file uses its own `$DesktopId` composer. Existing package identities remain unchanged.

The delivery binding contract validates required tokens, captures pinned registration cuts and exposes the enveloped Changes stream. Its handler Layer is built with `SubscriptionRpcs.toLayer`. The typed create and update handlers narrow the broad result only after the common operation has completed; projection decode failure becomes the declared inner error and still acquires cuts. List validates its token but captures no dependencies.

The probe Layer implements all eight handlers. `ExistingSubscriptions.layer.ts` additionally compiles a token-bearing List handler against the actual native `Subscriptions` service, rather than an invented Promise-facade interface.

### Mandatory single-owner seam

G’s `SubscriptionsApi` privately constructs and warms a runtime and installs Promise-adapted host providers (`packages/subscriptions-core-legacy/src/api.ts:96–168`). Exposing that runtime alone would retain old desktop orchestration. Constructing another core Layer would duplicate state.

The package seam has these contracts:

| Contract | Required members |
| --- | --- |
| `SubscriptionOwnerHandle` | `native: Subscriptions["Service"]`; `layer: Layer.Layer<Subscriptions>` supplying that captured instance; `dispose: Effect<void>` |
| `DesktopSubscriptionOwnerOptions` | Fully supplied native `layer: Layer.Layer<Subscriptions>` |
| `DesktopSubscriptionOwner` | `SubscriptionOwnerHandle` plus `legacy: SubscriptionsApi` |
| `createDesktopSubscriptionOwner(options)` | Synchronously constructs/binds the shared desktop owner using the existing lazy initialization boundary |

Construction rules:

1. Desktop composition builds one fully supplied core Layer using native desktop admission/profile providers and the selected compatibility edges.
2. The compatibility entrypoint constructs one execution owner and binds one legacy facade to it.
3. Facade receivers and public-method dispatch binding exist before warm-up or callback execution.
4. `native` and `legacy` use the same context and service instance. Supplying `layer` never reconstructs core.
5. Synchronous callback re-entry uses the captured warmed owner context, including logging and scheduler-yield policy.
6. Legacy Promise calls use the shared exit-observer runner and exact mapper. Synchronous calls use the shared synchronous runner.
7. Existing `new SubscriptionsApi(options)` behavior remains for unrelated consumers.
8. Only application composition disposes the handle, once. Stop is not disposal.
9. Strict code receives native contracts by injection; it imports no compatibility implementation or private runtime field.

The native desktop update addition widens the three preference strings required by stored presentation. It shares the existing update body, spread order, category validation, timing and changed delivery. It changes no old declaration and adds no legacy entry validation.

### Selected providers

| Provider | Selection and obligation |
| --- | --- |
| Core coordinator, events, scheduler, leader and policy | Existing native implementations, one owner each |
| Desktop feed/profile admission | Native Effect orchestration over existing owners |
| Store/meta execution | Explicit supplied-Drizzle compatibility provider over the existing handle, sharing strict row interpretation |
| Feed transport | Explicit compatibility request/body provider until exact request, error, cancellation and settlement parity passes |
| `LegacyTiming` | Existing named turns for live compatibility callers |
| `SubscriptionTimers` | Referenced handles, falsy-handle behavior, fixed cadence and overlapping heartbeat dispatch |
| `SubscriptionDispatch` | Existing discarded-Promise rejection channels at their original detach points |
| `SubscriptionEntropy` | Existing UUID/ULID/random call positions and counts; separate lease-library time |
| `SubscriptionDates` | Existing `Date.parse` coercion, fallback and exception position |
| `SubscriptionLog` and cancellation | Existing recoverable callback positions, receivers, original reasons and default abort behavior |

These are named transitional edges with cutover gates. They do not permit an old Promise subscription/profile coordinator to be called ported.

### Main-process call graph

```text
new RPC
  → token validation and invocation-owned delivery
  → DesktopSubscriptions
  → shared native subscription owner
  → application Exit and pinned family cuts
  → Completion
  → renderer cut wait
  → result publication / caller acknowledgement

old invoke
  → exact compatibility forwarder
  → common native application sequence
  → broad compatibility result / original error mapper
  → existing registrar and Electron wrapping

MCP / embedded tools / HTTP
  → existing surface validation and orchestration
  → legacy facade bound to the same native subscription owner

subscription owner
  → store / metadata / leader / scheduler / policy
  → SubscriptionQueue
      → feed: settings snapshot → hydration → task builder → queue
      → profile: shared inspector/mapper → native platform enqueue
  → synchronous task-removed sink → existing microtask link-clear batch
  → changed → independent list/project reads
  → original recipient sends + migrated immutable admission
```

Feed admission captures `settingsManager.getAll()` before awaiting metadata hydration (`M/lib/subscriptions-host.ts:128–134`). A settings failure prevents hydration from starting. A settings change while hydration is held does not alter that task’s captured settings.

### Resource scopes

| Resource | Owner and lifetime |
| --- | --- |
| Database handle | Existing database owner; no open, close or reconfiguration by this capability |
| Subscription context | Application lifetime; survives stop/restart |
| SQL segment | Synchronous SQL, decoding and pure construction; explicit deferred `BEGIN` where currently transactional |
| Scheduler/leader timers | Core owner; stop cancels/relinquishes without joining active checks |
| Per-ID in-flight registration | Core check lifetime, preserving synchronous-prefix visibility |
| Profile cancellation token | Core check; removal cancels it; Instagram omission remains |
| Task-removal listener | Desktop start/stop, including current concurrent-start leak |
| Broadcast bridge | Existing application initialization lifetime |
| Changes registration/queues | Authenticated logical-client/document scope |
| Invocation wait | Document invocation owner; component unmount does not add cancellation |
| Accepted refresh/admission work | Application operation owner; cleanup release distinct from acknowledgement |
| Social manager/Instagram cache | Existing shared download/profile owners |
| Profile files/processes | Existing downloader scan/attempt scopes |
| Renderer history cache | `SubscriptionItems` mount; pending requests survive effect cleanup as today |

No SQL reservation spans fetch, Promise lookup, event delivery or a timing turn. Preserve non-atomic parent/item removal and existing conditional-column writes.

Subscriptions adds no spawn site. Metadata retains its 64 MiB stdout bound, diagnostics, retries, close interpretation and tree cancellation. Profile scans and downloads retain downloader per-site process, signal and file policies. Native process cutover belongs to 9.1.

Profile file reads/writes retain UTF-8/BOM behavior, closed inventory codecs, names, creation modes, direct-write versus temporary-rename distinctions, cache-before-save order and failure residue.

Use Effect scopes, finalizers, `acquireRelease`, `ensuring` and `onExit`. Never write JavaScript `try/finally` around `yield*`. Register lifecycle/completion state before possibly synchronous execution starts; separately preserve the old point at which deduplication becomes visible.

## 7. Renderer

One document registry owns the writable subscription view. Queries, events and mutations publish into that view; a cached List query does not replace it.

`SubscriptionClient` uses `AtomRpc.Service`, `SubscriptionRpcs`, the shared Electron Protocol Layer and `desktopAtomRuntimeFactory`. The probe compiles these actual installed forms. State is a retained writable `Atom.make<DesktopSubscriptionView[]>([])`; registration state retains the current token/epoch separately.

### Invocation-owned acknowledgement

Foundation `RendererInvocation.entry.ts` executes one direct client Effect per invocation. Shared Atom state is a publication destination, not an acknowledgement channel.

The primitive reserves and registers the invocation before startup, installs a fiber behind a Deferred start gate, installs its Exit observer and then releases execution. Immediate completion and reentrant document closure cannot leave an unregistered running fiber.

Each invocation:

1. Obtains its required current registrations locally.
2. Executes its own client Effect.
3. Awaits only its completion’s cuts.
4. Applies its operation-specific result publication.
5. Settles its own Promise from its own Exit.

Overlapping calls remain concurrent. A profile acknowledgement can settle while a feed refresh remains pending; reverse completion and failure belong to their own callers. A shared mutation atom, including a shared concurrent mutation atom, cannot implement this contract.

An optional fresh private result atom uses the same document invocation owner. It is not the default.

Document teardown closes admission, settles pending callers, interrupts installed delivery fibers and then disposes AtomRegistry. Component unmount retains the existing Promise callback lifetime. Accepted main work has independent ownership.

### Initialization and recovery

`Changes → Registered → existing List(token)` is the initialization sequence.

| Event | Policy |
| --- | --- |
| AppLayout mounts | Install one Changes consumer and initiate its existing load after Registered. |
| Subscriptions page mounts | Initiate its existing load after Registered; retain its 5000 ms polling timer. This is a separate existing producer. |
| Registered arrives | Store exact token/epoch, release locally waiting load/action invocations. Do not perform another list inside the stream consumer. |
| Initial List fails | Log/swallow; retain stream/token and last view. Later changed observations and polls remain usable. |
| Changed snapshot read fails | Main logs/omits it; registration remains active. |
| Stream actually terminates | Clear current-token availability, retain last view, log/store terminal cause and close unsatisfied old-token gates. |
| Recoverable stream replacement | One document-owned repair attempt reacquires Changes with opaque attempt identity. On new Registered, publish the replacement token. Reissue each still-waiting, not-yet-dispatched read using that token. |
| Poll during replacement | Wait locally for replacement Registered; do not send an invalid token or wait in main for an unidentified registration. |
| Previously dispatched List completes | Preserve its existing completion-order publication if delivery succeeds. Replacement does not add a consumer revision guard. |
| Mutation loses delivery after dispatch | Fail delivery; do not automatically replay the mutation. Its accepted work may already have committed. |
| Capacity/protocol terminal | Preserve explicit failure scope. Do not loop automatic reacquisition to defeat capacity. Resume through the foundation’s allowed recovery transition. |
| Document close/HMR replacement | Close the old invocation/recovery owners and their registrations. No cross-generation token reuse. |

No extra stream initial read is introduced. The existing application-layout load, page load/polls and window-load producer remain identifiable for startup-read counting.

### State and component behavior

| State/action | Required behavior |
| --- | --- |
| Initial view | `[]`; no new loading presentation |
| Set/load | Serialized equality suppression; load failures log/swallow |
| Poll | Every 5000 ms while page mounted, even if prior request remains pending; clear timer without canceling prior calls |
| Create | Encounter-order trimmed/deduplicated comma lists; same forwarded fields; no local append |
| Update | Replace matching existing rows before own acknowledgement; undefined does nothing; no append, optimistic patch or rollback |
| Remove | No eager deletion; events/polls update view |
| Refresh | Preserve source-specific acknowledgement and toast positions |
| Queue item | Same local added guard, Boolean distinction and success/info/error toasts; no optimistic link |
| Race | Older load/event/poll/update can overwrite newer publication |
| Equality | Existing serialized equality over canonical projection order and omission |
| Sorting/selection | Preserve stable ordering and reset selected ID when it disappears |
| Download status | Structural live records win over cached history; no new live-progress overlay |
| History cache | Cache success, missing and failure-as-null for mount lifetime; retain completed request entries |
| History cleanup | Suppress late publication without aborting/evicting requests |
| Profile hook | Same case-insensitive platform/owner matching and URL/tags/auto/path/categories/interval subset |
| Shared form | Same 500 ms detection debounce, same-URL Promise sharing, initialization, defaults, guards and cancellation |
| Edit URL | Copy only resolved source URL, feed URL and platform (`R/pages/Subscriptions.tsx:304–310`) |
| Presentation | Preserve layout, labels, styles, keys, virtual grid and control behavior |

Consume Changes with a scoped stream drain. An AtomRpc streaming query alone is a pull atom.

The application-wide capability provider covers both the Subscriptions screen and the Downloads profile-subscribe dialog. Directory success/cancellation/failure and documentation opening must work at both sites.

There is no subscription-refresh OS notification. Download completion notifications remain exclusively in the shared download-event path.

## 8. Other consumers and legacy facades

| Consumer | Interim route and retained behavior |
| --- | --- |
| Old invoke | Exact `list()`, `resolve(url)`, `create(options)`, `update(id, updates)`, `remove(id)`, `refresh(id?)`, `queueItem(id, itemId)` forwarders into the shared native application owner |
| Old create/update results | Explicit `createCompatibility` and `updateCompatibility` routes through broad projection; no narrow DTO decode after a successful write |
| Main imports | `M/lib/legacy/subscriptions-host.ts` retains getter/start/stop/remove/projector/snapshot signatures and their initialization/settlement behavior |
| MCP | Nine existing tools and resource delegation; unchanged zod metadata, strict parsing, cancellation and sanitization |
| Embedded tools | Existing list/test/manage TypeBox surface, path approval and creation metadata |
| HTTP | Existing loopback/auth/body limits, POST routing, scalar coercion, unchecked add/update and status/envelope behavior |
| CLI | Preserve current descriptor/automation behavior and priority vocabulary; `:rss` remains the existing not-implemented branch |
| Extension | No direct subscription consumer found; preserve existing authentication/download routes |
| Legacy Jotai | Project the strict registry and forward actions; no independently writable second list |
| Downloads/profile consumers | Same inspector, mapper, queue and admission owners; retain synchronous file-mutating getters and mapping prefixes |

The nine MCP tools remain:

`list_subscriptions`, `get_subscription`, `test_subscription`, `create_subscription`, `update_subscription`, `remove_subscription`, `refresh_subscription`, `list_subscription_items`, `queue_subscription_item`.

MCP list uses page size 20, strips items and reports attached count, which can be capped for profiles. Detail/items retain full history. MCP mutations retain URL probing, path approval, default auto-download false, enabled-create refresh behavior and their result envelopes. Manual queue retains `{ queued, taskId }` and agent metadata.

HTTP retains `String(body.id ?? "")` and corresponding item-ID coercions, direct low-level add/update, remove `{}`, full core refresh results, 404 unknown-operation and 500 handler errors (`M/local-api.ts:372–427`).

The inventory’s “no CLI RSS command” statement needs qualification against G: `apps/cli/src/subcommands/index.ts:39–40` recognizes `rss` and returns `notImplemented("rss", "NEX-132 owns :rss subcommands")`. It does not call subscriptions. This phase adds no implementation.

Old consumers do not pass through new JSON input/output codecs. Preserve successful wrong-kind scalar/null/NaN behavior required by the plan amendment. Preserve deliberately constructed errors exactly; do not emulate engine-message text outside the declared parity boundary.

Facades and old channels remain until phase 10 after source consumers and baseline probes move.

## 9. Semantics table

| Operation | Today’s behavior and source | Producer after port |
| --- | --- | --- |
| Obtain owner | Lazy synchronous schema setup/construction; broadcast initialization obtains it before normal boot (`M/lib/subscriptions-host.ts:102–154`; `M/index.ts:511`) | Mandatory shared-owner factory at same point |
| List | Ordered core rows and attached children; profile cap 300; desktop projection (`subscriptions-host.ts:320–323`; `C/SubscriptionStore.layer.ts:111`) | Same core read/projector; token establishes registration before read |
| Resolve | Syntactic trim/protocol/platform resolution; no fetch (`subscription-service.ts:43–44`; `C/feed-resolver.ts:88–124`) | Pure resolver and synchronous compatibility runner |
| Desktop create | Resolve/settings before add; latest uses `??`; auto/enabled default true; directory/template use `||`; sanitize; refresh even disabled; return created projection (`subscription-service.ts:52–83`) | Common broad-result creation operation, `createCompatibility` for old invoke, typed-adapter narrowing and accepted immediate detach |
| Core add | Profile normalization before host guard; catalog order; latest false/keywords empty for profiles; duplicate scan then insert; changed before result (`C/Subscriptions.layer.ts:451–475`) | Same body with pure rule extraction |
| Desktop update | Copy patch, sanitize only string template, `{id, ...normalized}`, duplicate reconstruction, missing-prefix undefined (`subscription-service.ts:98–112`) | Shared broad-result sequence and separate typed adapter |
| Core update | Truthy feed duplicate check before existence; categories use old platform; undefined interval removed; null clears; interval/categories/enabling clear next-check (`C/Subscriptions.layer.ts:477–509`) | Same body and native desktop preference declaration |
| Toggle interval | Page sends own undefined for omitted form interval (`R/pages/Subscriptions.tsx:287–302`) | Presence codec preserves it; same core interpretation |
| Mutation return | Constructed next row plus children; may differ from reread (`C/SubscriptionStore.layer.ts:201–238`; legacy `DrizzleSubscriptions.driver.ts:256–298`) | Broad main result; no reread/coercion |
| Legacy null directory | Patch can commit null and immediate projector includes it (`subscription-service.ts:98–104`; `subscriptions-host.ts:297–299`) | `updateCompatibility` returns broad projection unchanged |
| Negative zero | Immediate store-created interval can be `-0` before reread (legacy driver `:254–255`) | Tagged numeric encoding preserves `Object.is` identity |
| Disable | Does not cancel tasks | Same update |
| All-refresh | Falsy ID starts forced pass and acknowledges; force bypasses due/feed leadership but skips disabled (`subscription-service.ts:123–129`; `C/Subscriptions.layer.ts:349–364`) | Direct core route, outside scheduler pending gate |
| Scheduler overlap | Running pass plus one pending flag; generation controls rearm (`C/SubscriptionScheduler.layer.ts:40–95`) | Existing scheduler owner |
| Single refresh | Await get; profile detaches; feed joins (`subscription-service.ts:131–136`) | Same split |
| Trigger dedupe | Instance-local 30-second drop consumed before work; dropped trigger does not join (`C/SubscriptionScheduler.layer.ts:97–115`) | Same trigger route |
| Per-ID overlap | Shared visible completion; preserve synchronous-prefix re-entry (`C/Subscriptions.layer.ts:305–348`) | Same core registration/visibility protocol |
| Feed check | Captured rule; checking write without event; replace before enqueue/mark; metadata reread; final changed (`C/Subscriptions.layer.ts:230–303`) | Core plus native admission |
| Profile check | Token; checking write/event; fetch; reread/abort/existence guard; merge; sequential admission; final status/time; cleanup/event (`C/Subscriptions.layer.ts:143–229`) | Core plus native profile operations |
| Feed removal race | No feed abort; late child writes/admission can follow deletion | Preserved |
| Profile removal race | Reread/abort can stop merge; no new per-item abort; Instagram omits signal (`M/lib/profile-subscriptions.ts:81–88,174–180`) | Same checks and omission |
| Manual queue | Missing item false/null; live link false/existing ID; stale link clears; enqueue then truthy-ID mark; `queued = taskId !== null`; no mutex (`C/Subscriptions.layer.ts:531–562`) | Same operation; desktop Boolean |
| Admission/link failure | Download admission can precede failed mark and invoke rejection (`C/Subscriptions.layer.ts:554–561`; `M/lib/download-facade.ts:367–377`) | Same partial outcome; download cut on failure |
| Feed admission | Settings before hydration; builder; mkdir warning/continue; priority 10 and subscription group (`subscriptions-host.ts:122–141`) | Native sequence in same order |
| Task input | Trim/fallback directory; truthy template; first-occurrence tags; subtitle options; creation spread position (`M/lib/subscription-enqueue.ts:36–79`) | Pure calculation with supplied inputs |
| Profile decisions | X category remap, partial items, followed-category severity, retry time and versioned highlights (`profile-subscriptions.ts:38–180`) | Same pure rules/native coordinator |
| Profile admission | Destination/category/batch UUID; per-site groups; Threads/Snapchat cap 1; existing metadata omissions (`profile-subscriptions.ts:188–275`) | Native package services over shared owners |
| Remove | Linked lookup failure swallowed; core remove; linked active tasks then group pages of 200; cancel failures swallowed (`subscriptions-host.ts:192–224`) | Same native host sequence |
| Cancel acknowledgement | Queue persists/emits cancelled before executor cancellation wait; no general finish/reap join (`packages/task-queue/src/TaskQueue.layer.ts:653–685`) | Existing queue semantics and download cut |
| Task removal | Trim/record synchronously; one microtask batch; clear links, keep seen rows; reset batch before release settles (`C/Subscriptions.layer.ts:568–588`) | Same sink/dispatch |
| Start | Await core start, attach listener, set flag; concurrent starts overlap (`subscriptions-host.ts:157–166`) | Same timing |
| Stop | Unsubscribe, core stop, clear flag; no check/batch join (`:169–176`; `C/Subscriptions.layer.ts:430–433`) | Same operation; context survives |
| Snapshot event | Each changed launches independent read; completion determines send order (`M/index.ts:511–515`) | One bridge, independent reads |
| Initial reads | AppLayout load/listener and page load/polls are independent (`R/app-layout.tsx:286–301`; `R/pages/Subscriptions.tsx:268–275`) | Changes registration, then existing token-bearing loads; zero stream-owned reads |
| Renderer race | No revision guard across load/event/poll/update (`R/store/subscriptions.ts:33–49,87–95`) | Completion-order publication retained |
| Equality | Serialized equality suppresses unchanged lists (`R/store/subscriptions.ts:29–46`) | Canonical order/omission and same serialization semantics |
| History | Missing/error cached; pending requests retained; cleanup suppresses publication only (`R/pages/Subscriptions.tsx:518–602`) | Same component lifetime |

Exact settlement counts require current-build trace recording. Counting Effect yields does not prove Promise timing.

## 10. Obligations for the later model

The model moves behind these contracts later. This phase adopts no aggregate topology, event-store schema, durable-intent mechanism or importer from the draft.

| Boundary | Obligation |
| --- | --- |
| Application acknowledgements | Preserve Boolean/void, missing update, synchronous prefixes, settlement and create/profile/all detach boundaries. Durable receipts stay internal. |
| DTOs | Preserve attached desktop items, `downloadId`, permissive stored text, presence, numeric identity and immediate mutation results. |
| Item transactions | Feed replacement and profile merge retain complete service transaction visibility; aggregate fan-out cannot replace atomicity. |
| Links/existence | Committed item links are interpreted against the current authoritative persisted task source, including tasks absent from memory. Never query frozen old tables for new tasks. |
| Enqueue/link gap | Preserve admission-before-mark partial outcomes. Add no guaranteed repair, retry or deduplication. |
| Committed service outcomes | Remain authoritative. Model recording cannot reject an already committed outcome as a new request. |
| Complete-history claims | Require recoverable immutable outcome capture, owner/generation/order, command/transaction identity and applied watermark. Absence of best-effort observations is not a decision input. |
| Removal/reuse | Old-incarnation observations cannot resurrect removed model visibility. Preserve the existing live feed-removal race until separately changed. |
| Scheduling/replay | Keep process-local dedupe, leadership and overlap. Replay/import cannot fetch, enqueue, notify or restart historical work. |
| Detached authorization | Later host-compliant intent admission must fit existing acknowledgement/error timing. An application-owned fiber alone is not proof of durable host authority. |
| Publication | Preserve immediate reads, compatibility notifications, per-operation cuts and renderer overwrite races. Model revision is not a new public sequence. |
| Adoption gate | Replace composition behind the actual handlers and run the unchanged contract suite. Interface forwarding or storing old computed results is insufficient. |

Move these pure decisions now, at the same call sites:

| Decision | Pure owner and explicit inputs |
| --- | --- |
| Create normalization | `C/SubscriptionRules.model.ts`: supplied platform/catalog/options; desktop settings defaults remain at desktop boundary |
| Update interpretation | Same module: existing rule and presence-preserving patch; duplicate scan stays an ordered store observation |
| Feed candidates | Existing auto-download/policy modules: captured rule, known items, interpreted feed and original history observations |
| Profile candidates/versioning | Existing profile policy: reread rule, known items, result and discovery time |
| Due/severity/next-check jitter | Existing policy modules: explicit time, retry hint and random sample, sampled only where currently needed |
| Desktop category/error/title | Pure companions of `profile-subscriptions.ts`, with supplied values |
| Feed task construction | `subscription-enqueue.ts`, with captured settings, item, rule, trigger and creation metadata |

No extraction crosses fetch, reread, transaction, callback or await. No new unique constraint, durable scheduler, stronger transaction or recovery behavior is introduced.

## 11. Deliberate changes

No product behavior change is proposed.

The new foundation boundary requires validated new RPC payloads, explicit presence/observation encoding, finite admission, typed delivery failures and scoped subscriptions. Registration precedes token-bearing initial reads. These are the forced transport changes; retained legacy channels preserve their old validation, results, errors and timing.

The new Changes stream adds no initial snapshot producer. It retains completion-order overwrites and uses the existing load owners. Registration repair does not authorize mutation retry or a consumer revision guard.

Any additional successful legacy value outside the stated contracts must be preserved through an explicit lossless compatibility route. It is not normalized or rejected to satisfy a compiler. Any discovered behavior change receives a concrete owner-review disposition before implementation acceptance.

## 12. Verification owed

### Executed evidence for this revision

All five final commands exited zero. Receipts are `probes/revision3/verification.json` and the corresponding `*.raw.txt`.

```sh
NODE=~/.local/share/mise/installs/node/22.23.4/bin/node
export TSX_TSCONFIG_PATH="$PWD/probes/revision3/tsconfig.json"

"$NODE" probes/node_modules/tsrs/bin/tsrs \
  -p probes/revision3/tsconfig.json

"$NODE" --import ./probes/node_modules/tsx/dist/loader.mjs \
  probes/revision3/corpus.mjs

"$NODE" --import ./probes/node_modules/tsx/dist/loader.mjs \
  probes/revision3/legacy.mjs

"$NODE" --import ./probes/node_modules/tsx/dist/loader.mjs \
  probes/revision3/delivery.mjs

"$NODE" --import ./probes/node_modules/tsx/dist/loader.mjs \
  probes/revision3/host-order.mjs
```

The TypeScript configuration extends V’s real base, retains its diagnostics without suppression or severity changes, uses bundled module resolution and includes source declarations, services, handlers, actual package-backed List adapter, owner contracts, AtomRpc/Atom forms and consumer expressions. Effect APIs resolve from the real installed packages. The identity alias resolves to the standards-tooling package.

| Probe | What it establishes | Limit |
| --- | --- | --- |
| `src/Subscription.model.ts`, `.rpc.ts`, `.layer.ts`, `.atoms.ts`; tsrs command | Actual schemas, all eight RPC declarations, Completion/envelope placement, services, handler Layer and Atom forms compile | Not full desktop source/test closure or textual standards/JSDoc acceptance |
| `corpus.mjs` | Declarations construct; every unary payload/success/application-failure/outer-error path and Changes Registered/Observation pass real JSON codec round trips | Corpus uses controlled representative values, not every stored dataset |
| `corpus.mjs` | Every optional authored field accepts own undefined; interval omission/undefined/null/negative-zero cases; empty/falsy fields; unknown authored-key stripping; retained unusual values and marker objects | No claim of legacy input validation parity from typed-codec tests |
| `corpus.mjs` | Source-extracted current projector values retain item links, attached items, strings, numeric identity and ordered output through selected codecs | No application launch |
| `corpus.mjs` | Real RpcServer/RpcClient with amendment Protocol runs all eight procedures, token refusal before fixture work, inner List failure and later successful List | Injected application/delivery services; not production registration lifecycle |
| `corpus.mjs` | Mutating the actual selected List RPC success with `Rpc.setSuccess` to a closed ID-only DTO loses fields and is detected through the real Protocol | One codec mutation, not the complete mutation suite |
| `legacy.mjs` | Actual `SubscriptionsApi`, supplied Drizzle store and source-extracted desktop update/projector commit and return null directory; missing update returns undefined; broad schema accepts null and narrow typed view rejects it | In-memory isolated library/source execution, not installed registrar/Electron |
| `legacy.mjs` | Actual store-created interval is `-0`, and selected Create Completion through JSON/observation encoding retains it | Immediate result, not a promise that SQLite reread retains negative zero |
| `legacy.mjs` | Actual manual queue admission callback precedes link-mark rejection | Controlled enqueue provider, not a real download |
| `legacy.mjs` | Source-extracted removal publishes fixture cancellation before slow cancellation completes and before reply | Controlled queue, not native cancellation/reaping |
| `delivery.mjs` | Amendment direct invocation entry preserves reverse completion, caller-owned failure, immediate completion and document close with real AtomRegistry | No real React DOM/StrictMode application integration |
| `delivery.mjs` | Registration fixture makes zero stream reads; failed List leaves token; event and later poll recover | Policy/mechanism fixture, not actual AppLayout/page execution |
| `delivery.mjs` | Application gate holds failure behind admission cut, permits unrelated reply, holds removal reply behind cancellation cut and does not join detached work | Scripted publications; production send instrumentation remains owed |
| `delivery.mjs` | Replacement token cannot satisfy an unsatisfied old-token cut | Gate test; production capture/retirement implementation remains a 9.0 prerequisite |
| `host-order.mjs` | Frozen current expression and independent native calculation agree on settings-before-hydration and synchronous settings failure | Expression-level differential, not full host execution |

The legacy probe emitted the installed SQLite experimental warning; it was retained. No warning was suppressed.

Earlier `probes/src/` and hook results are historical. They do not establish the revised Completion/token/envelope declarations. Supplied amendment modules remain prototypes with the frozen amendment’s known implementation requirements; their passing local cases are not production acceptance.

### Executed freezing-pass correction evidence

The corrected selected contracts and legacy declaration fixture are in `probes/freeze/`. These reruns supplement the revision-3 evidence above. All five commands exited zero; receipts are `probes/freeze/verification.json` and corresponding `*.raw.txt`.

```sh
NODE=~/.local/share/mise/installs/node/22.23.4/bin/node
export TSX_TSCONFIG_PATH="$PWD/probes/freeze/tsconfig.json"

"$NODE" probes/node_modules/tsrs/bin/tsrs \
  -p probes/freeze/tsconfig.json

"$NODE" --import ./probes/node_modules/tsx/dist/loader.mjs \
  probes/freeze/corpus.mjs

"$NODE" --import ./probes/node_modules/tsx/dist/loader.mjs \
  probes/freeze/legacy.mjs

"$NODE" --import ./probes/node_modules/tsx/dist/loader.mjs \
  probes/freeze/delivery.mjs

"$NODE" --import ./probes/node_modules/tsx/dist/loader.mjs \
  probes/freeze/host-order.mjs
```

The tsrs command emitted no diagnostics. The corrected service returns the broad creation projection and declares `createCompatibility`; the retained mutable create declaration compiles. The selected Create handler narrows only at the typed adapter and captures cuts on narrowing failure. The full corpus rerun includes:

```text
RPC Create: payload, inner success/failure, outer error PASS
REAL server/client + amendment Protocol: all 8 RPCs, initial failure/recovery and token refusal PASS
MUTATION actual List Rpc.setSuccess + real transport closed DTO => omission detected PASS
```

The extended `legacy.mjs` uses the source-extracted desktop create body, actual `SubscriptionsApi` and supplied Drizzle with an isolated in-memory database. An independently authored common-create fixture receives the same raw inputs in a separate execution; it does not receive the old computed result. Its selected typed handler is exercised with each broad result. The real output is:

```text
A1 autoDownload: 0: source-extracted old and independent common create fulfill; broad type accepts; selected typed Create rejects inside Completion with cuts PASS
A1 checkIntervalMs: NaN: source-extracted old and independent common create fulfill; broad type accepts; selected typed Create rejects inside Completion with cuts PASS
A1 disabled create launches held refresh before immediate acknowledgement; no reread or coercion PASS
```

The probe also reruns the existing null-directory, missing-update, negative-zero, admission/link-failure and removal cases. It retains the installed SQLite experimental warning. This is local source/library and selected-adapter proof, not production native orchestration, installed Electron, exact Promise-turn, populated-result validation, registration-repair or packaged acceptance. IR1–IR2 remain implementation proof obligations.

### Inventory corrections and retained goldens

G contains eighteen `loopback-subscriptions--*.json` cases:

`probe-rss`, `probe-atom`, `probe-discovery`, `probe-invalid-xml`, `probe-failed-candidates`, `create-read`, `duplicate`, `refresh-items`, `refresh-revision`, `auto-download`, `refresh-no-duplicate`, `manual-queue`, `remove-task-requeue`, `seen-after-removal`, `remove-read`, `remove-pending`, `renderer`, `reopen`.

Their producer is `apps/desktop/scripts/port/golden/subscriptions-core-cases.mjs`, with renderer/restart companions. Keep them unchanged.

The renderer case’s producer, `subscriptions-core-renderer.mjs:59–91`, establishes successful-item route smoke. It does not prove edits, toasts, cache lifetime or concurrency. `reports/9.0.md` records foundation characterization and historical/superseded receipts; its green characterization is not proof that these proposed production services exist.

### Current-build recording before source changes

The following are named implementation probes to create under `apps/desktop/scripts/port/subscriptions/`. They are **owed**, not executed by this draft.

| Probe | Current-build observations to freeze |
| --- | --- |
| `invoke-observe.mjs` | All seven methods: arguments, results, own properties, order, original errors, synchronous effects and settlement clock through completion |
| `create-update-observe.mjs` | Defaults/truthiness, duplicate reconstruction, disabled-create refresh, string sanitization, missing-prefix catch, all own-undefined fields, null interval/directory, stored preference resubmission, `items` forwarding, immediate result versus reread |
| `admission-observe.mjs` | Actual host settings/hydration order; settings failure; task options; queue admission then link failure; all profile helper branches and metadata omissions |
| `refresh-observe.mjs` | Falsy ID, feed/profile split, held detached work, dedupe drop, per-ID sharing/re-entry, forced-pass overlap and scheduler pending rerun |
| `publication-observe.mjs` | Per-recipient sends; feed/profile checking/final notifications; pending/inverted snapshot reads; download coalescer/flush boundaries; publication before success and failure |
| `remove-lifecycle-observe.mjs` | Linked lookup failure, unknown removal, encounter order/statuses, 200-item pagination, cancellation waits, concurrent starts, stop during checks/batches, disposal distinct from stop |
| `renderer-observe.mjs` | Actual AppLayout/page read counts and ownership; initial List failure then event/poll recovery; late overwrite; update-before-own-ack; error/toast behavior |
| `renderer-cache-observe.mjs` | Visible-window history requests; success/null/error retention; remount reset; pending work after cleanup |
| `dialogs-observe.mjs` | Both dialog entrypoints: directory success/cancel/failure, documentation opening, edit/reopen, detection sharing and forwarded profile subset |
| `surface-observe.mjs` | MCP probe/approval/envelopes; HTTP scalar/null/falsy/coercion/error matrix; CLI RSS not-implemented behavior and extension reachability |
| `edge-process-observe.mjs` | Referenced timer process liveness, discarded-Promise rejection channels, entropy/date call order, feed request/body cancellation and settlement |
| `drizzle-observe.mjs` | Supplied-object preparation/logger/error/transaction behavior, synchronous re-entry, conditional writes and rollback |

Record old outputs independently. Drive the candidate from the same raw inputs and controlled dependencies. Never feed the old computed decision into new code and compare its storage of that answer.

Normalize only fixture identities, paths, clocks and ports explicitly allowed by the baseline. Preserve messages, property presence/order, callbacks, event order and settlement markers. Candidate admission must allow changed candidate bytes while retaining immutable baseline provenance.

### Implementation test gates

| Section | Required test/probe |
| --- | --- |
| 2 | `SubscriptionOwnership.test.ts` plus plain-Node compiler-graph capture: complete imports, alias/type/declaration paths, monotonic ownership and browser bundle guards |
| 3 | `Subscription.model.test.ts`: full selected-declaration census, field presence, numeric identity, unknown keys, dense-array failures, projector order and mutable old declarations |
| 3/7 | `SubscriptionConsumers.test.tsx`: actual page/shared-form/profile-hook compile and execute without casts, enum normalization or rereads |
| 4 | `SubscriptionErrors.test.ts`: every owned text and delegated mapper, core legacyMessage, duplicate page/hook recognition, old original identity and no FiberFailure |
| 5 | `SubscriptionRpc.test.ts`: real handlers, JSON serialization and Protocol; payload rejection, inner failure/cuts, cancellation/commit boundaries |
| 5/7 | Candidate/foundation integration, with separate provenance: `SubscriptionStreams.test.ts`: registration acquisition, zero stream initial reads, Registered-before-load, failed initial List recovery, failed changed read recovery, inversion, old/new token replacement, failed initial/replacement acquisition and later-poll recovery, closure and no replay |
| 5 | `SubscriptionCuts.test.ts`: actual admission→mark failure, cancellation→remove reply, detached refresh, pending snapshot exclusion and unrelated-call independence |
| 5 | Foundation terminal/accounting regressions plus `SubscriptionStreams.test.ts`: held Ack, 256 pending plus in-flight, byte growth, overflow, unaffected client and terminal visibility |
| 6 | `SubscriptionOwner.test.ts`: facade/native identity, one store/queue/mapper/context, binding-before-warm-up, synchronous re-entry, native providers and disposal |
| 6 | `SubscriptionEdges.test.ts` and `edge-process-observe.mjs`: Node liveness/rejection channels, timing, entropy/date and supplied-Drizzle parity |
| 7 | `SubscriptionRenderer.test.tsx`: real React overlap, reverse exits, publication before own acknowledgement, document teardown, StrictMode/HMR and late overwrite |
| 7 | `SubscriptionRendererCache.test.tsx`, `dialogs-observe.mjs`: cache lifetimes and both mounts |
| 8 | `surface-observe.mjs` and unchanged MCP/HTTP/CLI/extension goldens |
| 10 | Later `SubscriptionModelContract.test.ts`: actual replacement through unchanged handlers, with authority, transactions and admission timing |

### Mutation proofs

`subscription-mutations.mjs` applies temporary candidate mutations, verifies each intended failure, restores it and reruns the unchanged baseline. It must reject:

- Undefined interval becoming null; global undefined stripping; missing update becoming null; negative zero becoming zero.
- Broad compatibility result entering the typed renderer union; `"123"` artwork becoming bigint; `taskId` replacing `downloadId`; missing attached items.
- Narrow decoding on the old successful null-directory route.
- Shared result atoms, serialized overlapping calls or one caller receiving another’s Exit.
- Application failure escaping outside Completion; omitted download cut after admission/link failure; waiting for pending subscription snapshots.
- List without active token; stream-owned extra initial list; List failure closing registration; replacement satisfying an old unsatisfied cut.
- Awaiting detached profile/all refresh, detaching feed refresh or routing forced all-passes through scheduler pending state.
- Reading settings after hydration.
- Mapping core `.message` instead of `legacyMessage`.
- Reordering projector fields or replacing serialized equality.
- Adding feed checking notifications, rejecting retained preference strings or replacing `||` with `??`.
- Stale-result suppression, history-failure eviction, eager create/remove publication or route-only capability injection.
- A second owner, Promise profile coordinator, post-fork state registration or JavaScript cleanup around `yield*`.

The executed List codec mutation in `corpus.mjs` is one member of this future suite, not evidence that the others ran.

### Packaged acceptance

`packaged-subscriptions.mjs` exercises an isolated synthetic profile offline: direct/discovered feeds, edit/reopen, toggle/remove, feed/profile/all refresh, manual/automatic admission, history/status, removal/requeue, restart, pending refresh during removal/reload, both dialog mounts, directory cancellation, links/copy, old/new transport coexistence and notification multiplicity.

Each claimed successful refresh requires a new completed fixture response plus completed policy/persistence evidence. An up-to-date row inside dedupe is insufficient.

Run the port-guide gate under pinned Node: strict source/tests, compatibility checks, port/standards/schema/identity/JSDoc gates, whole-repo checks/tests, dependencies, Linux package, CLI build and unchanged goldens. Use complete plain-Node compiler capture and negative renderer bundle guards against source and built paths.

Linux source/package proof does not establish Windows/macOS dialogs, paths or process trees; physical notification/clipboard behavior; authenticated mapping; remote rate limits; or live extraction. `packaged-subscriptions.mjs` must report each unavailable exercise separately. Injected profile providers prove orchestration only.

## 13. Implementation lanes

These are future worktrees, not sessions started by this draft. At most three implementation lanes run concurrently. Freeze characterization first, then contracts and the package seam. One integrator owns shared composition.

| Order/lane | Exclusive ownership and worktree | Gate |
| --- | --- | --- |
| 0. Characterization | `~/YeeBois/workstation-apps/worktrees/VidBee/port-subscriptions-characterize`; named section-12 observers, baseline artifacts and missing goldens | Repeated current-build observations, provenance and mutation sensitivity; no application changes |
| 1A. Foundation prerequisite | 9.0’s canonical field/observation/delivery/registration/invocation/operation-owner modules and tests | Frozen amendment regressions pass on production modules; exact subscription declarations/census rerun |
| 1B. Contracts | `…/port-subscriptions-contracts`; `S/subscriptions/*`, `DesktopSubscriptions.service.ts`, `.errors.ts`, browser capability contract and declaration fixtures | Freeze DTOs, broad compatibility route, RPC payloads, ledger, consumer types and codec corpus before branching consumers |
| 1C. Package seam | `…/port-subscriptions-edges`; compatibility owner factory/binding, native desktop-update declaration/body seam and provider exports | Same-owner/native-provider/re-entry/disposal proof and package oracles |
| 2A. Host | `…/port-subscriptions-host`; subscription IPC implementation, strict/legacy host files, profile/enqueue implementation, capability delivery binding and tests | Timing/resource/source differentials and native orchestration; excludes 1B’s frozen service/error files |
| 2B. Renderer | `…/port-subscriptions-renderer`; strict atoms, old store adapter, page/dialog/hook and renderer tests | Actual consumers, invocation/cut/read-recovery/race/cache tests; unchanged presentation |
| 2C. Shared UI/pure rules | `…/port-subscriptions-ui`; three shared UI components/strict closure; `C/SubscriptionRules.model.ts` **and extraction edits at existing `C/Subscriptions.layer.ts` call sites after 1C** | Strict web closure; independent pure-rule oracle parity |
| 3. Integration | `…/port-desktop-subscriptions`; `M/index.ts`, registrations/composition/import rewiring, renderer roots/layout/router/provider, manifests/configs/bundler/ownership baseline | Both mounts, same-owner graph, actual 9.1 dependencies, old/new parity, complete gate and packaged exercise |
| 4. Review/closeout | Integration worktree; fixes routed to original file owners | Independent concern reviews, re-verification, report and exact retained compatibility inventory |

9.1 supplies native queue admission, authoritative persisted task existence, task get/list/cancel/removal sinks, shared mapper/inspector operations, metadata hydration and browser-safe filesystem/history/download/image capabilities. Its registered download family supplies the token used by this ledger.

If 9.1 lands later, characterization, contract work and bounded implementation against injected contracts may proceed. Composition borrows existing owners through the mandatory seam and application-wide provider. Strict code never imports legacy implementation. No false existence answer, second queue or Promise coordinator wrapper is accepted. Final completion waits for actual native admission/existence, production delivery and strict dependency closure.

## 14. Behavior kept as it is

These are owner-review candidates, excluded from this phase’s fixes:

| Behavior | Consequence |
| --- | --- |
| Duplicate scan and write remain separate | Concurrent mutations can pass the same duplicate check |
| Seen rows precede automatic admission | Failed/null admission can suppress later automatic retry |
| Admission precedes link marking | A failed mark can leave an unlinked task |
| Manual queue has no per-item mutex | Concurrent calls can both admit |
| Feed uses captured rule and no removal abort | Late writes/admission after removal remain possible |
| Profile checking write/event precede main cleanup region | Early failure can retain controller state |
| Instagram omits subscription signal | Removal does not cancel that inspection through the token |
| Social abort registration follows prior-map wait | Missed-pre-abort window remains |
| Disable does not cancel tasks | Removal alone performs host cancellation |
| Stop does not drain | Checks and link batches may settle afterward |
| Started flag follows awaited start | Concurrent starts can leak listeners |
| Leadership acquisition happens at startup | Nonleader does not automatically acquire on periodic ticks |
| Forced passes overlap | They do not inherit scheduler pending gating |
| Profile list attachments cap at 300 | List and detail counts can differ |
| Conditional full-row writes omit some absent optionals | Immediate clearing can differ from SQL reread |
| Duplicate incoming IDs are not universally deduplicated | Item transaction may fail |
| Snapshot results publish by completion | Older results can overwrite newer state |
| History null/error remains cached | Later availability need not be fetched in that mount |
| Edit copies three resolved fields | Source kind/owner normalization is not rerun |
| Profile subscribe forwards a subset | Omitted preferences remain omitted |
| Profile getters can mutate files | Deferring them changes timing and mapping overlap |
| Platform helpers omit some creation metadata | Feed metadata does not automatically propagate |
| Referenced timers/discarded Promises are observable | Fiber supervision is not liveness/rejection parity |

Use explicit encounter-order sequences for categories, tags, candidates, listeners, cancellation IDs and snapshots. HashMap/HashSet iteration does not determine public order.

Where a helper exposes both data-first and data-last forms, compile and execute both real overloads. A passing data-first use does not establish the other form.

## 15. Open questions

The demonstrated null-directory and negative-zero cases are resolved by this design. They are not conditional discoveries left to implementation.

| Question | Options | Recommendation |
| --- | --- | --- |
| Measured valid workloads exceed proposed finite stream/retention budgets | Adjust finite constants/accounting from measurements; redesign bounded allocation; authorize a delivery product change | Preserve ordered delivery and explicit failure; adjust finite implementation limits with evidence |
| Characterization finds another successful legacy value outside the broad projection contract | Extend the schema-backed lossless route; retain the caller on compatibility while extending it; authorize rejection as a product change | Preserve the caller/value and extend the contract; do not normalize, cast or reject to satisfy tooling |
| A selected native edge cannot preserve current timing/error/resource semantics | Keep the named compatibility edge with its exact removal gate; produce an independently reviewed parity implementation; authorize a deliberate change | Retain the explicit edge until its proof passes; no hidden old coordinator |

No model-adoption choice is made here. No unresolved behavior choice from the capability reviews is delegated to a renderer or host implementer.

## 16. Review disposition

The design was frozen after its final review with the listed contract corrections and mandatory implementation requirements.

| `REVIEW-FINAL.md` finding | Disposition |
| --- | --- |
| **1. Major: legacy create needs broad-result separation** | **Corrected in §§3, 6, 8 and 9; evidence in §12.** Common broad creation operation and explicit `createCompatibility`; only typed RPC narrows. `probes/freeze/` typechecks the corrected service and legacy declaration and exercises numeric `autoDownload: 0`, `checkIntervalMs: NaN`, immediate projection and refresh launch. |
| **2. Major: broad validation example fails with populated items** | **Carried as IR1 in §17.** Validate the type side and return the original projection; the encoded-side decoder is a required negative control, not the implementation. |
| **3. Major: failed acquisition/replacement recovery incomplete** | **Carried as IR2 in §17.** Retire failed attempts, settle waiting invocations, retry recoverable acquisition on a later load, retain terminal scopes and never replay dispatched mutations. |
| **4. Minor: baseline table includes candidate token behavior** | **Corrected in §12.** Current-build renderer observations retain read counts, failed List then event/poll, completion-order overwrite and update-before-ack. Registration acquisition, token replacement and failed-repair cases belong to candidate/foundation integration tests with separate provenance. |

“Addressed” means this revision specifies the correction and identifies its executed evidence and remaining production gate. It does not mean phase implementation is accepted.

| `REVIEW.md` finding | Disposition | Probe and remaining gate |
| --- | --- | --- |
| **1. Major: successful legacy mutation cannot bypass narrow application result** | **Addressed in §§3, 6 and 8.** Explicit `DesktopLegacyMutation`, common broad-result sequence and `updateCompatibility`; narrowing occurs only at typed RPC adapter. | `legacy.mjs` runs actual core/supplied Drizzle and source-extracted desktop update/projector: null commits/returns, broad accepts, narrow rejects, missing returns undefined. Installed registrar/Electron differential remains `invoke-observe.mjs` and `SubscriptionRpc.test.ts`. |
| **2. Major: missing operation dependency ledger** | **Addressed in §5.** Seven-operation token/family ledger; concrete admission points, renderer prefixes, success/failure capture, pinned identities and exclusions. | `legacy.mjs` observes admission before mark rejection and cancellation before removal reply; `delivery.mjs` tests gate waiting and unrelated progress. Actual publisher/handler integration remains `publication-observe.mjs` and `SubscriptionCuts.test.ts`. |
| **3. Major: duplicate initial ownership and failed-load recovery** | **Addressed in §§5 and 7.** Changes registers only; existing loads own initial reads after Registered; List failure retains token; actual stream termination has explicit replacement policy. | `delivery.mjs` tests zero stream reads, failed List/event/poll recovery and old-token failure. `corpus.mjs` exercises token-bearing List/Registered with real RPC and injected services. Actual AppLayout/page startup counts and recovery remain `renderer-observe.mjs` and `SubscriptionStreams.test.ts`. |
| **4. Major: evidence predates amended declarations** | **Addressed.** Revision-3 probes declare and typecheck the selected Completion/token/envelope payloads, handlers and client forms. Historical results are labeled historical. | Final tsrs command and `corpus.mjs` pass; all eight RPCs run through real server/client/Protocol and selected JSON codecs. Full production handlers, strict closure and React/package proof remain named section-12 gates. |
| **5. Minor: negative zero lost** | **Addressed in §3.** Authored finite fields use tagged observed numbers; whole observed successes preserve all numeric fields. | `corpus.mjs` uses `Object.is`; `legacy.mjs` obtains actual store-created `-0` and round-trips it through selected Create Completion and real JSON/observation codecs. Current-build invoke characterization remains `create-update-observe.mjs`. |
| Text-only: direct invocation default contradicted by private-atom wording | **Corrected in §7.** Direct invocation-owned Effects are default; private atoms are optional adapters. | `delivery.mjs` exercises the amendment’s direct entry, reverse completion, own failure, immediate completion and document close. Real React integration remains `SubscriptionRenderer.test.tsx`. |
| Text-only: pure extraction call-site ownership ambiguous | **Corrected in §13.** Lane 2C owns new pure module and existing call-site extraction after 1C. | Future file-ownership and oracle gate: `SubscriptionOwnership.test.ts` and pure-rule tests. |
| Text-only: host companions overlap frozen contracts | **Corrected in §13.** Lane 2A explicitly excludes 1B’s service/error files. | Future ownership manifest and integration review. |

| `REVIEW-1.md` carried item | Disposition and proof boundary |
| --- | --- |
| **1. Undefined interval becomes null** | Retained correction. `RpcOptional` preserves omitted/own undefined/null; `corpus.mjs` exercises every authored optional field and interval matrix. Actual toggle/core-state differential remains `create-update-observe.mjs`. |
| **2. Concurrent acknowledgements share results** | Retained correction. Direct invocation ownership; `delivery.mjs` proves reverse completion and caller-owned failure. Actual feed/profile UI split remains `refresh-observe.mjs` and renderer tests. |
| **3. Broad mutation unsafe/unusable on wire** | Separate broad main-only and usable typed renderer contracts. `corpus.mjs` preserves string artwork and item shape; `legacy.mjs` proves broad compatibility routing. Consumer expressions compile; complete actual screen/form/hook proof remains `SubscriptionConsumers.test.tsx`. |
| **4. Settings/hydration order reversed** | Settings first. `host-order.mjs` independently tests held hydration and synchronous settings failure; full source host proof remains `admission-observe.mjs`. |
| **5. Error text lost** | Main/wire getters and `legacyMessage` mapping retained. `corpus.mjs` round-trips populated application errors; actual core-backed adapter compiles. Complete core/error/UI matrix remains `SubscriptionErrors.test.ts`. |
| **6. Native single-owner composition unspecified** | Mandatory factory/binding/provider/disposal contract in §6, gated before host completion. Owner interfaces compile; executable production ownership/re-entry proof remains `SubscriptionOwner.test.ts`. |
| **7. Dialog outside route provider** | Application-wide provider and one integrator; both mounts explicitly owned. Proof remains `dialogs-observe.mjs` and renderer integration tests. |
| **8. Schema order changes serialized equality** | Canonical projector order plus whole observed encoding. `corpus.mjs` compares own key order from actual source-extracted projection. Actual update→list and old-event→new-list suppression remains renderer characterization. |
| **9. Mutable old declarations lost** | Old structural declarations stay separate; new input keys/arrays remain mutable. Consumer assignment/nested-mutation fixtures compile. Full old-configuration declaration parity remains `Subscription.model.test.ts`. |

## 17. Implementation requirements

All implementation lanes are bound by these requirements and must prove each one; the document’s existing requirements and gates remain binding.

1. **IR1 — Validate broad main results on their type side and return the original object.** Do not decode raw application items through their wire representation. **Proof:** source-extracted old invoke versus candidate invoke with populated items, thumbnail/link fields, null directory, omitted optionals and negative-zero timestamps; assert returned values, own keys/order, unchanged projection identity at the validation boundary, committed row, and absence of a reread. The existing encoded-side decoder must fail the negative control.

   For example, use `S.is(S.toType(DesktopLegacyMutation))` with the declared failure mapping. Do not return a decoded clone.

2. **IR2 — Complete registration recovery on every acquisition exit.** Own one attempt, retire failed attempts, settle waiting invocations, and allow a later load to retry recoverable acquisition. Keep capacity/protocol termination explicit and never replay dispatched mutations. **Proof:** initial acquisition failure and replacement-acquisition failure, followed by restored availability and a later poll; assert bounded waiters, released reservations, exactly one active acquisition, successful recovery, stale-attempt rejection, and no mutation replay.

   Failed acquisition retires its attempt and settles its waiting invocations with the declared delivery failure; load callers log/swallow it. A subsequent load may initiate one fresh acquisition when the failure is recoverable. Capacity/protocol failures retain their terminal scope and require an explicit permitted reset/new-client transition. Never replay dispatched mutations.