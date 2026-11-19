# Design: `@vidbee/subscriptions-core` (phase 6a)

Status: reviewed, findings resolved (section 13).

Inputs: `PLAN.md` sections 3–7 and Amendments; `PORT-GUIDE.md`; `tsconfig.base.json`; the reviewed db, task-queue and downloader-core designs; the phase 4 packages; the source inventory; the independent review; current source and consumers; installed Effect 4.1.4 and `@effect/platform-node` 4.1.4; `GOLDENS.md`; `reports/4-loopback.md`.

Source snapshot: clean `main`, `79f556b`. This is a read-only design. The standalone typecheck was reproduced; no implementation, test-suite execution, packaged launch or persisted-data proof is claimed. The independent review’s probes are evidence for its findings, not completed implementation gates.

Paths below are repository-relative. **C** means `packages/subscriptions-core/src/`; **M** means `apps/desktop/src/main/lib/`. Line numbers identify existing source, not proposed companions.

## Amendments after the code reviews (2026-11-18)

This design was drafted and reviewed against `main` at `79f556b`. Before its implementation
started, the earlier ports were code-reviewed and fixed (`reports/review-fixes.md`) and the
downloader port merged (`reports/5.md`). Where the text below disagrees with this section, this
section wins; the characterization step re-checks every statement about current behavior against
the tree it runs on and corrects the design where the source has moved.

- `PORT-GUIDE.md`, "Defect classes found by code review" and "Parity boundary for inputs outside
  the declared types", are binding: exact parity inside declared types; outside them parity only
  where the old code returned a result for `null`, a JSON scalar of the wrong kind or `NaN`; no
  emulation of engine error text. Wherever this design asks for an old engine `TypeError` to be
  reproduced for a type-violating call, that requirement is dropped unless the value is external
  data the package itself reads and the item is listed in section 9 or 11.
- The port keeps three differential oracles as permanent tests, built before parity is claimed:
  pure functions, strict schemas against the zod schemas they replace (acceptance and decoded
  value), and the stateful entry points driven side by side with the old classes
  (`PLAN.md`, Amendments of 2026-11-18).
- The implementation is code-reviewed by independent sessions before its pull request.
- Driver errors: since `reports/review-fixes.md`, callers of the supplied-Drizzle store receive the
  original better-sqlite3 error (class, `code`, message), as before the Drizzle 1.0 move; the
  store unwraps Drizzle's query-error wrapper at its boundary (`rethrowQueryError` in
  `@vidbee/db/legacy`). Wherever this design says a `DrizzleQueryError` is retained by identity,
  read: the original driver error is rethrown by identity, and a subscription's saved last error
  carries SQLite's message. A value that is not a top-level Drizzle wrapper passes through by
  identity.

Corrections and rulings after the characterization of the old package (`reports/6a.md`), which
was written against the unchanged source after this design was reviewed:

- Zod schemas (section 3, "Zod liveness") and the characterization suite. The characterization
  pins all twenty public zod schema exports: identities, acceptance, decoded outputs and zod
  issues. The design's decision stands: schemas with no consumer are deleted, and
  `SubscriptionUpdateInputSchema` with what it references moves unchanged to the compatibility
  package. For the moved schemas every characterization case is kept and retargeted. For the
  deleted schemas the cases that assert the export's existence, its identity and zod's issue
  objects are removed with the export, listed in the report as part of the declared removal;
  their acceptance and decoded-output fixtures are kept and become the differential oracle of the
  Effect models that take over the modeling role, wherever such a model exists. Where the Effect
  model deliberately does not inherit an unused refinement, the cases that differ are listed in
  the report next to the declared change.
- The six standalone type errors named as a prerequisite no longer exist on this tree: the
  package's typecheck passes unchanged.
- Malformed external XML: the exact `TypeError` text is an engine message that differs between
  Node and Bun. The Node oracle pins the observable sequence (fetch, parse, the checking write,
  traversal, warning, the failed write, the fulfilled refresh); the message itself is only
  required where section 9 or 11 lists the item.
- The copy of the owner's database available to this phase holds no subscription and no item
  rows, so the decode audit on real data is vacuous for those tables (seven metadata rows
  decoded). Mapping of non-empty rows is proven on synthetic rows only; the report must say so.

## 1. What the package is, and what makes its port risky

Subscription configuration, feed discovery and parsing, RSS and profile download policies, SQLite persistence, feed-check scheduling and cooperative leader election. There are 3,696 source lines, one 377-line test file and fifteen export entries.

The desktop supplies the shared database, profile mappers, history lookup, task lookup, admission and logging (`M/subscriptions-host.ts:102–153`). Core does not own a database connection, download directory, downloader process or task queue.

Six properties decide the design:

1. **Promise methods have synchronous prefixes.** Most store methods execute all SQL before returning their Promise (`C/store.ts:362–603`). API methods invoke those prefixes before their first suspension. Moving the work behind a scheduled fiber changes immediate database observations.
2. **Synchronous results are public.** URL resolution, form/status/timeline helpers, constructors, listener registration, local leadership, scheduler start/stop and task-removal notification return synchronously. IPC resolution depends on this (`apps/desktop/src/main/ipc/services/subscription-service.ts:43–44`).
3. **Callbacks can re-enter.** Changed listeners run synchronously over a live Set; injected stores, enqueue callbacks, task lookup, timers, loggers and leader-state callbacks can execute code before returning. An asynchronous event stream does not preserve that protocol.
4. **Persistence and parsing are permissive.** JSON list failures become empty lists; unknown persisted enum strings pass through; booleans mean exactly `1`; most empty optional strings disappear. Parser custom fields can contain objects despite the declared optional-string types. Narrow decoding before the existing interpretation points changes successful values and failures.
5. **Scheduling and cancellation are limited by design.** The lease is acquired at startup, not retried by periodic ticks. Checks share work per subscription, but different subscriptions may run concurrently. Removal aborts profile checks only. Stop does not join checks or pending removal batches. Detached timer failures can become unhandled Promise rejections.
6. **Successful refresh is missing from the current golden boundary.** Existing subscription goldens mostly exercise reads, configuration and offline failure. A namespace-local XML feed can cover real fetch → parse → policy → persistence → admission before the implementation changes. Each claimed refresh needs evidence of a new request and completed processing.

The standing directive is applied throughout: schemas precede contracts and implementations; A2 preserves behavior, including bugs; A6 preserves old signatures, values, error classes/messages and synchronous-versus-rejected failure. Section 9 lists the only deliberate changes.

## 2. Shape of the port

- **`packages/subscriptions-core`**, ported: models, services, layers, native SQL persistence and orchestration, plus unchanged synchronous helpers that pass the full rule set.
- **`packages/subscriptions-core-legacy`**, unported and temporary: the old classes, Promise interfaces, host defaults, timer and fetch bridges, supplied-Drizzle persistence bridge, and the live zod schema dependency closure. It imports the strict package, shrinks with its consumers and is deleted in phase 10.

Ported code never imports the sibling or another unported workspace package. Phase 5 must supply the ported downloader helpers used by `feed-resolver.ts`, `download-options.ts` and `types.ts`. `TaskCreationMetadata` comes from the strict task-queue models, replacing the current type import from task-queue-legacy (`C/api.ts:1`).

Existing filenames stay. New companions follow D21: `Subscription.model.ts`, `Feed.model.ts`, `Leader.model.ts`, `Subscriptions.errors.ts`, `Subscriptions.service.ts`, `Subscriptions.layer.ts`, and corresponding service/layer/driver files.

In the table, **P** means unchanged synchronous values and structural types. **L** means the old callable or Promise API. Native service exports are additional explicit entries; they do not silently change a pure helper’s signature.

Counts identify external source/test files whose imports change at that entry. Rows overlap.

| Existing entry | Strict package | Compatibility package | Files changing imports |
| --- | --- | --- | ---: |
| `.` | P re-exports, models and native services/layers | `SubscriptionsApi`, `RssParserFeedFetcher`, `LeaderElection`, `FeedCheckScheduler`, store factories and memory-store facade; legacy policy wrappers | 2 |
| `./types` | Domain aliases, constants, catalog, `isProfilePlatform`, `profileItemId`, `profileItemCategory`; stored and interpreted models | Promise-based `ProfileSourceFetcher` and legacy host-option types; re-export domain types | 1 |
| `./schemas` | Effect schemas | Live `SubscriptionUpdateInputSchema` and its unchanged dependency closure | 1 |
| `./form` | All three helpers | No wrapper needed | 0 |
| `./download-options` | `buildSubscriptionDownloadOptions` and its types | No wrapper needed | 0 |
| `./status` | All helpers, metadata values and types, retaining the supplied `ReadonlyMap` argument | No wrapper needed | 0 |
| `./feed-resolver` | All four functions | Re-exports where needed | 0 |
| `./feed-parser` | `discoverFeedUrls`; feed-fetching service/layer and permissive feed models | `FeedFetcher`, `RssParserFeedFetcher`, old narrow result declarations | 0 |
| `./feed-items` | Timeline, dedupe, thumbnail and cover helpers; generic types; normalization with explicit capabilities and permissive interpretation | Old `normalizeFeedItems(items, options?)` and `NormalizeOptions` | 0 |
| `./auto-download` | Calculation with explicit capabilities; native policy operation using stored rules and interpreted feed values | Old `decideAutoDownloads` and input/result declarations | 0 |
| `./profile-policy` | `resolveCheckIntervalMs`, `isSubscriptionDue`, `summarizeProfileStatus`; explicit-input calculations accepting stored rules | Old `decideProfileDownloads`, `nextProfileCheckAt` and their default-bearing input forms | 0 |
| `./scheduler` | Scheduler service/layer | `FeedCheckScheduler`, original options | 1 |
| `./leader` | Leader service/layer and models | `LeaderElection`, `MetaStore`, original options | 0 |
| `./store` | Store and metadata services, native SQL/memory layers, row interpretation, `QueueLinkSelector`, `LIST_PROFILE_ITEM_LIMIT` | `SubscriptionsStore`, `CreateSqliteStoresOptions`, both factories, supplied-Drizzle bridge, `InMemoryMetaStore` | 0 |
| `./api` | Subscriptions service/layer; `StoredEnqueueItemContext`; both error-string constants | `SubscriptionsApi`, `EnqueueItem`, `EnqueueItemContext`, options and legacy listener declarations | 1 |

**Five distinct external files change imports:**

| File | Change |
| --- | --- |
| `M/subscriptions-host.ts:25–31` | Classes/factories move to the legacy root; `SubscriptionWithItems` stays strict |
| `M/agent-management-host.ts:4–8` | Fetcher and default-bearing normalization move to legacy; `SubscriptionUpdateInput` stays strict |
| `M/profile-subscriptions.ts:22–30` | `ProfileSourceFetcher` and the old `EnqueueItemContext` move to legacy; domain types and category helper stay strict |
| `apps/desktop/src/main/mcp/subscription-tools.ts:1` | Retained zod schema moves to legacy |
| `packages/task-queue-legacy/test/feed-timer.test.ts:3` | Relative scheduler-source import becomes the legacy package entry |

Package-local test relocation is additional and excluded from that count. Mixed imports split. Manifest and bundler changes are not consumer-file counts.

The renderer, shared desktop types and `packages/ui` retain their current pure/type imports. No direct subscriptions-core import exists in `apps/cli` or `apps/extension`; their public transport behavior remains part of the packaged gate.

The root barrel keeps its current pure re-export surface. Subpath-only exports remain subpath-only: `buildSubscriptionDownloadOptions`, `discoverFeedUrls`, `getSubscriptionFeedEntries`, `SubscriptionFeedEntry` and `LIST_PROFILE_ITEM_LIMIT` are not accidentally added to the root.

The compatibility package retains the supplied Drizzle object for execution, not just its `$client`. Its statement preparation, logger, error wrapping and transaction-control behavior are observable. Section 8 defines that bridge. Native persistence still requires contextual `SqlClient`; the generic db adapter and `rethrowDriverError` keep their settled contracts.

