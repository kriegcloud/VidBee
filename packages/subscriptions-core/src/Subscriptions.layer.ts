import { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import * as A from "effect/Array";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as MutableHashMap from "effect/MutableHashMap";
import * as MutableHashSet from "effect/MutableHashSet";
import * as O from "effect/Option";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { CheckCancellation } from "./CheckCancellation.service.js";
import { resolveFeedFromInput } from "./feed-resolver.js";
import { ProfileFeed } from "./ProfileFeed.service.js";
import { SubscriptionDispatch } from "./SubscriptionDispatch.service.js";
import { SubscriptionEntropy } from "./SubscriptionEntropy.service.js";
import { SubscriptionEvents } from "./SubscriptionEvents.service.js";
import { SubscriptionFeed } from "./SubscriptionFeed.service.js";
import { withLegacyFinally } from "./SubscriptionFinally.js";
import { SubscriptionLeader } from "./SubscriptionLeader.service.js";
import { SubscriptionLog } from "./SubscriptionLog.service.js";
import { SubscriptionPolicy } from "./SubscriptionPolicy.service.js";
import { SubscriptionQueue } from "./SubscriptionQueue.service.js";
import { layer as schedulerLayer } from "./SubscriptionScheduler.layer.js";
import {
  SchedulerWork,
  SubscriptionScheduler,
  SubscriptionSchedulerHost,
  SubscriptionSchedulerSettings,
} from "./SubscriptionScheduler.service.js";
import { SubscriptionStore } from "./SubscriptionStore.service.js";
import {
  DuplicateFeed,
  FeedCancelled,
  FeedParseFailure,
  FeedTraversalFailure,
  HostFailure,
  InvalidCategories,
  ProfileHostRequired,
  SubscriptionNotFound,
} from "./Subscriptions.errors.js";
import { SubscriptionMethodDispatch, Subscriptions } from "./Subscriptions.service.js";
import { SubscriptionTimers } from "./SubscriptionTimers.service.js";
import {
  DEFAULT_FEED_CHECK_INTERVAL_MS,
  DEFAULT_SCHEDULER_TICK_MS,
  isProfilePlatform,
  PROFILE_SUBSCRIPTION_CATEGORIES,
  SUBSCRIPTION_DUPLICATE_FEED_ERROR,
} from "./types.js";
import type { CheckToken } from "./CheckCancellation.service.js";
import type * as F from "./Feed.model.js";
import type * as M from "./Subscription.model.js";
import type { SchedulerOptions } from "./SubscriptionScheduler.service.js";
import type { SubscriptionFailure } from "./SubscriptionTimers.service.js";
export const SUBSCRIPTION_PROFILE_DESKTOP_ONLY_ERROR = "SUBSCRIPTION_PROFILE_DESKTOP_ONLY";
const observable = (error: unknown): unknown => {
  if (S.is(HostFailure)(error) || S.is(FeedTraversalFailure)(error) || S.is(FeedParseFailure)(error))
    return error.original;
  if (S.is(FeedCancelled)(error)) return error.reason;
  return error;
};
const failedMessage = (error: unknown): string => {
  const value = observable(error);
  return value instanceof Error ? value.message : String(value);
};
const attempt = <A>(read: () => A) =>
  Effect.try({
    try: read,
    catch: (original) =>
      HostFailure.make({ original, legacyMessage: original instanceof Error ? original.message : String(original) }),
  });
const missing = (id: string) => SubscriptionNotFound.make({ id, legacyMessage: `Subscription not found: ${id}` });
const validateCategories = Effect.fnUntraced(function* (platform: string, categories: string[]) {
  if (!isProfilePlatform(platform)) return [];
  const offered: readonly string[] = PROFILE_SUBSCRIPTION_CATEGORIES[platform];
  const picked = A.filter(offered, (category) => categories.includes(category));
  if (picked.length === 0)
    return yield* InvalidCategories.make({ legacyMessage: "Choose at least one category to follow." });
  return picked;
});
export const layer = (schedulerOptions: SchedulerOptions = {}) =>
  Layer.effect(
    Subscriptions,
    Effect.gen(function* () {
      const methods = yield* Effect.serviceOption(SubscriptionMethodDispatch);
      const store = yield* SubscriptionStore;
      const election = yield* SubscriptionLeader;
      const queue = yield* SubscriptionQueue;
      const feed = yield* SubscriptionFeed;
      const profile = yield* ProfileFeed;
      const cancellation = yield* CheckCancellation;
      const timers = yield* SubscriptionTimers;
      const entropy = yield* SubscriptionEntropy;
      const events = yield* SubscriptionEvents;
      const dispatch = yield* SubscriptionDispatch;
      const log = yield* SubscriptionLog;
      const policy = yield* SubscriptionPolicy;
      const timing = yield* LegacyTiming;
      const scope = yield* Effect.scope;
      const inFlight = MutableHashMap.empty<
        string,
        { readonly completion: Deferred.Deferred<void, SubscriptionFailure>; visible: boolean; completed: boolean }
      >();
      const controllers = MutableHashMap.empty<string, CheckToken>();
      const pendingIds = MutableHashSet.empty<string>();
      let pendingOrder: string[] = [];
      let flushScheduled = false;
      const changed = events.emit({ kind: "changed" });
      const warn = (message: string, metadata: Record<string, unknown>, error: unknown) =>
        log.write("warn", message, { ...metadata, err: observable(error) });
      const planNext = Effect.fnUntraced(function* (sub: F.StoredSubscriptionRule, now: number, retryAfter?: number) {
        if (retryAfter !== undefined && retryAfter > now) return retryAfter;
        const interval = sub.checkIntervalMs ?? DEFAULT_FEED_CHECK_INTERVAL_MS;
        const random = yield* entropy.next;
        return Math.round(now + interval + (random * 2 - 1) * 0.1 * interval);
      });
      const releaseRemovedTasks = Effect.fnUntraced(function* (ids: readonly string[]) {
        const released = yield* store.clearQueueLinks({ taskIds: ids });
        if (released > 0) {
          yield* log.write("info", "subscriptions: cleared queue links for removed tasks", { released });
          yield* changed;
        }
        return released;
      });
      const reconcile = Effect.gen(function* () {
        if (!queue.taskLookupAvailable) return 0;
        const released = yield* store.clearOrphanedQueueLinks(queue.taskExists);
        if (released > 0) {
          yield* log.write("info", "subscriptions: reconciled orphaned queue links", { released });
          yield* changed;
        }
        return released;
      });
      const mark = Effect.fnUntraced(function* (subscriptionId: string, itemId: unknown, taskId: string | null) {
        if (Boolean(taskId)) {
          const id = yield* S.decodeUnknownEffect(S.String)(itemId).pipe(
            Effect.mapError((original) => FeedTraversalFailure.make({ original, legacyMessage: original.message }))
          );
          yield* store.markItemQueued(subscriptionId, id, taskId);
        }
      });
      const checkProfile = Effect.fnUntraced(function* (sub: F.StoredSubscriptionWithItems) {
        if (!profile.available) return;
        const token = yield* cancellation.make;
        MutableHashMap.set(controllers, sub.id, token);
        const startedAt = yield* timers.now;
        yield* store.update(sub.id, { status: "checking", lastCheckedAt: startedAt, lastError: undefined });
        yield* changed;
        const body = Effect.gen(function* () {
          const result = yield* profile.fetch(sub, token);
          const current = yield* store.get(sub.id);
          if (current === null || (yield* token.aborted)) return false;
          const decision = yield* policy.profile({ subscription: current, knownItems: current.items, result });
          yield* store.mergeItems(sub.id, decision.itemsToPersist);
          const fetchedTitle = yield* attempt(() => {
            const title = result.title === undefined || result.title === null ? undefined : Str.trim(result.title);
            return Boolean(title) && (!Boolean(Str.trim(current.title)) || current.title === current.sourceUrl)
              ? title
              : undefined;
          });
          const batch = { id: `subscription_${sub.id}_${startedAt}`, title: fetchedTitle ?? current.title };
          for (const item of decision.items) {
            yield* Effect.gen(function* () {
              const taskId = yield* queue.enqueue({ subscription: current, item, trigger: "auto", batch });
              yield* mark(sub.id, item.id, taskId);
            }).pipe(
              Effect.catch((error) =>
                warn("subscriptions: enqueueItem failed", { subscriptionId: sub.id, itemId: item.id }, error)
              )
            );
          }
          const status = yield* attempt(() => {
            let worst: M.ProfileCategoryError | undefined;
            const severity = { "rate-limited": 3, "auth-required": 2, error: 1 };
            for (const category of current.categories) {
              const error = result.categoryErrors[category];
              if (
                error !== undefined &&
                Boolean(error) &&
                (worst === undefined || !Boolean(worst) || severity[error] > severity[worst])
              )
                worst = error;
            }
            return worst === "rate-limited" || worst === "auth-required"
              ? worst
              : worst === "error"
                ? "failed"
                : "up-to-date";
          });
          const finishedAt = yield* timers.now;
          const patch: F.StoredSubscriptionPatch = {
            status,
            lastError: status === "up-to-date" ? undefined : (result.error ?? status),
            nextCheckAt: yield* planNext(current, finishedAt, result.retryAfter),
          };
          if (status === "up-to-date") patch.lastSuccessAt = finishedAt;
          if (decision.latest !== undefined) {
            patch.latestVideoTitle = decision.latest.title;
            patch.latestVideoPublishedAt = decision.latest.publishedAt;
          }
          if (Boolean(result.avatarUrl)) patch.coverUrl = result.avatarUrl;
          if (Boolean(fetchedTitle)) patch.title = fetchedTitle;
          yield* store.update(sub.id, patch);
          return true;
        }).pipe(
          Effect.catch(
            Effect.fnUntraced(function* (error) {
              yield* warn("subscriptions: profile check failed", { id: sub.id }, error);
              if ((yield* store.get(sub.id)) !== null) {
                const failedAt = yield* timers.now;
                yield* store.update(sub.id, {
                  status: "failed",
                  lastError: failedMessage(error),
                  lastCheckedAt: failedAt,
                  nextCheckAt: yield* planNext(sub, failedAt),
                });
              }
              return true;
            })
          )
        );
        const cleanup = Effect.sync(() => {
          if (O.getOrUndefined(MutableHashMap.get(controllers, sub.id)) === token)
            MutableHashMap.remove(controllers, sub.id);
        });
        const completed = yield* withLegacyFinally(body, cleanup);
        if (completed) yield* changed;
      });
      const checkSubscription = Effect.fnUntraced(function* (id: string) {
        const sub = yield* store.get(id);
        if (sub === null) return;
        if (sub.sourceKind === "profile") {
          yield* checkProfile(sub).pipe(withLegacyFinally(timing.turn("api:checkSubscription:checkProfile")));
          return;
        }
        const startedAt = yield* timers.now;
        yield* store.update(id, { status: "checking", lastCheckedAt: startedAt, lastError: undefined });
        yield* Effect.gen(function* () {
          const parsed = yield* feed.fetch(sub.feedUrl);
          const decision = yield* policy.rss({ subscription: sub, knownItems: sub.items, feed: parsed });
          yield* store.replaceItems(id, decision.feedItemsToPersist);
          const seen: unknown[] = [];
          const queueable: F.InterpretedFeedItem[] = [];
          for (const item of decision.items) {
            if (
              A.some(
                seen,
                (value) =>
                  value === item.id ||
                  (typeof value === "number" &&
                    typeof item.id === "number" &&
                    Number.isNaN(value) &&
                    Number.isNaN(item.id))
              )
            )
              continue;
            seen.push(item.id);
            if (!(yield* queue.historyContains(item.url))) queueable.push(item);
          }
          for (const item of queueable)
            yield* Effect.gen(function* () {
              const taskId = yield* queue.enqueue({ subscription: sub, item, trigger: "auto" });
              yield* mark(id, item.id, taskId);
            }).pipe(
              Effect.catch((error) =>
                warn("subscriptions: enqueueItem failed", { subscriptionId: id, itemId: item.id }, error)
              )
            );
          const patch: F.InterpretedFeedPatch = {
            status: "up-to-date",
            lastSuccessAt: yield* timers.now,
            lastError: undefined,
          };
          if (Boolean(decision.latestVideoTitle)) patch.latestVideoTitle = decision.latestVideoTitle;
          if (decision.latestPublishedAt !== null) patch.latestVideoPublishedAt = decision.latestPublishedAt;
          if (Boolean(decision.coverUrl)) patch.coverUrl = decision.coverUrl;
          const current = yield* store.get(id);
          yield* attempt(() => {
            const placeholder =
              current !== null &&
              (!Boolean(Str.trim(current.title)) ||
                current.title === current.sourceUrl ||
                current.title === current.feedUrl);
            if (placeholder && typeof parsed.title === "string" && Boolean(Str.trim(parsed.title)))
              patch.title = Str.trim(parsed.title);
            if (typeof parsed.link === "string" && Boolean(Str.trim(parsed.link)))
              patch.sourceUrl = Str.trim(parsed.link);
          });
          yield* store.update(id, patch);
        }).pipe(
          Effect.catch(
            Effect.fnUntraced(function* (error) {
              yield* warn("subscriptions: feed-check failed", { id }, error);
              yield* store.update(id, {
                status: "failed",
                lastError: failedMessage(error),
                lastCheckedAt: yield* timers.now,
              });
            })
          )
        );
        yield* changed;
      });
      const refreshOne = Effect.fnUntraced(function* (id: string) {
        const existing = O.getOrUndefined(MutableHashMap.get(inFlight, id));
        if (existing !== undefined && existing.visible) {
          yield* Deferred.await(existing.completion).pipe(
            withLegacyFinally(
              Effect.gen(function* () {
                yield* timing.turn("api:refreshOne:adopt-existing");
                yield* timing.turn("api:refreshOne:adopt-existing:resolution");
                yield* timing.turn("api:refreshOne:adopt-existing:reaction");
              })
            )
          );
          return;
        }
        const completion = yield* Deferred.make<void, SubscriptionFailure>();
        const registration = { completion, visible: false, completed: false };
        // Register before forking, but expose deduplication only after the old
        // synchronous store prefix. A reentrant get callback can start its own
        // attempt exactly as it could before the async check first returned.
        MutableHashMap.set(inFlight, id, registration);
        const checked = withLegacyFinally(
          checkSubscription(id),
          Effect.gen(function* () {
            yield* timing.turn("api:refreshOne:finally");
            registration.completed = true;
            MutableHashMap.remove(inFlight, id);
          })
        );
        yield* checked.pipe(
          Effect.onExit((exit) => Deferred.done(completion, exit)),
          Effect.forkIn(scope, { startImmediately: true })
        );
        registration.visible = true;
        if (!registration.completed) MutableHashMap.set(inFlight, id, registration);
        yield* Deferred.await(completion).pipe(
          withLegacyFinally(
            Effect.gen(function* () {
              yield* timing.turn("api:refreshOne:adopt-new");
              yield* timing.turn("api:refreshOne:adopt-new:resolution");
              yield* timing.turn("api:refreshOne:adopt-new:reaction");
            })
          )
        );
      });
      const refreshAll = Effect.fnUntraced(function* (options: { force?: boolean | undefined } = {}) {
        const all = yield* store.list;
        const leader = options.force === true || (yield* election.isLeader);
        for (const sub of all) {
          if (!(sub.enabled && (sub.sourceKind === "profile" ? profile.configured : leader))) continue;
          const force = Boolean(options.force);
          if (!force) {
            const now = yield* timers.now;
            const due =
              sub.enabled &&
              (sub.nextCheckAt !== undefined
                ? now >= sub.nextCheckAt
                : sub.lastCheckedAt === undefined ||
                  now - sub.lastCheckedAt >= (sub.checkIntervalMs ?? DEFAULT_FEED_CHECK_INTERVAL_MS));
            if (!due) continue;
          }
          yield* (
            O.isSome(methods) && methods.value.refreshOne !== undefined
              ? methods.value.refreshOne(sub.id, refreshOne(sub.id))
              : refreshOne(sub.id)
          ).pipe(
            withLegacyFinally(timing.turn("api:refreshAll:refreshOne")),
            Effect.catch((error) => warn("subscriptions: refreshOne failed", { id: sub.id }, error))
          );
        }
      });
      const callRefreshOne = (id: string) =>
        O.isSome(methods) && methods.value.refreshOne !== undefined
          ? methods.value.refreshOne(id, refreshOne(id))
          : refreshOne(id);
      const callRefreshAll = Effect.suspend(() =>
        O.isSome(methods) && methods.value.refreshAll !== undefined
          ? methods.value.refreshAll(refreshAll())
          : refreshAll()
      );
      const callReconcile = Effect.suspend(() =>
        O.isSome(methods) && methods.value.reconcileOrphanedTasks !== undefined
          ? methods.value.reconcileOrphanedTasks(reconcile)
          : reconcile
      );
      const callRelease = (ids: readonly string[]) =>
        O.isSome(methods) && methods.value.releaseRemovedTasks !== undefined
          ? methods.value.releaseRemovedTasks(ids, releaseRemovedTasks(ids))
          : releaseRemovedTasks(ids);
      const schedulerSettingsOption = yield* Effect.serviceOption(SubscriptionSchedulerSettings);
      const schedulerSettingsLayer = O.isSome(schedulerSettingsOption)
        ? Layer.succeed(SubscriptionSchedulerSettings, schedulerSettingsOption.value)
        : Layer.empty;
      const schedulerHostOption = yield* Effect.serviceOption(SubscriptionSchedulerHost);
      const schedulerHost = O.getOrUndefined(schedulerHostOption);
      const schedulerContext = yield* Layer.build(
        schedulerLayer({ intervalMs: DEFAULT_SCHEDULER_TICK_MS, ...schedulerOptions }).pipe(
          Layer.provide(
            Layer.mergeAll(
              schedulerSettingsLayer,
              Layer.succeed(
                SchedulerWork,
                SchedulerWork.of({
                  runAll: callRefreshAll.pipe(withLegacyFinally(timing.turn("api:scheduler:runAll"))),
                  runOne: Effect.fnUntraced(function* (id) {
                    yield* callRefreshOne(id).pipe(withLegacyFinally(timing.turn("api:scheduler:runOne")));
                  }),
                  isLeader: Effect.succeed(true),
                })
              ),
              Layer.succeed(SubscriptionTimers, schedulerHost?.timers ?? timers),
              Layer.succeed(SubscriptionLog, schedulerHost?.log ?? log)
            )
          )
        )
      );
      const scheduler = Context.get(schedulerContext, SubscriptionScheduler);
      return Subscriptions.of({
        start: Effect.gen(function* () {
          yield* election.tryAcquire.pipe(withLegacyFinally(timing.turn("api:start:tryAcquire")));
          yield* callReconcile.pipe(
            withLegacyFinally(timing.turn("api:start:reconcile")),
            Effect.catch((error) => warn("subscriptions: failed to reconcile orphaned queue links", {}, error))
          );
          yield* scheduler.start();
        }),
        stop: Effect.gen(function* () {
          yield* scheduler.stop;
          yield* election.release.pipe(withLegacyFinally(timing.turn("api:stop:release")));
        }),
        isLeader: election.isLeader,
        observeLeader: Effect.gen(function* () {
          const state = yield* election.observe.pipe(withLegacyFinally(timing.turn("api:observeLeader:adopt")));
          return state;
        }),
        resolve: Effect.fnUntraced(function* (input) {
          return yield* attempt(() => resolveFeedFromInput(input.rawUrl));
        }),
        list: Effect.gen(function* () {
          const items = yield* store.list;
          return { items, total: items.length };
        }),
        get: Effect.fnUntraced(function* (input) {
          const sub = yield* store.get(input.id);
          if (sub === null) return yield* missing(input.id);
          return sub;
        }),
        add: Effect.fnUntraced(function* (input) {
          const platform = input.platform;
          input = isProfilePlatform(platform)
            ? {
                ...input,
                sourceKind: "profile",
                categories: yield* validateCategories(
                  platform,
                  input.categories ?? [...PROFILE_SUBSCRIPTION_CATEGORIES[platform]]
                ),
                onlyDownloadLatest: false,
                keywords: [],
              }
            : { ...input, sourceKind: "feed", categories: [] };
          if (input.sourceKind === "profile" && !profile.available)
            return yield* ProfileHostRequired.make({ legacyMessage: SUBSCRIPTION_PROFILE_DESKTOP_ONLY_ERROR });
          const duplicate = yield* store.findDuplicateFeed(input.feedUrl);
          if (duplicate !== null && Boolean(duplicate))
            return yield* DuplicateFeed.make({
              duplicateOf: duplicate,
              legacyMessage: SUBSCRIPTION_DUPLICATE_FEED_ERROR,
            });
          const created = yield* store.add(input);
          yield* changed;
          return created;
        }),
        update: Effect.fnUntraced(
          function* (input) {
            const { id, ...patch } = input;
            if (patch.feedUrl !== undefined && Boolean(patch.feedUrl)) {
              const duplicate = yield* store.findDuplicateFeed(patch.feedUrl, id);
              if (duplicate !== null && Boolean(duplicate))
                return yield* DuplicateFeed.make({
                  duplicateOf: duplicate,
                  legacyMessage: SUBSCRIPTION_DUPLICATE_FEED_ERROR,
                });
            }
            const existing = yield* store.get(id);
            if (existing === null) return yield* missing(id);
            if (patch.categories !== undefined && Boolean(patch.categories))
              patch.categories = yield* validateCategories(existing.platform, patch.categories);
            const { checkIntervalMs, ...rest } = patch;
            const update: F.StoredSubscriptionPatch = rest;
            if (checkIntervalMs !== undefined) update.checkIntervalMs = checkIntervalMs ?? undefined;
            if (checkIntervalMs !== undefined || Boolean(patch.categories) || patch.enabled === true)
              update.nextCheckAt = undefined;
            const next = yield* store.update(id, update);
            if (next === null) return yield* missing(id);
            yield* changed;
            return next;
          },
          Effect.catchDefect((original) =>
            Effect.fail(
              HostFailure.make({
                original,
                legacyMessage: original instanceof Error ? original.message : String(original),
              })
            )
          )
        ),
        remove: Effect.fnUntraced(function* (input) {
          const token = O.getOrUndefined(MutableHashMap.get(controllers, input.id));
          if (token !== undefined) yield* token.cancel;
          yield* store.remove(input.id);
          yield* changed;
          return {};
        }),
        refresh: Effect.fnUntraced(function* (input) {
          yield* scheduler.triggerNow(input.id).pipe(withLegacyFinally(timing.turn("api:refresh:triggerNow")));
          const sub = yield* store.get(input.id);
          if (sub === null) return yield* missing(input.id);
          return sub;
        }),
        itemsList: Effect.fnUntraced(function* (input) {
          const sub = yield* store.get(input.subscriptionId);
          if (sub === null) return yield* missing(input.subscriptionId);
          const offset = input.offset ?? 0;
          const limit = input.limit ?? sub.items.length;
          return { items: sub.items.slice(offset, offset + limit), total: sub.items.length };
        }),
        itemsQueue: Effect.fnUntraced(function* (input, creation) {
          const sub = yield* store.get(input.subscriptionId);
          if (sub === null) return yield* missing(input.subscriptionId);
          const item = O.getOrUndefined(A.findFirst(sub.items, (entry) => entry.id === input.itemId));
          if (item === undefined) return { queued: false, taskId: null };
          if (item.addedToQueue) {
            const taskId = item.taskId;
            let live = false;
            if (taskId !== undefined && Boolean(taskId)) {
              live = yield* queue
                .taskExists(taskId)
                .pipe(withLegacyFinally(timing.turn("api:itemsQueue:linkedTaskStillExists")));
            }
            if (live || !queue.taskLookupAvailable) return { queued: false, taskId: taskId ?? null };
            yield* store.clearQueueLinks({ items: [{ subscriptionId: input.subscriptionId, itemId: input.itemId }] });
          }
          const normalized: M.NormalizedFeedItem = {
            id: item.id,
            url: item.url,
            title: item.title,
            publishedAt: item.publishedAt,
          };
          if (Boolean(item.thumbnail)) normalized.thumbnail = item.thumbnail;
          const taskId = yield* queue.enqueue({
            subscription: sub,
            item: normalized,
            trigger: "manual",
            ...(Boolean(creation) ? { creation } : {}),
          });
          yield* mark(input.subscriptionId, input.itemId, taskId);
          yield* changed;
          return { queued: taskId !== null, taskId };
        }),
        releaseRemovedTasks,
        reconcileOrphanedTasks: reconcile,
        refreshAll,
        refreshOne,
        noteTaskRemoved: Effect.fnUntraced(function* (taskId) {
          const id = yield* attempt(() => Str.trim(taskId));
          if (!Boolean(id)) return;
          if (!MutableHashSet.has(pendingIds, id)) {
            MutableHashSet.add(pendingIds, id);
            pendingOrder.push(id);
          }
          if (flushScheduled) return;
          flushScheduled = true;
          const flush = Effect.gen(function* () {
            yield* timing.turn("api:task-removal-batch");
            const ids = pendingOrder;
            pendingOrder = [];
            MutableHashSet.clear(pendingIds);
            flushScheduled = false;
            yield* callRelease(ids).pipe(
              withLegacyFinally(timing.turn("api:removalFlush:releaseRemovedTasks")),
              Effect.catch((error) => warn("subscriptions: failed to release removed tasks", {}, error))
            );
          });
          yield* dispatch.detach(flush);
        }),
        on: events.subscribe,
      });
    })
  );
