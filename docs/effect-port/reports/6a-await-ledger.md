# Phase 6a: Promise suspension ledger

This maps the unchanged archived subscription source to the compatibility mechanisms.
Line numbers are from the archived pre-port source, not the replacement re-export files.
The source archive was verified byte-for-byte against all fifteen modules on the pre-port
main tree. Native layers use no-op timing unless a compatibility owner supplies the
one-microtask `LegacyTiming` capability.

A host Promise bridge and a named internal turn are distinct. Synchronous SQL runs before
its original Promise; internal async method adoption receives a named turn. Exit-based
finalization makes those turns occur for rejection as well as fulfillment. Shared legacy
exit observers settle directly without an added final Promise handler.

The frozen API ledger, 17-case success/failure/concurrent/reentrant ledger with forty
markers, 31-case feed ledger, detached-failure/liveness fixtures, and stateful harness
exercise these boundaries. They prove the recorded cases; they are not a claim that every
possible third-party callback or host scheduler has been exhaustively enumerated.

| Archived position | Original suspension or adoption | Replacement |
| --- | --- | --- |
| `api.ts:188` | `await this.election.tryAcquire()` | Native election plus api:start:tryAcquire turn on its Exit before reconciliation or rejection. |
| `api.ts:190` | `await this.reconcileOrphanedTasks()` | api:start:reconcile turn on reconciliation Exit before startup warning or scheduler start. |
| `api.ts:199` | `await this.election.release()` | Native release plus api:stop:release turn on its Exit. |
| `api.ts:207` | `return this.election.observe()` | Native observe plus api:observeLeader:adopt turn on its Exit. |
| `api.ts:213` | `const items = await this.store.list()` | API host-store Promise bridge starts original synchronous prefix immediately; original facade catch reaction remains unchanged. |
| `api.ts:218` | `const sub = await this.store.get(input.id)` | API host-store Promise bridge starts original synchronous prefix immediately; original facade catch reaction remains unchanged. |
| `api.ts:234` | `const dup = await this.store.findDuplicateFeed(input.feedUrl)` | API host-store Promise bridge starts original synchronous prefix immediately; original facade catch reaction remains unchanged. |
| `api.ts:240` | `const created = await this.store.add(input)` | API host-store Promise bridge starts original synchronous prefix immediately; original facade catch reaction remains unchanged. |
| `api.ts:248` | `const dup = await this.store.findDuplicateFeed(patch.feedUrl, id)` | API host-store Promise bridge starts original synchronous prefix immediately; original facade catch reaction remains unchanged. |
| `api.ts:255` | `const existing = await this.store.get(id)` | API host-store Promise bridge starts original synchronous prefix immediately; original facade catch reaction remains unchanged. |
| `api.ts:272` | `const next = await this.store.update(id, storePatch)` | API host-store Promise bridge starts original synchronous prefix immediately; original facade catch reaction remains unchanged. |
| `api.ts:282` | `await this.store.remove(input.id)` | API host-store Promise bridge starts original synchronous prefix immediately; original facade catch reaction remains unchanged. |
| `api.ts:288` | `await this.scheduler.triggerNow(input.id)` | api:refresh:triggerNow turn on trigger Exit; scheduler work adds its internal refreshOne owner turn. |
| `api.ts:289` | `const sub = await this.store.get(input.id)` | API host-store Promise bridge starts original synchronous prefix immediately; original facade catch reaction remains unchanged. |
| `api.ts:301` | `const sub = await this.store.get(input.subscriptionId)` | API host-store Promise bridge starts original synchronous prefix immediately; original facade catch reaction remains unchanged. |
| `api.ts:322` | `const sub = await this.store.get(input.subscriptionId)` | API host-store Promise bridge starts original synchronous prefix immediately; original facade catch reaction remains unchanged. |
| `api.ts:332` | `const stillLive = linkedTaskId ? await this.linkedTaskStillExists(linkedTaskId) : false` | Captured task callback Promise adoption; api:itemsQueue:linkedTaskStillExists finalization accounts for nested helper await. |
| `api.ts:336` | `await this.store.clearQueueLinks({` | API host-store Promise bridge starts original synchronous prefix immediately; original facade catch reaction remains unchanged. |
| `api.ts:349` | `const taskId = await this.enqueueItem({` | Original enqueue callback Promise bridge, invoked with API receiver and unchanged context projection. |
| `api.ts:356` | `await this.store.markItemQueued(input.subscriptionId, input.itemId, taskId)` | API host-store Promise bridge starts original synchronous prefix immediately; original facade catch reaction remains unchanged. |
| `api.ts:368` | `const released = await this.store.clearQueueLinks({ taskIds })` | API host-store Promise bridge starts original synchronous prefix immediately; original facade catch reaction remains unchanged. |
| `api.ts:389` | `this.removedTaskFlush = Promise.resolve().then(async () => {` | One api:task-removal-batch microtask; IDs/flush flag clear before release begins. |
| `api.ts:394` | `await this.releaseRemovedTasks(ids)` | api:removalFlush:releaseRemovedTasks turn on release Exit before warning; discarded Promise dispatch remains unhandled where old code discarded it. |
| `api.ts:409` | `return await this.taskExists(taskId)` | Captured task callback Promise adoption; api:itemsQueue:linkedTaskStillExists finalization accounts for nested helper await. |
| `api.ts:420` | `const released = await this.store.clearOrphanedQueueLinks(this.taskExists)` | API host-store Promise bridge starts original synchronous prefix immediately; original facade catch reaction remains unchanged. |
| `api.ts:435` | `const all = await this.store.list()` | API host-store Promise bridge starts original synchronous prefix immediately; original facade catch reaction remains unchanged. |
| `api.ts:446` | `await this.refreshOne(sub.id)` | api:refreshAll:refreshOne turn on refresh Exit before per-subscription warning or next iteration. |
| `api.ts:460` | `return running` | Three named refreshOne adoption/reaction turns applied to Deferred Exit, including rejection; same-ID waiters preserve old settlement markers. |
| `api.ts:462` | `const check = this.checkSubscription(subscriptionId).finally(() => {` | Registered completion plus api:refreshOne:finally turn before unconditional legacy map deletion; reentrant synchronous get prefix remains independently runnable. |
| `api.ts:466` | `return check` | Three named refreshOne adoption/reaction turns applied to Deferred Exit, including rejection; same-ID waiters preserve old settlement markers. |
| `api.ts:475` | `const sub = await this.store.get(subscriptionId)` | API host-store Promise bridge starts original synchronous prefix immediately; original facade catch reaction remains unchanged. |
| `api.ts:480` | `await this.checkProfile(sub)` | api:checkSubscription:checkProfile turn on profile Exit; initial checking failures and early-return cleanup retain their old boundaries. |
| `api.ts:484` | `await this.store.update(subscriptionId, {` | API host-store Promise bridge starts original synchronous prefix immediately; original facade catch reaction remains unchanged. |
| `api.ts:490` | `const feed = await this.fetcher.fetch(sub.feedUrl)` | Original fetcher/profile-fetcher Promise bridge, with owned profile signal passed unchanged. |
| `api.ts:498` | `await this.store.replaceItems(subscriptionId, decision.feedItemsToPersist)` | API host-store Promise bridge starts original synchronous prefix immediately; original facade catch reaction remains unchanged. |
| `api.ts:504` | `const taskId = await this.enqueueItem({` | Original enqueue callback Promise bridge, invoked with API receiver and unchanged context projection. |
| `api.ts:510` | `await this.store.markItemQueued(subscriptionId, item.id, taskId)` | API host-store Promise bridge starts original synchronous prefix immediately; original facade catch reaction remains unchanged. |
| `api.ts:534` | `const current = await this.store.get(subscriptionId)` | API host-store Promise bridge starts original synchronous prefix immediately; original facade catch reaction remains unchanged. |
| `api.ts:546` | `await this.store.update(subscriptionId, patch)` | API host-store Promise bridge starts original synchronous prefix immediately; original facade catch reaction remains unchanged. |
| `api.ts:550` | `await this.store.update(subscriptionId, {` | API host-store Promise bridge starts original synchronous prefix immediately; original facade catch reaction remains unchanged. |
| `api.ts:572` | `await this.store.update(sub.id, {` | API host-store Promise bridge starts original synchronous prefix immediately; original facade catch reaction remains unchanged. |
| `api.ts:579` | `const result = await fetcher.fetch(sub, controller.signal)` | Original fetcher/profile-fetcher Promise bridge, with owned profile signal passed unchanged. |
| `api.ts:581` | `const current = await this.store.get(sub.id)` | API host-store Promise bridge starts original synchronous prefix immediately; original facade catch reaction remains unchanged. |
| `api.ts:592` | `await this.store.mergeItems(sub.id, decision.itemsToPersist)` | API host-store Promise bridge starts original synchronous prefix immediately; original facade catch reaction remains unchanged. |
| `api.ts:604` | `const taskId = await this.enqueueItem({` | Original enqueue callback Promise bridge, invoked with API receiver and unchanged context projection. |
| `api.ts:611` | `await this.store.markItemQueued(sub.id, item.id, taskId)` | API host-store Promise bridge starts original synchronous prefix immediately; original facade catch reaction remains unchanged. |
| `api.ts:641` | `await this.store.update(sub.id, patch)` | API host-store Promise bridge starts original synchronous prefix immediately; original facade catch reaction remains unchanged. |
| `api.ts:645` | `if (await this.store.get(sub.id)) {` | API host-store Promise bridge starts original synchronous prefix immediately; original facade catch reaction remains unchanged. |
| `api.ts:647` | `await this.store.update(sub.id, {` | API host-store Promise bridge starts original synchronous prefix immediately; original facade catch reaction remains unchanged. |
| `api.ts:654` | `} finally {` | withLegacyFinally performs identity-guarded controller removal on all body exits; early return skips the final changed event. |
| `leader.ts:127` | `const state = await this.metaStore.readLeader()` | Captured metadata callback Promise bridge in legacy leader; original receiver and callback await retained. |
| `leader.ts:140` | `const ok = await this.metaStore.casLeader({` | Captured metadata callback Promise bridge in legacy leader; original receiver and callback await retained. |
| `leader.ts:164` | `const fresh = await this.metaStore.readLeader()` | Captured metadata callback Promise bridge in legacy leader; original receiver and callback await retained. |
| `leader.ts:180` | `const ok = await this.metaStore.casLeader({` | Captured metadata callback Promise bridge in legacy leader; original receiver and callback await retained. |
| `leader.ts:197` | `const stolen = await this.metaStore.readLeader()` | Captured metadata callback Promise bridge in legacy leader; original receiver and callback await retained. |
| `leader.ts:229` | `const ok = await this.metaStore.casLeader({` | Captured metadata callback Promise bridge in legacy leader; original receiver and callback await retained. |
| `leader.ts:249` | `const after = await this.metaStore.readLeader()` | Captured metadata callback Promise bridge in legacy leader; original receiver and callback await retained. |
| `leader.ts:256` | `const state = await this.metaStore.readLeader()` | Captured metadata callback Promise bridge in legacy leader; original receiver and callback await retained. |
| `scheduler.ts:123` | `await this.opts.runOne(subscriptionId)` | Captured host runOne Promise bridge; API-owned scheduler adds api:scheduler:runOne at its internal owner boundary. |
| `scheduler.ts:126` | `await this.runIfIdle()` | Native runIfIdle plus scheduler trigger/tick LegacyTiming turn in Exit-based finalization, on success and failure. |
| `scheduler.ts:141` | `await this.runIfIdle()` | Native runIfIdle plus scheduler trigger/tick LegacyTiming turn in Exit-based finalization, on success and failure. |
| `scheduler.ts:145` | `} finally {` | withLegacyFinally captures the body Exit; cleanup runs on all outcomes and cleanup failure replaces the prior outcome. |
| `scheduler.ts:159` | `await this.opts.runAll()` | Captured host runAll Promise bridge; API-owned scheduler adds api:scheduler:runAll at its internal owner boundary. |
| `scheduler.ts:162` | `} finally {` | withLegacyFinally captures the body Exit; cleanup runs on all outcomes and cleanup failure replaces the prior outcome. |
| `feed-parser.ts:97` | `const response = await fetch(feedUrl, {` | FeedHttp.driver opens global fetch at call time through one Promise bridge; bare function receiver preserved. |
| `feed-parser.ts:106` | `return { body: await response.text(), url: response.url \|\| feedUrl }` | Separate response.text Promise bridge; timeout still covers body reading and closes before parsing. |
| `feed-parser.ts:113` | `} finally {` | Acquire/use/release around captured request Exit preserves original timer-clear failure precedence. |
| `feed-parser.ts:128` | `return await fetchFeedBody(feedUrl, signal)` | feed:xml:body or feed:xml:retry-body turn on the body Exit before retry/catch or return. |
| `feed-parser.ts:135` | `return await fetchFeedBody(httpsUrl, signal)` | feed:xml:body or feed:xml:retry-body turn on the body Exit before retry/catch or return. |
| `feed-parser.ts:189` | `const { body } = await fetchFeedXml(feedUrl, signal)` | feed:fetch:xml or feed:probe:xml turn on XML Exit before parsing, success and failure. |
| `feed-parser.ts:190` | `const feed = await this.parse(body)` | feed:fetch:parse or feed:probe:parse turn on parse/projection Exit before caller check or discovery. |
| `feed-parser.ts:200` | `const { body, url } = await fetchFeedXml(feedUrl, signal)` | feed:fetch:xml or feed:probe:xml turn on XML Exit before parsing, success and failure. |
| `feed-parser.ts:202` | `const feed = await this.parse(body)` | feed:fetch:parse or feed:probe:parse turn on parse/projection Exit before caller check or discovery. |
| `feed-parser.ts:212` | `const feed = await this.fetch(candidate, signal)` | feed:probe:candidate turn on candidate fetch Exit before result or next-candidate cancellation check. |
| `feed-parser.ts:233` | `const raw = await this.parser.parseString(xml)` | feed:fetch:parse or feed:probe:parse turn on parse/projection Exit before caller check or discovery. |
| `store.ts:651` | `live = await isLive(row.taskId)` | Original callback await remains between separately reserved read/clear segments in the Drizzle facade; no permit held during lookup. |

Database operations with no old await keep their synchronous SQL prefix. Replacement,
merge, link clearing and metadata CAS retain deferred transactions. Orphan reads release
the reservation before the callback await; clearing reacquires afterward. The active
same-handle synchronous region permits Drizzle logger re-entry without a second reservation.

Profile controller registration, the initial checking write and initial changed event
remain before the protected body. An early failure there retains the old registration
leak. RSS work may still persist children/admit after removal. Reentrant store-get callbacks
may still launch overlapping checks before the original async prefix returns; registration
is established before forking while its deduplication visibility follows that original prefix.