### Host capabilities hidden in nominally pure exports

| Symbol | Existing capability | Disposition |
| --- | --- | --- |
| `normalizeFeedItems`, `C/feed-items.ts:211–230` | Default wall clock, sampled separately for each undated usable item; `Date.parse` for supplied dates | Strict calculation receives date parsing and fallback-time capabilities; native operation obtains services; legacy retains the old optional `now` and synchronous result |
| `decideAutoDownloads`, `C/auto-download.ts:74–113` | Default clock through normalization; supplied history callback | Explicit capabilities in strict calculation; old synchronous wrapper in legacy |
| `decideProfileDownloads`, `C/profile-policy.ts:121–191` | Default wall clock; supplied history callback; one discovery-time sample per invocation | Same split; preserve clock-call count and callback position |
| `nextProfileCheckAt`, `C/profile-policy.ts:54–65` | Default `Math.random`, sampled only when no future retry hint wins | Strict calculation receives the random sample/provider; native service uses Random; old synchronous wrapper stays legacy |
| `buildDefaultSubscriptionDirectory`, `C/form.ts:30–38` | None: concatenates the supplied string using `/` | Keep unchanged; do not substitute home discovery or host `Path` |
| `buildSubscriptionDownloadOptions`, `C/download-options.ts:16–37` | None after phase-5 pure format helpers are ported | Keep unchanged |
| Resolver/key helpers, `C/feed-resolver.ts:54–156` | Supplied strings and URL operations only | Keep unchanged; no network, platform or home capability |
| Thumbnail, cover, timeline, status and catalog helpers | Supplied values only | Keep unchanged; malformed typed arguments retain existing traversal behavior |

There are no hidden file probes, environment reads, platform defaults or home-directory reads elsewhere in these pure exports.

## 3. Schemas

Models precede services. `types.ts` re-exports schema-derived aliases; `schemas.ts` exports the Effect models.

### Domain models

Use structs, not classes, for the public data. Hosts construct object literals, mutate them and pass them through spreads.

| Model group | Shapes |
| --- | --- |
| Literal kits | `FeedPlatform`, `ProfilePlatform`, `SubscriptionPlatform`, `SubscriptionSourceKind`, `SubscriptionStatus`, `ProfileCategoryError`, `LeaderKind`, enqueue trigger and changed-event kind |
| Subscription | `SubscriptionDownloadPreferences`, `ResolvedFeed`, `SubscriptionRule`, `SubscriptionFeedItem`, `SubscriptionWithItems`, create/update inputs, queue-link selectors |
| Feed | `ParsedFeedItem`, `ParsedFeed`, `NormalizedFeedItem`, `ProfileFeedItem`, `ProfileCheckResult`; raw parser and interpreted feed models; feed probe result |
| Decisions | Stored-rule auto-download inputs/decision, profile-download inputs/decision, `StoredEnqueueItemContext`, queue result, list/items-list results |
| Leadership | `LeaderState`, acquisition result, CAS request |
| Presentation | `SubscriptionStatusMeta`, queue-status literals; generic timeline declarations stay generic |

Fields follow `C/types.ts:53–291` exactly for the old domain declarations. In particular:

- Public fields are mutable with `S.mutableKey`; public mutable arrays use `S.mutable(S.Array(...))`, recursively.
- Optional fields accept explicit `undefined`. Update `checkIntervalMs` also accepts `null`.
- `QueueLinkSelector` has readonly arrays with **mutable element fields** (`C/store.ts:246–249`).
- `ProfileCheckResult.categoryErrors` retains optional record values.
- `ParsedFeedItem` retains its string index signature.
- Enqueue creation metadata reuses strict task-queue `TaskCreationMetadata`; batch remains `{ id, title }`.
- Numeric model fields are `S.Finite`, without integer, positivity, interval-range or timestamp refinements.

The selector declaration remains:

```ts
interface QueueLinkSelector {
  taskIds?: readonly string[] | undefined
  items?: readonly {
    subscriptionId: string
    itemId: string
  }[] | undefined
}
```

Its schema uses an ordinary readonly `S.Array` around a struct whose two fields use `S.mutableKey`. The selector’s optional properties themselves remain mutable.

The unused zod restrictions are not new runtime checks. Core does not currently enforce the advertised 30-minute–7-day interval range or list limit 500 on typed calls.

Compile-only fixtures preserve today’s declarations under `exactOptionalPropertyTypes: false` and check mutual assignability with compatibility declarations, including nested mutation and explicit `undefined`. A separate positive fixture assigns `selector.items[0].itemId` after checking the element exists; mutual assignability alone does not prove that property’s mutability. Negative fixtures reject array mutation without suppression comments.

### Stored views are wider than declared enums

`C/store.ts:72–132` casts platform, status and download preferences without checking their values. Rejecting unknown text would violate A2.

Define schema-backed `StoredSubscriptionRule` and `StoredSubscriptionWithItems`. They have the mapped domain shape, but persisted `platform`, `status`, `downloadType`, `downloadQuality` and `downloadContainer` remain strings, with the same optionality as their mapped fields. `sourceKind` retains today’s mapping: exactly `"profile"` becomes profile; every other stored string becomes feed (`C/store.ts:88`).

```ts
interface StoredSubscriptionRule
  extends Omit<
    SubscriptionRule,
    | "platform"
    | "status"
    | "downloadType"
    | "downloadQuality"
    | "downloadContainer"
  > {
  platform: string
  status: string
  downloadType?: string | undefined
  downloadQuality?: string | undefined
  downloadContainer?: string | undefined
}

interface StoredSubscriptionWithItems extends StoredSubscriptionRule {
  items: SubscriptionFeedItem[]
}

type StoredSubscriptionPatch =
  Omit<
    SubscriptionUpdateInput,
    | "platform"
    | "downloadType"
    | "downloadQuality"
    | "downloadContainer"
  > &
  Partial<StoredSubscriptionRule>
```

Core operations consuming stored rules accept these wider views and perform only today’s checks. Do not intersect the widened preference fields with their narrow input counterparts: that would narrow them again.

The wider type reaches every stored-rule consumer:

| Consumer | Strict contract |
| --- | --- |
| Store list/get/add/update and API list/get/add/update/refresh | `StoredSubscriptionWithItems` |
| Store update and API-generated patches | `StoredSubscriptionPatch`, with the interpreted RSS patch form below |
| RSS policy input, cutoff/recent calculations and decision’s `subscription` | `StoredSubscriptionRule` |
| Profile policy input, default-title calculation, interval/due/next-check/status helpers | `StoredSubscriptionRule`, or a field projection from it |
| Profile fetch capability | `StoredSubscriptionRule` |
| Feed/profile routing and category validation | Stored strings, narrowed only by today’s explicit checks |
| Automatic and manual enqueue context | `StoredEnqueueItemContext.subscription: StoredSubscriptionRule` |
| Profile category lookup inside policy | Accepts the stored platform string and applies the existing `isProfilePlatform` guard |

The unchanged narrow domain types remain useful for typed construction and pure public helpers. They are not assertions about persisted values. Only compatibility projects stored values into the old narrow return and callback declarations, without validation or coercion.

Do not cast undecoded SQL rows. Decode them first with the db models or the safe-integer companions below. Compatibility declaration projection is separate from database decoding.

### Parser values stay wide through interpretation

`toParsedFeed` selectively copies outer title/link/image fields but retains the item array and its objects (`C/feed-parser.ts:52–70`). Installed `rss-parser/lib/utils.js:34–56` copies custom-field objects. An item’s `youtubeId` can therefore be `{ nested: ["abc"] }`; `C/feed-items.ts:31–37` selects it and calls `.trim()`, producing `TypeError: candidate.trim is not a function`.

`ParsedFeed` cannot represent that intermediate value honestly. Define these distinct contracts:

```ts
type RawParsedFeed = unknown
type RawFeedItem = unknown

interface InterpretableFeed {
  title?: string | undefined
  link?: string | undefined
  image?: { url?: string | undefined } | undefined
  itunes?: { image?: string | undefined } | undefined
  items: RawFeedItem[]
}

interface FeedProbe {
  feed: InterpretableFeed
  feedUrl: string
  discovered: boolean
}

interface InterpretedFeedItem {
  id: unknown
  url: unknown
  title: unknown
  publishedAt: number
  thumbnail?: unknown
}

interface StoredAutoDownloadInputs {
  subscription: StoredSubscriptionRule
  knownItems: SubscriptionFeedItem[]
  feed: InterpretableFeed
}

interface StoredAutoDownloadDecision {
  subscription: StoredSubscriptionRule
  items: InterpretedFeedItem[]
  feedItemsToPersist: InterpretedFeedItem[]
  latestPublishedAt: number | null
  latestVideoTitle?: unknown
  coverUrl?: unknown
}

interface StoredEnqueueItemContext {
  creation?: TaskCreationMetadata | undefined
  subscription: StoredSubscriptionRule
  item: InterpretedFeedItem
  trigger: "auto" | "manual"
  batch?: { id: string; title: string } | undefined
}

type InterpretedFeedPatch =
  Omit<StoredSubscriptionPatch, "latestVideoTitle" | "coverUrl"> & {
    latestVideoTitle?: unknown
    coverUrl?: unknown
  }
```

These declarations describe the values the current branches can carry, not new validation. `InterpretedFeedItem` is wider than `NormalizedFeedItem` because normalization tests truthiness, then copies link/title and artwork values without checking that they are strings (`C/feed-items.ts:108–168,211–230`). The normalizer’s declared string fields are another existing unsound promise.

Use `S.Unknown` for raw parser output and raw item entries. Where object fields are modeled alongside retained unknown keys, use `S.StructWithRest`. Do not require every item to be an object before the old traversal reaches it. The outer projection retains its existing branch behavior for missing/nonarray `items` and wrong-shaped outer fields.

The permissive path is:

```text
RssParser.parse: RawParsedFeed
  → existing outer projection: InterpretableFeed
  → SubscriptionFeed.fetch/probe: InterpretableFeed / FeedProbe
  → normalization and artwork interpretation: InterpretedFeedItem[]
  → RSS policy: StoredAutoDownloadDecision
  → persistence writes and admission: interpreted values
```

History lookup accepts an interpreted URL value internally. The legacy bridge passes it unchanged to the old typed callback. Persistence writes do not decode interpreted items into `NormalizedFeedItem` first; driver binding or later traversal fails where it does today. Manual queueing and valid profile results fit the wider item contract without projection.

Keep the old typed thumbnail/cover helpers and generic declarations for their existing callers. Their internal permissive interpretation path must not introduce an early rejection or silently discard a value. Preserve property access, truthiness, method-call order, date coercion and the error position. Where explicit dispatch is needed to reproduce a malformed method-call failure, the compatibility error retains the Node class/message and the same synchronous or rejected mode.

For the nested `youtubeId` fixture, the required complete sequence is fetch/body success → XML parse success → checking-state policy interpretation → preferred-identity TypeError → feed-check warning → failed-state write → fulfilled `refreshOne`, with no replacement or admission. The stored `lastError` is the TypeError’s message (`C/api.ts:483–553`).

### Boundary codecs and recovery

| Boundary | Today | Port policy |
| --- | --- | --- |
| Full subscription/item/meta rows | Drizzle types and casts; no validation | Decode with `SubscriptionRow`, `SubscriptionItemRow`, `SubscriptionsMetaRow`, or their raw-SQL variants from `@vidbee/db/subscriptions`; failures are `DbRowDecodeError` |
| Duplicate-feed projection | Selects only `id, feedUrl` | Query-shaped schema from those row fields; no extra columns |
| Merge existence projection | Selects only `itemId` | Query-shaped schema from the item row |
| Orphan-link projection | Selects `subscriptionId,itemId,taskId,added` | Query-shaped schema with the same nullability; safe-integer conversion for its numeric field |
| Safe-integer integer columns | Driver can return bigint; timestamps pass through and `1n === 1` is false | Local row codecs convert bigint to number before normal row decoding and boolean mapping; declared change in section 9 |
| `keywords`, `tags`, `categories` JSON | Missing/empty, syntax failure, nonarray or sanitization failure returns `[]`; trim/dedupe strings | Schema JSON decode, then array-of-strings decode and the same sanitization; any failure returns `[]`, including mixed arrays |
| Persisted enum text | Unknown strings pass through | Stored-view schemas retain strings; no new enum rejection |
| Numeric metadata text | `Number(raw)`; nonfinite becomes null; missing becomes null | Preserve conversion exactly, including empty/whitespace strings becoming zero |
| Leader kind text | Only `desktop`/`api` survive | Same null fallback |
| RSS XML | Parser rejection propagates; outer fields selectively copied; nonarray `items` becomes `[]` | Same parser and outer projection; raw output stays permissive through interpretation |
| RSS items and nested media values | Missing identity/link/title drops an item; some wrong types pass through and others throw during traversal | Unknown-valued raw schemas; existing branches determine omission, success or traversal failure |
| Profile-fetcher result | Typed in-process callback; core does not validate | Typed service boundary; host mapper owns decoding its files/process/network data; no whole-result semantic validation in the legacy bridge |
| Host API arguments and enqueue context | Typed calls, no core schema parse | No semantic entry validation added; IPC/HTTP/MCP validation remains at those owners |
| Database writes | Sanitized lists, boolean conversion, conditional optional columns | Preserve serialization and column omission; no whole-input semantic decode before writing |

Safe-integer conversion follows task-queue design section 9 item 4 and `packages/task-queue/src/persist/Rows.model.ts:35–41`: a local `S.Union([S.Finite, S.BigInt])` decodes to `S.Finite` through `SchemaGetter.transform(value => Number(value))`. Apply it to every integer field in full rows and projections, preserving nullability, then decode the normal db shape. This includes boolean columns, item timestamps, subscription timestamps/intervals and metadata `updatedAt`. Driver change counts used by the bridge are normalized to numbers as well. No shared handle configuration changes.

There is no rewritten JSON object document in subscriptions persistence. Unknown object keys in malformed list JSON do not need open persisted codecs: today those values become `[]`. This differs deliberately from task-queue’s open saved-task codecs.

Date parsing is a host-semantic boundary. `DateTime.make` is unsuitable: installed `effect/src/internal/dateTime.ts:247–278` appends `Z` to zone-less date-times. For string inputs, native parsing uses `S.DateFromString` and the decoded Date’s epoch value; `effect/src/SchemaGetter.ts:1223–1224` delegates to JavaScript Date construction. Legacy uses the existing `Date.parse`.

The raw interpretation capability accepts unknown date values so malformed parser output is not rejected by a string schema first. It preserves JavaScript `Date.parse` coercion and any coercion exception. Characterize nonstring values separately from the valid-string date oracle. A raw numeric date must not be changed into the different semantics of `new Date(number)`.

### Zod liveness

Only `SubscriptionUpdateInputSchema` has an external live consumer, which calls `.pick` for download preferences (`apps/desktop/src/main/mcp/subscription-tools.ts:11–26`).

Move that schema unchanged to legacy, together with:

- `SubscriptionPlatformSchema`, which it references;
- private category and interval schemas;
- download preference schemas from downloader-core-legacy.

Retain the full update schema, not a replacement containing only the current three picked fields. Preserve its zod behavior and schema identity within the module.

Delete the unused zod schemas: source-kind/status/leader-kind, resolved feed, rule/item/with-items, create input, ID/resolve/refresh/items inputs, list/items/queue/void outputs and leader state. Effect models replace their modeling role without inheriting unused refinements.

## 4. Errors

There are no package-defined Error subclasses today. Public failures are ordinary Errors, native/parser errors and arbitrary injected values.

Strict errors live in `Subscriptions.errors.ts`: `SubscriptionNotFound`, `DuplicateFeed`, `ProfileHostRequired`, `InvalidCategories`, `FeedHttpStatus`, `FeedRequestTimeout`, `FeedParseFailure`, `FeedTraversalFailure`, `FeedCancelled` and `HostFailure`. Use schema-backed tagged errors with deterministic keys, `legacyMessage` where applicable and `S.Defect()` for retained original values.

Native `SqlError` and `DbRowDecodeError` remain db errors. Do not wrap them in a generic subscription error.

| Observable origin | Existing shape | Compatibility reproduction |
| --- | --- | --- |
| `C/api.ts:220,257,274,291,303,324` | `Error("Subscription not found: " + id)` | Same class and exact message; Promise rejection |
| `C/api.ts:236–238,250–252` | `Error("SUBSCRIPTION_DUPLICATE_FEED_URL")` with own mutable `duplicateOf` property | Reconstruct ordinary Error and attach the matched ID at the same point |
| `C/api.ts:231–232` | `Error("SUBSCRIPTION_PROFILE_DESKTOP_ONLY")` | Same rejection; profile-input normalization still precedes this guard |
| `C/api.ts:663–671` | `Error("Choose at least one category to follow.")` | Same rejection from add/update |
| `C/feed-parser.ts:103–104` | `Error("Status code " + status)` | Same Error; do not expose Effect HTTP’s status-error message |
| `C/feed-parser.ts:108–112` | Caller abort reason by identity; otherwise an Error named `AbortError` becomes `Error("Request timed out after 180000ms")` | Preserve exact precedence and the `instanceof Error`/name check |
| Fetch or `Response.text()` failure | Original thrown/rejected value | Retain and rethrow by identity after existing abort checks and retry policy |
| `rss-parser.parseString` | Original parser rejection | Retain by identity; probe ultimately returns the initial parse error after unsuccessful candidates |
| Drizzle statement preparation or execution | `DrizzleQueryError`, including query-dependent message, `query`, optional `params`, and original `.cause` | Execute through the supplied Drizzle object and retain the resulting error by identity |
| Supplied Drizzle logger | Original thrown value, outside Drizzle’s execution-error catch | Retain by identity; no `DrizzleQueryError` wrapping |
| Native transaction control underlying the current Drizzle transaction | Raw driver failure where the driver exposes one | Preserve the raw error; no blanket statement-error wrapping |
| Native strict SQL execution | `SqlError` | Generic db `rethrowDriverError` applies only when reproducing the raw-driver contract |
| Injected store, task lookup, enqueue, history, timer, clock, ID, logger or state callback | Any thrown/rejected value, including non-Error | `HostFailure` retains the original; unwrap at the existing propagation point |
| Caller cancellation | Original signal reason, including non-Error values | `FeedCancelled` retains the original reason; compatibility rejects with that exact value |
| Malformed typed arguments or parser values | Native TypeError/URIError or other traversal failure | Preserve failure position and synchronous/rejected mode; retain original failure where available, otherwise reproduce its Node class/message |
| Schema-rejected physical row | No previous uniform error | Declared change in section 9 |

Installed Drizzle wraps preparation failures in `drizzle-orm/better-sqlite3/session.js:20–24` and execution failures in `drizzle-orm/sqlite-core/async/session.js:80–133`. Its logger invocation precedes the execution catch. `drizzle-orm/errors.js:14–32` constructs the query/parameter-dependent message. Compatibility does not substitute the underlying SQLite error for that wrapper.

Existing catch boundaries remain:

- Manual enqueue/task-existence failures reject `itemsQueue`.
- Automatic enqueue and mark failures are caught per item, logged, and the check continues.
- Feed/profile failures usually become persisted status/error text and a fulfilled refresh.
- Initial checking writes are outside those catches; failure-state writes can themselves reject.
- Changed-listener exceptions are logged and delivery continues. A logger exception can escape.
- Startup reconciliation failure is caught; lease acquisition failure is not.
- Scheduler catches `runAll`; its logging and rearm can still fail.
- Heartbeat interval callbacks do not attach a rejection handler.

When persisting an error message, use the **legacy observable error**, not a tagged wrapper’s generated message: `error instanceof Error ? error.message : String(error)` remains the rule. This includes Drizzle query errors, logger exceptions and malformed-feed TypeErrors.

### Fallible logging

Injected logging is a recoverable capability at the original call sites. A plain Effect Logger adapter is insufficient: installed `effect/src/internal/effect.ts:6745–6753` invokes `logger.log` directly, so a thrown exception becomes a defect.

`SubscriptionLog.write` has `HostFailure` in its error channel. In compatibility it invokes the supplied callback inside `Effect.try`, once, synchronously, with the original level/message/metadata. It performs no Promise adoption. Invocation is independent of Effect’s minimum log level.

Native logging uses `Effect.logInfo`, `Effect.logWarning` and `Effect.logError`, including the full Cause. Any conversion of a Logger exception is confined to that logging invocation; it does not convert unrelated defects into recoverable failures. Compatibility’s injected callback is not also installed as an Effect Logger, which would duplicate or filter its invocation. The compatibility capability forwards the structured observation through Effect logging after the callback succeeds.

The recovery sequence at `C/api.ts:503–553` remains:

```text
update:checking
log:subscriptions: enqueueItem failed
log:subscriptions: feed-check failed
update:failed
refreshOne: fulfilled
lastError: log-sentinel
```

This is the case where enqueue rejects and the logger throws `Error("log-sentinel")` only on the inner enqueue warning. If the outer feed-check logger also throws, the failed-state write is not reached and refresh rejects. Listener logging and leadership logging keep their own existing escape points.

Synchronous facades use the shared failure-unwrapping synchronous runner. Promise facades map failures in the shared exit observer. Original subscription/host failures are unwrapped before any generic db cause traversal; a retained `DrizzleQueryError` must not be reduced to `.cause`. No `FiberFailure` leaks to an old caller.

## 5. Services

All services are `Context.Service` classes with deterministic package/file/service keys. Implementations live in layers; third-party Promise adapters live in drivers.

In this section:

```ts
type E<A> = Effect.Effect<
  A,
  SubscriptionsError | SqlError.SqlError | DbRowDecodeError
>
```

Each operation narrows this union where failures are impossible. Injected synchronous capabilities that can throw include `HostFailure`; writing `Effect<number>` for an injected clock would falsely promise that it cannot fail.

| Service | Contract with Effect signatures | Native layer | Compatibility provision |
| --- | --- | --- | --- |
| `SubscriptionStore` | Eleven operations; declaration below | SQL layer requiring contextual `SqlClient` | Supplied store bridge, or retained supplied-Drizzle driver on the shared handle runtime |
| `SubscriptionMeta` | `readLeader: E<LeaderState>`; `casLeader(request): E<boolean>`; `readPreferred: E<LeaderKind \| null>`; `writePreferred(kind): E<void>` | SQL layer; memory layer | Original `MetaStore` bridge or Drizzle/memory facade |
| `SubscriptionFeed` | `fetch(url, cancellation?): E<InterpretableFeed>`; `probe(url, cancellation?): E<FeedProbe>` | Existing orchestration over `FeedHttp`, `RssParser` and cancellation | Old fetcher class or injected `FeedFetcher`; old narrow declarations projected only here |
| `FeedHttp` | `open(url, cancellation): E<FeedResponse>`; response carries final URL, status and `text: E<string>` | `effect/http/HttpClient` with `FetchHttpClient.layer` and explicit redirect/tracing policy | Original global fetch/options and `Response.text`, in separate bridge calls |
| `RssParser` | `parse(xml): Effect.Effect<RawParsedFeed, FeedParseFailure>` | One lazy parser per fetcher owner in `RssParser.driver.ts` | Same parser driver and lifetime |
| `ProfileFeed` | `fetch(subscription: StoredSubscriptionRule, token: CheckToken): E<ProfileCheckResult>` | Host-provided Effect mapper capability | Original optional `ProfileSourceFetcher`, supplied its owned AbortSignal |
| `SubscriptionQueue` | Declaration below | Host-provided Effect capabilities | Original callbacks; history remains synchronous; absent task lookup remains distinguishable |
| `SubscriptionTimers` | Declaration below | Clock, scoped fibers, fixed-cadence dispatch | Original timeout/interval functions and injected seams; referenced handles |
| `SubscriptionEntropy` | `subscriptionId: E<string>`; `leaseId: E<string>`; `next: E<number>` | SecureRandom UUIDv4 and ULID; Random | `generateId` or `randomUUID`; original `ulid()`; `Math.random` |
| `SubscriptionDates` | `parse(value: unknown): E<number \| null>` | String decoding with `DateFromString`; raw-value coercion driver preserving `Date.parse` semantics | Original `Date.parse`, NaN becomes null |
| `FeedCancellation` | Borrowing and owned cancellation declarations below | Owned state and reason-preserving notification | Borrowed external signal or owned controller; bridge owns subscriptions and cleanup |
| `CheckCancellation` | `make: E<CheckToken>` | Owned profile-check state and notification | Owned AbortController; bridge exposes its signal |
| `SubscriptionEvents` | `emit(event): E<void>`; `subscribe(sink): E<Unsubscribe>` | Ordered live registry | Direct synchronous callback bridge and original identity |
| `SubscriptionLog` | `write(level, message, metadata?, cause?): Effect.Effect<void, HostFailure>` | Fallible logging capability over `Effect.log*` | Direct `Effect.try` callback invocation, independent of log filtering |
| `SubscriptionLeader` | `isLeader: Effect.Effect<boolean>`; `tryAcquire: E<AcquireResult>`; `heartbeat: E<boolean>`; `release: E<void>`; `observe: E<LeaderState>` | Existing election state machine | Old class/options over one warmed owner runtime |
| `SubscriptionScheduler` | `start(delay?): E<void>`; `stop: E<void>`; `triggerNow(id?): E<void>` | Existing scheduler state machine | Synchronous start/stop and Promise trigger |
| `Subscriptions` | Declaration below | Existing orchestration | Old `SubscriptionsApi` over one warmed owner runtime |
| `LegacyTiming` | `turn(point): Effect.Effect<void>` | Existing task-queue no-op layer | Existing one-microtask layer |

`SubscriptionTimers` is package-owned because the scheduler needs rearmed one-shots while leadership needs fixed-cadence interval dispatch that may overlap. Replacing both with “sleep after completion” changes behavior.

Installed APIs confirmed for this design include `Context.Service`, `Layer`, `Clock.currentTimeMillis`, `Random.next`, `SecureRandom.SecureRandom`, `uuidV4()`, `ulid`, `layerWebCrypto`, `Effect.try`, `Effect.callback`, `Effect.forkIn` with `startImmediately`, `Scheduler.PreventSchedulerYield`, `ManagedRuntime`, Schema mutable keys/arrays, JSON and result/effect decoders, `SchemaGetter.transform`, `SqlClient.reserve` and `SqlClient.BeginTransaction`.

Secure randomness imports from `effect/crypto/SecureRandom`. HTTP imports are `effect/http/HttpClient`, `HttpClientRequest`, `HttpClientResponse`, `FetchHttpClient`. `HttpClient` exposes `execute/get`; responses expose final `url` and effectful `text`. There is no `NodeHttpClient.ts` in the installed platform-node-shared tree.

### Store, queue and API contracts

Types below are supplied by section 3’s models.

```ts
interface SubscriptionStoreContract {
  readonly list: E<StoredSubscriptionWithItems[]>
  readonly get: (id: string) => E<StoredSubscriptionWithItems | null>
  readonly findDuplicateFeed: (
    feedUrl: string,
    ignoreId?: string
  ) => E<string | null>
  readonly add: (
    input: SubscriptionCreateInput
  ) => E<StoredSubscriptionWithItems>
  readonly update: (
    id: string,
    patch: StoredSubscriptionPatch | InterpretedFeedPatch
  ) => E<StoredSubscriptionWithItems | null>
  readonly remove: (id: string) => E<boolean>
  readonly replaceItems: (
    subscriptionId: string,
    items: InterpretedFeedItem[]
  ) => E<void>
  readonly mergeItems: (
    subscriptionId: string,
    items: NormalizedFeedItem[]
  ) => E<void>
  readonly markItemQueued: (
    subscriptionId: string,
    itemId: string,
    taskId: string | null
  ) => E<void>
  readonly clearQueueLinks: (selector: QueueLinkSelector) => E<number>
  readonly clearOrphanedQueueLinks: (
    isLive: (taskId: string) => E<boolean>
  ) => E<number>
}

interface SubscriptionQueueContract {
  readonly enqueue: (
    context: StoredEnqueueItemContext
  ) => E<string | null>
  readonly historyContains: (url: unknown) => E<boolean>
  readonly taskLookupAvailable: boolean
  readonly taskExists: (id: string) => E<boolean>
}

interface SubscriptionsContract {
  readonly start: E<void>
  readonly stop: E<void>
  readonly isLeader: Effect.Effect<boolean>
  readonly observeLeader: E<LeaderState>
  readonly resolve: (input: { rawUrl: string }) => E<ResolvedFeed>
  readonly list: E<{ items: StoredSubscriptionWithItems[]; total: number }>
  readonly get: (input: { id: string }) => E<StoredSubscriptionWithItems>
  readonly add: (
    input: SubscriptionCreateInput
  ) => E<StoredSubscriptionWithItems>
  readonly update: (
    input: { id: string } & SubscriptionUpdateInput
  ) => E<StoredSubscriptionWithItems>
  readonly remove: (input: { id: string }) => E<Record<string, never>>
  readonly refresh: (input: { id: string }) => E<StoredSubscriptionWithItems>
  readonly itemsList: (
    input: { subscriptionId: string; limit?: number; offset?: number }
  ) => E<{ items: SubscriptionFeedItem[]; total: number }>
  readonly itemsQueue: (
    input: { subscriptionId: string; itemId: string },
    creation?: TaskCreationMetadata
  ) => E<{ queued: boolean; taskId: string | null }>
  readonly releaseRemovedTasks: (taskIds: readonly string[]) => E<number>
  readonly reconcileOrphanedTasks: E<number>
  readonly refreshAll: (options?: { force?: boolean }) => E<void>
  readonly refreshOne: (subscriptionId: string) => E<void>
  readonly noteTaskRemoved: (taskId: string) => E<void>
  readonly on: (sink: SubscriptionChangedSink) => E<Unsubscribe>
}
```

The store’s interpreted write contracts do not weaken row reads. A malformed feed value may reach driver binding exactly as today; a successfully read SQL row still passes the physical row decoder.

### Commands, sinks, timers and re-entry

```ts
type TimerCancel = Effect.Effect<void, HostFailure>
type Unsubscribe = Effect.Effect<boolean>

interface SubscriptionChangedSink {
  readonly emit: (
    event: { readonly kind: "changed" }
  ) => Effect.Effect<void, HostFailure>
}

interface LeaderStateSink {
  readonly emit: (
    state: LeaderState,
    isLeader: boolean
  ) => Effect.Effect<void, HostFailure>
}

interface ScheduledCommand {
  readonly run: E<void>
}

interface SubscriptionTimersContract {
  readonly now: Effect.Effect<number, HostFailure>
  readonly after: (
    ms: number,
    command: ScheduledCommand
  ) => Effect.Effect<TimerCancel, HostFailure>
  readonly every: (
    ms: number,
    command: ScheduledCommand
  ) => Effect.Effect<TimerCancel, HostFailure>
}
```

These are command-and-sink protocols, not mailboxes:

- A legacy changed callback is invoked synchronously before `emit` returns. Returned Promises are ignored.
- Listener identity, insertion order, deduplication, live additions/removals and stale unsubscribe closures follow `C/api.ts:165–178`.
- Event unsubscription returns the actual deletion boolean. `on` retains its declared `() => void` compatibility signature, while its returned function evaluates `runLegacySync(unsubscribe)` and returns that boolean at runtime.
- Registering one callback twice creates one membership. The first unsubscribe returns `true`; repeated unsubscribe and the duplicate registration’s unsubscribe then return `false`. An old closure deletes a later re-registration of the same callback, as the current Set does.
- Use an ordered registry with removal/tombstone handling and pruning. HashSet iteration must not replace Set order; callback equality remains identity-based.
- State-change callbacks retain their placement after local state/timer changes and logging (`C/leader.ts:149–168,194–217,243–251`).
- Timer callbacks synchronously enter the owner’s runtime. Work starts immediately at the old callback position, continuing in the owner scope when it suspends.
- Task-queue’s removal callback synchronously enters `noteTaskRemoved`. It records the trimmed ID before returning, then schedules the existing single microtask batch.
- Enqueue and other host calls start their synchronous prefix before the bridge returns.
- Background continuations use `Effect.forkIn(..., ownerScope, { startImmediately: true })` where the old code starts them immediately. A delayed batch retains its deliberate initial microtask.
- Stop is an operation, not scope disposal. Owner runtimes and continuation scopes outlive stop/restart and remain available to in-flight work.

### Feed cancellation and profile-check cancellation

Network cancellation and profile removal are separate protocols.

```ts
interface CancellationSnapshot {
  readonly aborted: boolean
  readonly reason: unknown
}

interface AbortNoticeSink {
  readonly emit: (reason: unknown) => Effect.Effect<void, HostFailure>
}

interface FeedCancellationToken {
  readonly snapshot: Effect.Effect<CancellationSnapshot, HostFailure>
  readonly check: Effect.Effect<void, FeedCancelled | HostFailure>
  readonly subscribe: (
    sink: AbortNoticeSink
  ) => Effect.Effect<Unsubscribe, HostFailure>
}

interface OwnedFeedCancellation {
  readonly token: FeedCancellationToken
  readonly abort: (reason: unknown) => Effect.Effect<void, HostFailure>
  readonly dispose: Effect.Effect<void, HostFailure>
}

interface CheckToken {
  readonly cancellation: FeedCancellationToken
  readonly aborted: Effect.Effect<boolean, HostFailure>
  readonly cancel: Effect.Effect<void, HostFailure>
}
```

`check` succeeds when not aborted and otherwise fails with `FeedCancelled` retaining the exact original reason. Aborted state is separate from reason; a falsy reason is not “not aborted.” Notification records the first abort, invokes registered sinks synchronously in order, and supports cleanup. Borrowing an already-aborted external signal exposes its state immediately.

The network bridge borrows a caller signal. It never aborts that controller. Each request attempt owns a timeout controller, timer and combined signal corresponding to `AbortSignal.any([timeoutSignal, callerSignal])`. Completion removes bridge-owned listeners and clears its timeout; it does not dispose the caller’s signal.

The source’s checks and precedence are fixed:

| Position | Current code | Required behavior |
| --- | --- | --- |
| Before each request attempt | `C/feed-parser.ts:91` | Reject with caller reason before creating the attempt timer or making a request |
| Request/body/status catch | `:108–112` | Check caller first; if aborted, reject with its exact reason, even if another error triggered the catch; otherwise convert only `Error` with `name === "AbortError"` to the timeout message |
| Before HTTPS fallback | `:129` | Caller abort prevents retry |
| After successful direct XML parse | `:188` | Check caller again; transport success does not suppress cancellation |
| Probe after initial parse success or failure | `:201,204` | Caller reason wins before returning or discovering candidates |
| After candidate failure | `:213` | Check caller before the next candidate; preserve the initial parse error if no candidate succeeds and caller remains active |

The timeout encloses request and body reading only; it is cleared before parsing. Expiry does not replace a successful parser result unless the caller signal itself is aborted at the post-parse check. Do not race the entire fetch/parse operation against a generic timeout.

Profile removal owns its controller (`C/api.ts:569–570`) and calls no-argument `abort()` at `:280`. Its `CheckToken.cancel` reproduces that default abort reason. The legacy mapper receives the owned signal. Core retains the post-fetch existence/abort check at `:580–583`; it adds no abort guard to each admission.

### Detached failures

A failed owned fiber does not reproduce an unhandled JavaScript Promise rejection.

Compatibility dispatches each originally discarded asynchronous operation through the shared `runLegacyPromise` exit observer, starts its synchronous prefix immediately and deliberately leaves the resulting Promise without a rejection handler. The timer callback returns `undefined`. The observer unwraps the original failure before rejecting.

Apply this dispatch at the original detach points:

| Source | Detached operation | Failure behavior retained |
| --- | --- | --- |
| `C/leader.ts:265–267` | `heartbeat()` | Unhandled rejection with original metadata-store, clock, timer, logger or state-callback failure |
| `C/scheduler.ts:180–183` | `tick()` | Unhandled rejection if leadership lookup, skip logging, propagated work/logging or final rearm fails |
| `C/scheduler.ts:166–168` | Pending `runIfIdle()` rerun | Detached rejection if its catch logger fails; the caller does not join it |
| `C/api.ts:389–398` | Removal-flush Promise | Existing release failure is caught; a throw from its warning logger rejects the discarded flush Promise |

`runAll` rejection alone remains caught and logged by `runIfIdle`; it becomes a detached rejection only if the subsequent path fails. Tick’s `finally` still attempts rearm, and a rearm failure can replace the earlier failure as in JavaScript.

Native dispatch owns the fiber and reports its full Cause through the owner’s failure observer. The application uses compatibility dispatch in this phase. Native fiber observation is not evidence of Promise-channel parity.

### Promise timing

Reuse `LegacyTiming` and the shared `runLegacyPromise`/`runLegacySync` utility required by the reviewed downloader design. On this source snapshot the settlement implementation is still inline at `packages/task-queue-legacy/src/api/index.ts:166`; the shared runtime entry is an implementation prerequisite, not an existing export.

Every old await becomes exactly one host-bridge suspension or one named timing turn. SQL effects and compatibility Drizzle segments stay synchronous; a turn representing the old store Promise occurs **after** SQL and outside any transaction or reserved connection.

| Path | Required sequence |
| --- | --- |
| Store CRUD | SQL/pure prefix → settled Promise; no added I/O turn |
| Add | Normalize/guard → duplicate lookup prefix → await → add prefix → await → changed → settlement |
| Manual queue | Get → await → optional task lookup/adoption → optional clear → enqueue → optional mark → changed → settlement |
| RSS check | Get → checking write → fetch → decision → replace → sequential enqueue/mark → re-read → final write → changed |
| Profile check | Register controller → checking write → changed → fetch → re-read/abort guard → merge → sequential enqueue/mark → final write → controller cleanup → changed |
| Removal batch | Record IDs synchronously → one microtask → capture/clear IDs and reset flush reference → release → event |
| Start/stop | Preserve acquisition/reconciliation/start order and synchronous scheduler-stop prefix |
| Election/scheduler | Preserve each metadata/callback await, nested async adoption and detached pending rerun |

The implementation report supplies a source-line ledger for all awaits in `api.ts`, `leader.ts`, `scheduler.ts`, `feed-parser.ts` and orphan reconciliation at `store.ts:624`, including `.finally` and returned-Promise adoption in `refreshOne`.

Set `Scheduler.PreventSchedulerYield` in the final compatibility runtime context. Settle Promises from `runFork` exit observers, with error mapping there. Do not add a final `.then`/`.catch`. A residual timing difference is a failed parity check until measured and reviewed; none is accepted here in advance.

## 6. Side-effect surfaces

### Database statements and transactions

Native persistence requires contextual `SqlClient`. It imports neither a driver nor a new connection. Compatibility retains the supplied Drizzle execution path described in section 8, under the same handle runtime’s connection reservation.

| Operation and source | Statements and ordering | Begin mode |
| --- | --- | --- |
| `list`, `store.ts:362–368` | Select subscriptions ordered `updated_at DESC`; select all matching children ordered `published_at DESC`; attach and slice profile items to 300 in memory | No transaction |
| `get`, `:371–376` | Select subscription by ID; if present select its children, full history | No transaction |
| `findDuplicateFeed`, `:379–389` | Select `id,feed_url`; first matching normalized key excluding ignored ID | No transaction |
| `add`, `:392–427` | Sample time/ID, normalize defaults, insert rule; return constructed rule with empty items | No transaction |
| `update`, `:431–463` | Read existing rule; compute next; insert with ID conflict update; read children | No transaction |
| `remove`, `:466–472` | Delete parent; only if changed, delete children | No transaction; preserve non-atomicity |
| `replaceItems`, `:475–507` | Read existing children; delete snapshot; insert every supplied item in order, retaining old queue flag/link/creation time where applicable | Explicit deferred `BEGIN` |
| `mergeItems`, `:510–557` | Empty input returns; otherwise read existing IDs; update known IDs or insert new ones in supplied order | Explicit deferred `BEGIN` |
| `markItemQueued`, `:560–598` | Update link/flag; if no row changed, placeholder insert with composite-key conflict update | No transaction |
| `clearQueueLinks`, `:279–315,601–603` | Empty selectors return zero; update task-ID matches first, then each selected item with existing queue-link guard; sum changes | Explicit deferred `BEGIN` |
| `clearOrphanedQueueLinks`, `:605–638` | Read linked projection; await each unique task lookup in encounter order; then run the same clearing transaction | Read/host calls outside transaction; clearing uses deferred `BEGIN` |
| Metadata read, `:653–659,698–708,753–755` | Select metadata rows; convert the seven known keys | No transaction |
| Metadata CAS, `:711–750` | Read metadata; apply existing expected-ID/expiry test; delete/upsert six lease keys in order; leave preference untouched | Explicit deferred `BEGIN` |
| Preference write, `:683–694,758–759` | Delete or upsert `preferred_leader`, with sampled timestamp | No transaction |
| Memory metadata, `:768–814` | Shallow-copy reads; same CAS and preference behavior | No SQL |

Column names, defaults and nullability come from `packages/db/src/subscriptions.ts` and `Subscriptions.model.ts`. Preserve `onlyDownloadLatest → only_latest`.

Apply the seven db rules, with the subscription-specific compatibility error boundary made explicit:

1. Native persistence takes `SqlClient` from context; compatibility shares `runtimeForHandle`.
2. Transactions and synchronous SQL segments contain no sleep, Promise suspension or yielding host service. Existing synchronous Drizzle logger invocation remains at its statement position.
3. Native transactions provide `SqlClient.BeginTransaction` as `"BEGIN"`. The retained compatibility driver uses Drizzle’s explicit deferred transaction behavior and preserves its raw transaction-control failures.
4. Decode full rows or exact query projections; content-free `DbRowDecodeError`. Safe-integer conversion is local to row/projection codecs.
5. Generic db failures retain `rethrowDriverError`’s raw-driver contract. Subscription compatibility first unwraps its retained Drizzle/host failure, preserving `DrizzleQueryError` and logger identity.
6. No SQL streaming.
7. Run persistence tests against borrowed better-sqlite3 and node clients in separate processes, in addition to the direct Drizzle oracle.

Native host transactions are borrowed through the db adapter’s savepoint behavior. The compatibility driver retains better-sqlite3/Drizzle’s existing nested transaction behavior. Do not add a transaction around refresh, admission, parent deletion or update.

No transaction or connection reservation remains held while fetching, awaiting task lookup, emitting changed callbacks or yielding a timing turn. Orphan reconciliation has separate synchronous read and clear segments.

Preserve conditional update columns: absent `profileOwner`, `checkIntervalMs`, `nextCheckAt` explicitly write NULL; other absent optional properties are omitted from conflict updates (`C/store.ts:152–207`).

### Network requests

Core makes only feed GET requests. Profile mapping and enqueue metadata hydration are injected host capabilities.

| Request | URL and headers | Deadline/retry | Body and validation |
| --- | --- | --- | --- |
| Direct fetch | Supplied feed URL; GET; redirects followed | 180,000 ms per attempt, through body text consumption | `Response.text()`, then `rss-parser.parseString`; no content-type or size check |
| HTTPS retry | Same URL with case-insensitive leading `http://` replaced by `https://` | One immediate retry after any fetch/body/status failure, unless caller abort wins | Same body path; no retry for XML parse failure |
| Probe initial request | Same direct-fetch path; final response URL retained | Same per-attempt policy | Try XML parse first |
| Probe candidates | Up to three unique advertised RSS/Atom links, serially, resolved against final page URL | Each uses direct-fetch/HTTPS policy; no aggregate core deadline | Candidate errors swallowed unless caller aborts; final failure is the original initial parse error |

Exact request headers (`C/feed-parser.ts:34–40`):

```text
Accept: */*
Accept-Language: en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36
```

Discovery retains attribute parsing, `&amp;` replacement, HTTP(S)-only links, credential rejection, encounter-order deduplication and the three-candidate cap (`C/feed-parser.ts:140–174`). A successful discovered feed reports the candidate URL, even if that candidate redirects.

Native `FeedHttp` uses Effect’s HTTP client with explicit redirect-following and disabled trace-header propagation. It checks status itself and maps failure to section 4’s errors. The deadline encloses request and text reading, then ends before XML parsing. Cancellation checks remain at section 5’s positions.

Compatibility supplies `FeedHttp` using the original global fetch at **call time**, preserving monkeypatched fetch seams. There is no constructor `fetch` option today; do not introduce one as a replacement. Preserve the string URL, raw options, header values, `redirect: "follow"`, pre-abort check, combined signal and original response URL fallback.

Keep request and text reading as separate bridge calls because they are separate old awaits. Do not replace them with a single Promise that changes the interleaving boundary. Native HTTP errors are not assumed to have the same shape as Node fetch failures; compatibility retains the original failure value.

`rss-parser` stays behind one driver. Preserve lazy construction per fetcher and its custom fields, headers, timeout, `maxRedirects: 20`, `defaultRSS: 2`. Only `parseString` is called: those parser URL settings do not control fetch redirects.

The host’s probe adds a separate 30-second AbortSignal deadline and may retry `sourceUrl` after a resolved-feed failure (`M/agent-management-host.ts:309–320`). That remains host behavior.

### Processes and files

There are **no spawn sites** in subscriptions-core: no command, argv, environment, process-output consumption, timeout or kill policy to port.

Profile mapping, metadata hydration and downloading may spawn through injected host services. They retain downloader-core’s reviewed process contract and per-site policies. Subscriptions-core does not import a process service to duplicate that ownership.

There are **no direct file reads or writes** in core. SQLite files belong to the host/db adapter. Desktop schema setup and directory creation remain in `M/subscriptions-host.ts:63–95,122–141`. No file service is added to core.

### Timers, clocks, deadlines and entropy

| Site | Purpose and timing | Process liveness | Service/layer mapping |
| --- | --- | --- | --- |
| `feed-parser.ts:91–115` | One 180-second request timer per attempt; abort; clear in finally | Referenced | `SubscriptionTimers.after`; legacy native timeout, native owned Clock deadline |
| `leader.ts:261–267` | Fixed interval heartbeat, default 30 seconds; callback does not await prior heartbeat | Referenced | `every`; preserve overlap and detached Promise failure channel |
| `leader.ts:126–251` | Acquisition/start/heartbeat/expiry/release timestamps; TTL default 90 seconds | No separate expiry timer | `SubscriptionTimers.now` |
| `scheduler.ts:88–103,172–183` | Start delay defaults zero; API interval 5 minutes, standalone interval 3 hours; rearm after tick completes | Referenced | `after`; generation guard, cancellation and detached tick failure |
| `scheduler.ts:110–123,186–192` | Per-instance trigger timestamp, 30-second dedupe, prune older than four windows | No extra timer | `now` |
| `api.ts:136,483–553,571–650` | Due checks, check start/success/failure, profile batch ID and next-check planning | No extra timer | `now`, preserving each sample |
| `api.ts:389–398` | One Promise microtask for batched removal IDs | No referenced timer | `LegacyTiming` and owned continuation; legacy discarded-Promise semantics |
| `store.ts:320,393,453,476,514,561,602,638,681,759` | Rule/item/meta write timestamps and placeholders | No extra timer | Per-store clock; preserve sampling order |
| `feed-items.ts:40–50,215` | Parse `isoDate`, then `pubDate`; fallback time per undated usable item | No timer | `SubscriptionDates`, `now` |
| `profile-policy.ts:126–131` | One discovery timestamp per policy call | No timer | `now` |
| `profile-policy.ts:54–65` | Future retry hint or rounded interval ±10% jitter | Persisted deadline, no dedicated timer | Explicit calculation plus `SubscriptionEntropy.next` |
| `store.ts:322` | Default subscription UUID | None | Native SecureRandom UUIDv4; legacy `randomUUID` or injected generator |
| `leader.ts:131` | Lease ULID | None | Native SecureRandom ULID; legacy original `ulid()` |

Compatibility preserves timer handles exactly, including falsy handles and the distinctions between truthiness checks in leadership and null checks in scheduling. No timer is unref’d today.

API `now` overrides the leader’s `now` when supplied; scheduler options’ `now` is overwritten by API `now`; store clocks remain independently supplied. Lease `ulid()` uses its own library time, not the injected election clock.

Native referenced-timer equivalence requires the Node exit oracle. Clock/fiber signatures alone do not establish it.

## 7. Pure modules

Keep synchronous signatures for the form, status, timeline, resolver, download-options, catalog, category, cover, thumbnail, dedupe, interval, due and status-summary helpers listed in section 2. Native stored-rule calculations use the wider internal contracts without changing old typed caller results.

Rule-driven internal changes:

- Native Map/Set construction becomes Effect collections. Preserve first-occurrence order, stable sorting, duplicate replacement behavior and callback identity explicitly.
- Do not change `resolveSubscriptionItemStatus`’s supplied `ReadonlyMap` into a HashMap parameter. It constructs no native collection and unported renderer callers need that signature.
- JSON parsing/encoding uses Schema. List recovery remains whole-list fallback, not “keep the valid members.”
- Date/clock/random defaults move behind capabilities; default-bearing old signatures stay legacy.
- Raw parser interpretation retains unknown values through each old branch. It does not decode into the narrow public domain before policy or writing.
- Use `Function.dual` where `missingPipeableSignature` requires a pipeable form, retaining existing call forms.
- Effect generators use `Effect.fn`/`fnUntraced`.
- No suppression, diagnostic override, lowered severity, native collection construction, zod import or `any` cast enters the strict package.

Pure target-string semantics remain literal. `buildDefaultSubscriptionDirectory` continues to use `/`, even for a supplied Windows-style path. URL normalization does not become network discovery.

These changes are unobservable for retained pure exports. Explicit-capability calculations are new strict APIs; their legacy wrappers preserve old defaults, results and failure positions.

## 8. The compatibility package

Legacy exports the old classes and interfaces with their original signatures, including:

- `SubscriptionsApi` and all public methods at `C/api.ts:165–467`;
- `RssParserFeedFetcher.fetch/probe`;
- `LeaderElection.isLeader/tryAcquire/heartbeat/release/observe`;
- `FeedCheckScheduler.start/stop/triggerNow`;
- both SQLite factories and the eleven-operation `SubscriptionsStore`;
- `InMemoryMetaStore`;
- default-bearing normalization/policy helpers;
- old narrow feed, policy and enqueue callback declarations where the implementation carries wider values;
- the live zod update-schema closure.

Pure exports may be re-exported where the old root needs them.

### Runtime ownership

| Owner | Runtime and lifetime |
| --- | --- |
| `SubscriptionsApi` | One warmed runtime per API instance, shared by internal leader, scheduler, event registry and continuations |
| Standalone leader/scheduler/fetcher/memory-store facade | One warmed runtime per stateful instance |
| Stateless policy wrappers | One shared module runtime where runtime execution is needed |
| SQLite handle | Exactly `runtimeForHandle(handle)` from `@vidbee/db/legacy`; shared adapter/cache/permit across both factories and all packages |

The original factory argument stays `{ db: BetterSQLite3Database, now?, generateId? }`. The actual constructed Drizzle database exposes `$client` (`drizzle-orm/better-sqlite3/driver.d.ts:19–30`). Compatibility obtains the handle for shared runtime ownership while retaining the original `db` for query execution.

Factory construction performs no SQL, migration, pragma or connection lifecycle action. Handle acquisition/warming must not turn an old operation rejection into a new constructor throw. Characterize invalid/closed-handle behavior and preserve its failure position.

### Supplied-Drizzle persistence

`DrizzleSubscriptions.driver.ts` in the unported sibling retains the existing query-builder statements and synchronous transaction bodies from `C/store.ts`. It implements the store/meta capabilities over the supplied Drizzle object. Strict row decoding, stored-view interpretation and serialization policy remain shared; the compatibility driver does not become a second policy implementation.

This preserves behavior that cannot be recovered from `$client` alone:

- Exact statement SQL, selected columns, parameter order and conditional update columns.
- Preparation before logging.
- The supplied Drizzle logger, including its invocation count, arguments, synchronous re-entry and thrown value.
- Drizzle’s `paramsInErrors` configuration and query-dependent `DrizzleQueryError` construction.
- Original `.cause`, class and message for statement errors.
- Raw better-sqlite3 transaction-control errors and its rollback behavior.

Do not read private logger fields, install a replacement logger on the supplied object, or reconstruct Drizzle messages from an approximate native query. Executing the original statement through the supplied object supplies these observations directly.

Each synchronous database segment runs on `runtimeForHandle(db.$client)` and reserves its contextual `SqlClient` connection using `Effect.scoped` and `sql.reserve`. Within that reservation it executes the original synchronous Drizzle segment inside `Effect.try`; the reservation closes before the legacy Promise turn. Compatibility uses the original deferred Drizzle transaction body inside that segment, rather than wrapping it in another Effect transaction. It does not acquire a second reservation from inside the segment.

An orphan reconciliation read releases its reservation before host task lookup; clearing obtains a new reservation. No host Promise is invoked while reserved. Tests cover synchronous logger re-entry and reject an implementation that adds a permit-induced suspension or changes the old callback result.

Failures from the Drizzle segment become `HostFailure` retaining the original thrown value. The subscription error mapper unwraps that value first. Generic `rethrowDriverError` remains unchanged and is used for the native SQL/raw-driver boundary, not as a blanket mapper for a retained Drizzle error.

Native strict persistence independently executes the section-6 SQL contract through contextual `SqlClient`, with explicit `BEGIN`. Both paths use the same row/projection codecs, including local bigint conversion. Differential statement traces and rollback tests prevent the temporary compatibility driver from drifting.

This temporary execution bridge follows the settled sibling-package precedent: host behavior that the strict native boundary cannot supply stays in the unported sibling until its consumer migrates. Phase 9.2 must resolve the Drizzle logger/query-error surface before switching the application to native SQL persistence.

Only the database owner calls `releaseHandle` before closing its handle. API stop and store facades do not close it. Stop does not dispose the API runtime or cancel unrelated in-flight work.

Queue handoff remains:

```text
subscriptions runtime → legacy enqueue callback → existing queue/downloader facade
queue removal callback → subscriptions runtime → synchronous removal notification sink
```

No second queue, downloader owner or admission state is constructed.

### Wiring

| Surface | Required change |
| --- | --- |
| Strict manifest | Add `effect`, `@vidbee/schema`, `@vidbee/db`, strict task-queue and phase-5 downloader dependencies; retain `rss-parser` behind its driver |
| Legacy manifest | Depend on strict core, db legacy entry, shared task-queue runtime utility, downloader-legacy schemas, Drizzle, zod and ulid; retain better-sqlite3 types for borrowed ownership |
| Versions | Third-party dependencies use root `catalog:`; internal dependencies use `workspace:^`; remove hardcoded better-sqlite3 peer range |
| Strict configs/scripts | Extend root base; source `include: ["src"]`; separate strict test config; port-guide `check`, `test`, `build` scripts |
| Legacy config | Unported, explicit `exactOptionalPropertyTypes: false`; own no-emit typecheck including compatibility tests |
| Desktop dependencies | Keep strict package for pure/types; add legacy |
| Desktop bundling | Add legacy beside strict core in `bundledWorkspacePackages`, `apps/desktop/electron.vite.config.ts:26`; inspect packaged main for unresolved imports |
| UI dependencies | Keep strict core only |
| Root checks | Add strict and legacy check filters; strict test/build filters; preserve existing filters |
| Test globs | Move facade characterization to legacy; change root `test:audit` from `packages/subscriptions-core/test/*.test.ts` to legacy location; native Effect tests run through strict package’s Vitest script |
| Scheduler audit | Update task-queue-legacy relative source import to the package entry |
| Lint | Add strict core to root Biome scope; keep legacy outside strict scope; do not broaden legacy formatting |
| Source specifiers | Relative `.js` specifiers in both packages |
| Ratchet | Strict source and tests pass every diagnostic; legacy remains unported until phase 10 |

The existing package config includes `tests/**/*`, but the directory is `test/`. Correct test inclusion.

The standalone command `bunx --no-install tsc --noEmit -p packages/subscriptions-core/tsconfig.json` reports six errors on this snapshot:

| Source | Diagnostics |
| --- | --- |
| `packages/downloader-core/src/social-media.ts:140` | Two `string \| undefined` arguments |
| Same file `:297,307,347` | Three unchecked-index argument/result errors |
| `packages/downloader-core/src/threads.ts:29` | Possibly undefined regex capture |

Phase 5 should resolve these in its strict pure helpers. Phase 6a verifies that prerequisite. If any remain, use checked bindings and control-flow narrowing that preserve accepted inputs and branch order; do not add fallback values, broaden accepted URLs or suppress diagnostics.

## 9. Deliberate changes

These changes are recorded in `OWNER-REVIEW.md`. Nothing else changes observable application behavior.

1. **Physically invalid database rows receive `DbRowDecodeError`.** Full-row and projection decoding rejects values outside the db model, including nonfinite numeric columns and incompatible SQLite storage classes. Today some pass through or fail later. Do not skip/delete a subscription or repair its data automatically. Record content-free table/column paths and preserve the original row.
2. **Native structured logging uses Effect Logger and full Causes.** Native log representation may change as required by D33/D34. Compatibility preserves injected callback invocation count, position, original arguments, recoverable failure and escape behavior through `SubscriptionLog`; log-level filtering does not suppress that callback.
3. **Under better-sqlite3 safe-integer mode, every integer column is converted to a number.** This follows task-queue design section 9 item 4. Today timestamps can escape as bigint and flags stored as `1n` map to false because `intToBool` compares with `1` (`C/store.ts:70–90,136–143`). Local codecs convert before boolean mapping, so those flags become true. Conversion includes `Number` precision loss, as in the task-queue precedent. No application host enables this mode. Characterize old results before the port and retain explicit old/new expectations. Never call `defaultSafeIntegers` or otherwise reconfigure the shared handle.

Unknown enum strings, malformed JSON-list fallback, permissive parser values and traversal failures, Drizzle errors/logger behavior, Promise timing, unsubscribe booleans, abort reasons, detached rejection channels and timer liveness are preserved behavior.

SecureRandom’s native monotonic ULID differs from the legacy library’s non-monotonic generation policy. The application keeps the legacy entropy layer in this phase. Native ID generation, HTTP error representation and replacement of the supplied-Drizzle execution surface are phase-9.2 cutover obligations, not accepted application changes here.

No schema migration, policy correction, extra input validation, retry, automatic lease reacquisition, cancellation expansion or transaction strengthening is proposed.

## 10. Verification the implementation owes

### Characterization before implementation

Write unit-level pinning tests against the old package first. Keep assertions unchanged through the port, changing only import and fixture wiring. Section 9’s row-rejection and safe-integer cases retain explicit old/new expectations.

| Area | Required fixtures and assertions |
| --- | --- |
| Public declarations | Old declaration fixture, explicit undefined/null, nested array mutation, readonly selector arrays with mutable element fields, positive element-field assignment, generic timeline inference, callback/Promise return types |
| URL/form/status helpers | YouTube/Bilibili regex cases, aliases and synthetic keys, query order/path case/trailing slashes, Windows-style strings, inherited status keys, taskId/downloadId precedence |
| RSS normalization/artwork | RSS 2.0, Atom, podcast/iTunes, media arrays/objects, enclosure types, HTML image/srcset precedence, whitespace IDs, missing fields, malformed nested values, stable equal-date order |
| Permissive contracts | Unknown stored platform/status/preference strings through get → policy → enqueue/profile capability; malformed parser values through fetch → probe/normalization → policy → write/admission without premature narrowing |
| Malformed XML custom field | Nested `yt:videoId` produces an object; full fetch/check sequence reaches `candidate.trim is not a function`; TypeError class/message/position, failed status, persisted message, fulfilled refresh and no replacement/admission |
| Dates/clocks | ISO with/without zone, RFC dates, invalid dates, isoDate→pubDate fallback, timezone/DST; nonstring coercion and coercion failure; exact fallback-clock count |
| Feed policy | Initial/latest-only matrix, cutoff equality, keywords OR/case, duplicate IDs/URLs, history order, autoDownload false, full persisted snapshot |
| Profile policy | Initial backlog, categories/order, stable discovery times, URL/category dedupe, versioned highlights, history bypass, error severity and retry/jitter endpoints |
| SQL | Every statement/transaction, defaults, optional-column omission, unknown text, JSON recovery, profile 300/full-get split, ordering, duplicates and rollback |
| Drizzle failures/logger | Preparation failure; constraint failure with duplicate-item rollback; exact class/message/query/params/cause; `paramsInErrors` on/off; throwing logger identity and count; logger before execution; synchronous logger re-entry; raw transaction-control failure |
| Safe-integer mode | Full subscription/item/meta rows and numeric projections; old bigint timestamps and false flags versus converted numbers/true flags; nullable fields, large integers and unchanged shared-handle mode |
| Queue links | Placeholder upsert; stale/missing/live links; absent task callback; unique lookup caching; task-ID/item selectors and change counts |
| Election | Empty/fresh/expired/null-expiry leases, preference, CAS loss, heartbeat/release failure, repeated acquire, callback/log order, independent clock/ULID time |
| Scheduler | Start/stop/restart generations, zero/falsy handles, slow runAll, pending rerun, one-ID bypass, failed-trigger dedupe and pruning |
| API races | Same-ID joining, different-ID overlap, update/remove during fetch, profile abort, RSS non-cancellation, admission failure, link-write failure, stop during checks |
| Events | Immediate re-entry/read, duplicate registration, live add/remove/re-register, stale unsubscribe, exact `true/false/false` deletion results, listener throw, logger throw, ignored Promise |
| Fallible logging | Enqueue-warning logger throws → outer feed-check warning → failed-state write → fulfilled refresh; outer logger throw prevents write; listener logger throw escapes; leader logger throw retains preceding state/timer mutations; callback still runs under restrictive log level |
| Cancellation | Pre-abort, non-Error/falsy reasons, abort during request/text/parse/candidate discovery; caller-versus-timeout precedence; no HTTPS retry after caller abort; timeout cleared before parse; borrowed-signal ownership and cleanup |
| Detached failures | Heartbeat, tick, pending rerun and removal-flush logger failures; timer callback returns undefined; original reason reaches Node unhandled rejection; caught runAll failure remains caught; rearm/finally precedence |
| Timing | Immediate SQL observations, await ledger, nested Promise adoption, removal-batch overlap, settlement markers, synchronous throws versus rejected Promises |

The existing `profile-subscriptions.test.ts` assertions remain covered. Facade tests may remain node:test in legacy; strict service tests use `@effect/vitest` and `bunx --bun vitest run`. Keep the adjacent scheduler audit’s stop/rearm assertions. Add TestClock service tests without replacing recording-timer tests.

### SQL clients and persisted data

Run persistence assertions against:

1. Old direct better-sqlite3/Drizzle implementation as the characterization oracle.
2. Compatibility persistence through the supplied Drizzle object and shared handle runtime.
3. Native persistence through borrowed better-sqlite3 SqlClient.
4. Target node SqlClient, in a separate process.

Include deferred-begin tracing, nested/host-owned transactions, duplicate-item rollback, SQL/parameter-dependent Drizzle messages, raw transaction-control failure, throwing-logger identity, synchronous reservation release and handle survival after facade stop. Driver-specific errors differ on node; do not claim cross-driver identity.

A failed `replaceItems` constraint test starts with known rows and proves the old snapshot survives rollback. A missing-table/preparation test proves no logger call occurs before failed preparation. A throwing-logger test proves one invocation and no subsequent statement execution. An API SQL-failure case pins the exact Drizzle message persisted as `lastError`.

On the supplied consistent copy of the owner’s data, decode every subscription/item/meta row and exercise stored-view mapping without fetching or enqueueing. Report only counts and schema paths, never values, IDs, URLs or JSON content. Include counts of unknown persisted enums and JSON-list recovery outcomes. Verify no writes during this read audit. For subsequent scratch mutation/reopen tests, compare private local integrity evidence and report aggregate outcomes only.

### Node oracle

Vitest runs under Bun. Node-specific semantics run in explicit subprocesses using pinned Node 22.23.4, verified before execution.

Compare old/new structured traces for:

- date parsing under UTC and a non-UTC timezone, including raw coercion;
- pre-aborted signals, custom/non-Error reasons, timeout conversion and abort during text reading;
- successful XML parsing that aborts the caller and returns a feed, followed by rejection with the same reason and one request;
- probe cancellation after initial parsing and during candidate work, with no later candidate request;
- fetch arguments, redirect/final URL, body failures and original error identity;
- XML parser errors and malformed traversal TypeErrors through the complete API recovery sequence;
- referenced timeout/interval process liveness;
- callback re-entry, unsubscribe return values and Promise settlement;
- detached heartbeat rejection by original sentinel identity, interval callback returning undefined;
- scheduler caught runAll failure, throwing catch logger, skip logger, pending rerun, rearm failure and finally precedence;
- listener and leader logger failures, including their state/event sequence.

Unhandled-rejection fixtures install the observer only inside their isolated child process. They assert reason identity and event count there and report structured results. Do not add a production rejection handler to make the test pass.

Identity is asserted inside each subprocess. Normalize only varying paths, ports, IDs and timestamps, not messages, event order or return types. Missing pinned Node is a failed prerequisite.

### Goldens recorded before phase 6a

Extend the loopback server **before porting core** and record against the packaged build preceding this phase. The current server serves media for unrecognized paths; XML/HTML routes need explicit handlers before that fallback (`apps/desktop/scripts/port/golden/loopback.mjs:20–58`).

The fixture serves:

- fixed RSS 2.0 and Atom documents, with fixed GUIDs, titles, publication dates and two or more items;
- absolute item links to existing loopback media routes;
- a fixed loopback cover image;
- a redirect route whose target HTML advertises relative RSS/Atom links;
- duplicate, invalid, credential-bearing and more-than-three alternate links;
- a switchable RSS revision retaining one item, dropping one and adding one newer item;
- malformed XML and failing candidate routes;
- fixed content headers and bounded request logging, with no external URL dependency.

Use publication dates that force the intended initial cutoff branch. Pin destination, cookies, proxy/config, subtitles, embedding and ASR from the existing loopback scenario.

Public MCP add probes the URL, and it immediately calls `api.refresh` when the created subscription is enabled (`M/agent-management-host.ts:426–444`). Auto-download false does not prevent that refresh. Create with `enabled: false` wherever setup must leave the item snapshot empty. Probe requests during creation are recorded separately and do not count as refresh evidence.

MCP refresh and automation HTTP refresh both reach `api.refresh` (`M/agent-management-host.ts:386`, `apps/desktop/src/main/local-api.ts:401`), which calls the scheduler’s 30-second instance-local dedupe (`C/api.ts:287–294`, `C/scheduler.ts:110–123`). A repeated public refresh inside that window can return an existing up-to-date row without fetching.

Use these state recipes:

| Scenario | Prior state and action | Required evidence |
| --- | --- | --- |
| Initial items | Create disabled with auto-download false; verify no stored items; request the first explicit refresh while still disabled | Request cursor advances for the subscription’s XML route; response completes; get/items shows exact snapshot and metadata |
| Revision | Complete the initial refresh of revision A on one subscription; retain its ID and stored item/link evidence; switch to B; allow at least 30 seconds from that subscription’s last accepted trigger, then refresh the **same** subscription | New completed B XML request; retained ID remains, dropped ID disappears, newer ID appears; latest metadata changes; retained queue link survives where seeded |
| Automatic admission | Create a separate disabled subscription with auto-download true and no known rows/history for its unique fixture item URLs; perform its first explicit refresh | New completed XML request; exact admitted tasks, options/group/priority, completion/history and persisted links |
| No duplicate admission | Start from that completed automatic-admission state; after at least 30 seconds from its accepted trigger, refresh the same unchanged feed | New completed XML request and completed refresh; snapshot/last-success processing observed; task/history counts do not grow and links remain |
| Manual queue | Start from the initial-items subscription with auto-download false and an unqueued stored item | First manual queue admits/links it; repeat returns existing-link behavior |
| Remove/requeue | Remove the manually queued task through the public owner surface; wait for cleared link; manually queue the same stored item again | Link clearing and new task evidence; a later actual automatic refresh still treats the item as seen |
| Reopen | Use the same physical synthetic profile after a controlled harness restart | Configuration/items/links reopen; startup reconciliation is observed independently of a claimed explicit refresh |

Waiting for the dedupe interval is permitted here because it is part of the public behavior under test. Use a monotonic harness deadline and margin, not an assumption based on returned status. Do not use separate empty subscriptions as substitutes for revision or no-duplicate prior state. A controlled restart can reset the scheduler only in a separately identified restart scenario; it must not conceal missing state.

Keep these subscriptions disabled during the scenarios so periodic `refreshAll` cannot consume their intended refresh. Direct public one-ID refresh bypasses enabled/due guards through `refreshOne` (`C/api.ts:287–294,456–467`). Enabling is unnecessary for the controlled manual-refresh admission case. Add a separate enabled-scheduling characterization at service level.

| Proposed golden case | Public action and pinned evidence |
| --- | --- |
| `loopback-subscriptions-probe-rss` | `test_subscription`; successful title, parsed/usable counts, samples and direct feed URL |
| `loopback-subscriptions-probe-atom` | Atom identity/date/link mapping |
| `loopback-subscriptions-probe-discovery` | Redirected HTML → relative advertised feed; corrected/discovered URL and samples |
| `loopback-subscriptions-probe-invalid-xml` | Failed probe with initial parser error retained after candidate failures |
| `loopback-subscriptions-create-read` | Disabled creation, then get/list; defaults, saved preferences and empty stored items |
| `loopback-subscriptions-duplicate` | Duplicate create and equivalent feed-key case through public surface |
| `loopback-subscriptions-refresh-items` | First actual refresh with auto-download off; XML request, persisted items, title/source/cover, status and pagination |
| `loopback-subscriptions-refresh-revision` | Same subscription A → B after dedupe interval; new XML request and replacement proof |
| `loopback-subscriptions-auto-download` | Fresh disabled subscription with auto-download true; first actual refresh; task completion, group/priority/options, links/history |
| `loopback-subscriptions-refresh-no-duplicate` | Same successful subscription after dedupe interval; completed fetch/policy path, no new admission, retained links/history |
| `loopback-subscriptions-manual-queue` | Queue unqueued stored item, then queue again; return/link behavior |
| `loopback-subscriptions-remove-task-requeue` | Remove task, observe cleared link, manually requeue; actual later refresh still sees the item |
| `loopback-subscriptions-remove-read` | Remove subscription, then get/list/items behavior; host task-cancellation contract |
| `loopback-subscriptions-reopen` | Restart same synthetic profile; persisted configuration/items/links and orphan reconciliation |

Every claimed refresh has a request-log cursor taken immediately before its public action and a matching completed XML response afterward. The scenario also awaits the public response and checks resulting persisted state. A request alone does not establish completed policy/persistence; unchanged status alone does not establish a request.

Exercise successful refresh through both MCP and automation HTTP where dispatch differs. Retain renderer subscription-route smoke and add fixture rows for visible successful items.

Poll bounded state conditions. Subscribe before admission where task transitions matter. Do not golden arbitrary counts of transient changed broadcasts or raw download progress. Keep full wire/event/request evidence. Preserve stable item order, task linkage, statuses, errors, output/history and filenames.

Record and inspect the new documents on the pre-phase build, prove repeated isolated and full-suite comparisons, and carry them unchanged through the port. Existing goldens must have zero parity-driven changes.

### Gates and manual proof

Run strict/legacy package checks, ratchet, whole-repo check/test/catalog gates, Linux packaging, CLI build and goldens in port-guide order. Confirm desktop bundling and renderer imports contain no unresolved legacy package or Node-only browser dependency.

By hand, offline, on an isolated synthetic profile:

- add direct and discovered loopback feeds;
- edit preferences and interval, refresh, inspect timeline/status;
- queue an item, remove its task and queue again;
- remove a subscription with pending work;
- restart and inspect persisted state;
- exercise a synthetic profile-fetcher integration separately from real site mapping.

The namespace-local feed proves real HTTP/XML/SQL/queue integration. It does not prove YouTube/Bilibili/RSSHub behavior, authenticated profile mapping, real-site rate limits, proxy/cookie negotiation, HTTPS certificate handling or remote media extraction. Those require separately authorized network testing. Windows/macOS compile coverage is not launch proof.

## 11. Behavior kept as it is

Candidates for the owner’s review, not fixes in this phase:

| Source | Preserved behavior |
| --- | --- |
| `leader.ts:126–168` | Reacquiring a fresh lease already held locally can clear local ownership/heartbeat while leaving the stored lease until expiry |
| `leader.ts:280–295`, `store.ts:719–722` | Election considers null expiry acquirable; CAS refuses a present lease with null expiry; preference can prevent stealing an expired lease |
| `api.ts:187–195,434–438` | Acquisition happens at startup only; a startup loser does not automatically take over |
| `leader.ts:265–267` | Heartbeat callback returns undefined and discards its Promise; rejection reaches the legacy process as an unhandled rejection |
| `scheduler.ts:148–183` | runAll failure is caught; logger/rearm failures and detached pending rerun can reject discarded Promises |
| `scheduler.ts:110–123` | Dedupe is instance-local, consumed before work and by failed refreshes; duplicate triggers return without joining |
| `scheduler.ts:126`, `api.ts:434–446` | Trigger-all is not forced; direct `refreshOne` bypasses enabled/due/lease guards |
| `api.ts:498–518,592–619` | Seen rows persist before admission; null/failed admission can suppress later automatic retry; link failure can leave an unlinked task |
| `api.ts:512–553` | An inner enqueue-warning logger failure reaches the outer check catch; an outer logger failure prevents the failed-state write |
| `api.ts:315–359` | Manual enqueue has no per-item lock |
| `api.ts:165–178` | Live Set listener order and identity; unsubscribe’s declared void closure returns the deletion boolean; listener logger failure can escape |
| `store.ts:475–505,516–555` | Replacement does not dedupe supplied IDs; merge does not extend its initial existing-ID set; duplicate new IDs can roll back |
| `store.ts:174–205,441–462` | Assigning `lastError: undefined` can leave old SQL error text intact |
| `store.ts:466–472`, `api.ts:280–283,490–546` | Parent/child deletion is non-atomic; RSS work can persist children or admit tasks after removal |
| `api.ts:572–578` | Initial profile update/event precedes try/finally; early failure can leave controller registration |
| `api.ts:197–200,389–398` | Stop does not join checks/batches; removal-flush reference resets before release settles |
| `api.ts:245–270` | Update validates categories against old platform and does not recompute source kind/owner after platform/source changes |
| `store.ts:323–358` | List loads all children before profile slicing to 300; get returns full history |
| `feed-resolver.ts:95–155` | Unanchored platform regexes, legacy YouTube handle feed form, scheme/fragment-insensitive duplicate key, path/query-order sensitivity |
| `feed-items.ts:31–50` | Whitespace preferred identity drops an item rather than trying another ID; object preferred identity reaches `.trim()` failure; fallback clock samples per usable undated item |
| `feed-items.ts:108–168,211–230` | Truthy malformed link/title/artwork values can survive normalization until later interpretation or driver binding |
| `status.ts:57–69` | Status membership uses `in`, including inherited names |
| `status.ts:89–114` | Missing live/history task means notQueued even when added is true; taskId wins over downloadId |
| `feed-parser.ts:108–112,123–136,188–218` | Caller abort reason takes precedence at explicit checks, including after parsing; HTTPS retry covers fetch failures only; candidate failures hide behind initial parse error; discovered URL can remain pre-redirect candidate |
| Installed Drizzle `better-sqlite3/session.js:20–44`, `sqlite-core/async/session.js:80–133` | Statement preparation/execution errors are wrapped, supplied logger failures are not, and native transaction control has its separate failure boundary |
| `M/profile-subscriptions.ts:81–88,174–180` | Instagram fetching does not forward the subscription AbortSignal to inspection |
| `profile-policy.ts:68–94` | Only followed category errors determine status; top-level error text alone does not |

## 12. Decisions on the draft’s open questions

The orchestrator took questions 1–6 on 2026-11-18. The architect’s review dispositions settle items 7–12 on the same date.

1. **Phase-5 integration and shared settlement entry.** Require phase 5’s strict helper exports and shared runtime utility before implementation of 6a. Main has the reviewed downloader design but not its port, and settlement remains inline in task-queue-legacy. Do not duplicate settlement code or import unported downloader source.
2. **Native HTTP cutover proof.** Retain compatibility transport for the application through phase 9.2. Stock `FetchHttpClient` constructs requests and wraps failures (`effect/src/http/FetchHttpClient.ts:115–153`); it does not supply the old injected-fetch call shape. Test native outcomes now and resolve request/error differences before switching layers.
3. **Native referenced-timer proof.** Use the explicit Node exit oracle as the gate. Add a narrow platform timer driver only for a demonstrated gap. Do not infer process-liveness parity from a type signature.
4. **Malformed RSS values.** Preserve current outcomes using permissive raw and interpreted models carried through fetching, probing, normalization, policy, writes and admission. Old narrow declaration projections stay in compatibility. Exact malformed fixtures precede coding. A newly discovered case requiring a new failure returns to section 14 for a decision.
5. **Persisted-data audit access.** A consistent copy of the owner’s database is supplied to the implementation in its scratch directory. The audit reports counts and schema paths only. No live-profile access and no success claim without the audit.
6. **Long real-time timeout golden.** Pin timeout semantics in Node/service tests and retain bounded public abort/failure goldens. Successful loopback refresh belongs in the regular golden gate. A full 180-second timeout can be a separately recorded slow test.
7. **Drizzle compatibility.** Retain the supplied Drizzle object and original synchronous SQL/transaction segments in the temporary compatibility driver. Share handle runtime ownership and strict row interpretation. Preserve exact query errors, logger behavior and raw transaction-control failures. The generic db adapter keeps its raw-driver contract. This follows the settled sibling boundary for host behavior unavailable from the native interface.
8. **Fallible logging.** Use `SubscriptionLog` at original call sites. Compatibility callback exceptions become recoverable `HostFailure`, callback invocation is independent of log filtering, and native observations use Effect Logger/full Causes. Do not rely on an ordinary throwing Logger adapter.
9. **Safe-integer mode.** Follow task-queue design section 9 item 4: locally convert every integer column to number, characterize first, declare the timestamp/boolean change in section 9, and never reconfigure the shared handle.
10. **Event cancellation.** Unsubscription is a boolean-producing operation distinct from timer cancellation. Preserve the old declared void closure and its actual runtime deletion result.
11. **Feed cancellation.** Borrow caller signals, own per-attempt timeout resources, retain the first abort reason and explicit post-parse/candidate checks, and preserve caller-versus-timeout precedence. Profile removal uses a separate owned token with today’s no-argument abort behavior.
12. **Detached work and golden state.** Compatibility settles deliberately discarded Promises through the shared exit observer at the original detach points. Goldens establish prior state on the same subscription, wait out public dedupe where needed and require new completed XML request evidence plus persisted-state assertions.

## 13. Review

Reviewer: an independent session on the review-panel tier, read-only, on 2026-11-18. It read clean `main` at `79f556b`, the draft, settled precedents, consumers, tests and installed libraries, and ran synthetic/in-memory probes. No blockers; four major findings, three minor findings and two questions:

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | major | Raw-driver unwrapping and retaining only `$client` lose Drizzle query errors, exact messages and supplied logger behavior. | Sections 4, 6 and 8: original supplied-Drizzle execution bridge, retained wrapper/identity/parameters, raw transaction-control distinction and unchanged generic db helper; section 10 adds preparation, rollback and throwing-logger characterizations. |
| 2 | major | Permissive parser and stored-rule schemas do not reach the service, policy, decision and enqueue contracts that carry those values. | Sections 3 and 5: explicit raw/interpretable/interpreted feed declarations and wider stored-rule contracts through every downstream seam; section 10 pins the complete nested-XML TypeError/recovery sequence. |
| 3 | major | A throwing Effect Logger produces a defect and cannot supply the promised recoverable host-logger failure semantics. | Sections 4 and 5: fallible `SubscriptionLog`, direct synchronous callback capture independent of filtering and narrowly scoped native logger-failure conversion; section 10 pins enqueue, listener and leader sequences. |
| 4 | major | Revision and no-duplicate goldens can pass because public refresh dedupes or setup has already marked every item seen. | Section 10: disabled creation, explicit same-subscription prior-state recipes, elapsed dedupe interval, completed XML request evidence and persisted-state/admission assertions. |
| 5 | minor | Valid safe-integer rows are outside the proposed numeric decoder, and conversion changes timestamps and flags. | Sections 3 and 9: task-queue-precedent local integer conversion with explicit declared change; section 10 keeps old/new characterizations and checks that the borrowed handle is never reconfigured. |
| 6 | minor | Void event cancellation loses the unsubscribe closure’s observable boolean result. | Section 5: separate boolean `Unsubscribe`; section 10 asserts first/repeated/duplicate and stale-closure results. |
| 7 | minor | `QueueLinkSelector`’s readonly array was incorrectly described as having readonly elements. | Section 3: readonly arrays with mutable element fields and an explicit element-assignment fixture. |
| 8 | question | Network cancellation lacks a reason-preserving token, notification, borrowing and cleanup contract, including abort during successful parsing. | Sections 5 and 6: declared cancellation contracts, source-position check table, caller/timeout precedence and ownership; section 10 adds parse and candidate abort oracles. |
| 9 | question | Detached failed fibers do not reproduce heartbeat and scheduler unhandled Promise rejections. | Sections 5 and 11: compatibility discarded-Promise dispatch through the shared exit observer, fallible scheduled commands and exact detach points; section 10 adds Node process-channel and rearm/logger fixtures. |

The reviewer found sound: the five-file consumer-change inventory, sibling split and runtime ownership, deferred transactions and permissive persistence policy, identified host capabilities and parser usage, installed Effect/date API choices, and the separation of characterization, SQL-client, isolated packaged and live-site proof.

## 14. Still open

None of the independent review’s findings remains open. A newly demonstrated behavior change beyond section 9 requires an architect decision here, with the current source behavior, options and characterization case recorded before implementation proceeds.