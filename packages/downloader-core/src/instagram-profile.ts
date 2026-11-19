import { sha256 } from "@vidbee/task-queue/util/sha256";
import * as A from "effect/Array";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as HashMap from "effect/HashMap";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as S from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Str from "effect/String";
import { BoundaryDecodeError, HostFailure, InvalidDownload } from "./Downloader.errors.js";
import { DownloadFiles } from "./DownloadFiles.service.js";
import { DownloadHost } from "./DownloadHost.service.js";
import { DownloadTiming } from "./DownloadTiming.service.js";
import { buildGalleryDlRuntimeArgs } from "./gallery-runtime-args.js";
import {
  buildInstagramCategoryUrl,
  galleryItems,
  DataFirst as InstagramScanServiceFunctions,
  readString,
  resolveUserRecord,
  runGalleryJson,
} from "./InstagramScan.service.js";
import { INSTAGRAM_PROFILE_CATEGORIES, normalizeInstagramProfileUrl } from "./instagram-url.js";
import { InstagramInventory } from "./ProfilePersistence.model.js";
import type { InstagramInspectionKeys } from "./DownloadLiterals.model.js";
import type { GalleryDlProfileMapRuntime } from "./gallery-dl-json-run.js";
import type {
  DownloadRuntimeSettings,
  InstagramCategorySummary,
  InstagramProfileCategory,
  InstagramProfileInspection,
  InstagramProfileItem,
} from "./types.js";

export { INSTAGRAM_GALLERY_DL_EXTRACTOR_ARGS } from "./InstagramScan.service.js";
export {
  buildGalleryDlRuntimeArgs,
  buildInstagramCategoryUrl,
  INSTAGRAM_PROFILE_CATEGORIES,
  normalizeInstagramProfileUrl,
};
export const INSTAGRAM_RATE_LIMIT_COOLDOWN_MS = 15 * 60 * 1000;
export const instagramInspectionId = (username: string): string => `instagram_${sha256(Str.toLowerCase(username))}`;
export interface InspectionCacheEntry {
  categoryUrls: Record<InstagramProfileCategory, string>;
  inspection: InstagramProfileInspection;
}
export type InstagramInspectionListEntry = Pick<InstagramProfileInspection, typeof InstagramInspectionKeys.Type>;
export interface InstagramProfileInspectorOptions {
  readonly admission?: GalleryDlProfileMapRuntime["admission"];
  readonly clock: () => number;
  readonly completedDownloads?: (() => { url: string; category: string; assetCount: number }[]) | undefined;
  readonly maxCacheEntries?: number | undefined;
  readonly resolveBinaryPath: () => string;
  readonly resolveExtraArgs?: ((settings?: DownloadRuntimeSettings) => readonly string[]) | undefined;
  readonly storageDir?: string | undefined;
}
type InspectionError = HostFailure | BoundaryDecodeError | InvalidDownload;
export interface InspectionRequest {
  readonly key: string;
  readonly result: Effect.Effect<InstagramProfileInspection, InspectionError>;
  readonly snapshot: (
    inspection: InstagramProfileInspection
  ) => Effect.Effect<InstagramProfileInspection, InspectionError>;
}
export class InstagramProfileInspector extends Context.Service<
  InstagramProfileInspector,
  {
    readonly get: (id: string) => Effect.Effect<InspectionCacheEntry | null, InspectionError>;
    readonly list: Effect.Effect<InstagramInspectionListEntry[], InspectionError>;
    readonly inspect: (
      url: string,
      settings?: DownloadRuntimeSettings,
      categories?: readonly InstagramProfileCategory[]
    ) => Effect.Effect<InstagramProfileInspection, InspectionError>;
    readonly request: (
      url: string,
      settings?: DownloadRuntimeSettings,
      categories?: readonly InstagramProfileCategory[]
    ) => Effect.Effect<InspectionRequest, InspectionError>;
    readonly cancel: (url: string) => Effect.Effect<boolean, InvalidDownload>;
    readonly stop: Effect.Effect<void>;
  }
>()("@vidbee/downloader-core/instagram-profile/InstagramProfileInspector") {}
const categoryUrlsFor = (username: string): Record<InstagramProfileCategory, string> => ({
  posts: InstagramScanServiceFunctions.buildInstagramCategoryUrl(username, "posts"),
  reels: InstagramScanServiceFunctions.buildInstagramCategoryUrl(username, "reels"),
  stories: InstagramScanServiceFunctions.buildInstagramCategoryUrl(username, "stories"),
  highlights: InstagramScanServiceFunctions.buildInstagramCategoryUrl(username, "highlights"),
  tagged: InstagramScanServiceFunctions.buildInstagramCategoryUrl(username, "tagged"),
});
const missing = (failure: HostFailure): boolean => {
  const cause = failure.cause;
  if (typeof cause !== "object" || cause === null) return false;
  if ("code" in cause && cause.code === "ENOENT") return true;
  if (!("reason" in cause) || typeof cause.reason !== "object" || cause.reason === null) return false;
  return "reason" in cause.reason && cause.reason.reason === "NotFound";
};
const unavailable = () =>
  HostFailure.make({
    operation: "instagram.read",
    legacyMessage: "Saved Instagram profile could not be read. Restore its backup before rescanning.",
  });
const normalize = (url: string) => {
  const normalized = normalizeInstagramProfileUrl(url);
  return normalized === null
    ? Effect.fail(
        InvalidDownload.make({ operation: "instagram.url", legacyMessage: "Enter a valid Instagram profile URL." })
      )
    : Effect.succeed(normalized);
};
const orderedMerge = (
  previous: InstagramProfileItem[],
  fresh: InstagramProfileItem[],
  cancelled: boolean
): InstagramProfileItem[] => {
  let items = HashMap.fromIterable(A.map(previous, (item) => [item.id, item] as const));
  const order = A.map(previous, (item) => item.id);
  for (const item of fresh) {
    const prior = Option.getOrUndefined(HashMap.get(items, item.id));
    if (cancelled && prior !== undefined && prior.assetCount > item.assetCount) continue;
    const previousIds = prior?.assetIds;
    let sameMedia = prior?.assetCount === item.assetCount;
    if (previousIds !== undefined && previousIds.length > 0) {
      const compare = (a: string, b: string): -1 | 0 | 1 => (a < b ? -1 : a > b ? 1 : 0);
      const left = A.sort(previousIds, compare);
      const right = A.sort(item.assetIds ?? [], compare);
      sameMedia = left.length === right.length && A.every(left, (id, index) => right[index] === id);
    }
    if (!HashMap.has(items, item.id)) order.push(item.id);
    items = HashMap.set(items, item.id, { ...item, downloaded: sameMedia && prior?.downloaded });
  }
  return A.map(order, (id) => HashMap.getUnsafe(items, id));
};
/** One inspector owns ordered caches, shared requests and its scan continuation scope. */
export const instagramProfileInspectorLayer = (options: InstagramProfileInspectorOptions) =>
  Layer.effect(
    InstagramProfileInspector,
    Effect.gen(function* () {
      const files = yield* DownloadFiles;
      const host = yield* DownloadHost;
      const path = yield* Path.Path;
      const timing = yield* DownloadTiming;
      const scope = yield* Scope.Scope;
      const dependencies = yield* Effect.context<
        | DownloadFiles
        | DownloadHost
        | Path.Path
        | DownloadTiming
        | import("./DownloadProcess.service.js").DownloadProcess
      >();
      let cache = HashMap.empty<string, InspectionCacheEntry>();
      let cacheOrder: string[] = [];
      const controllers: {
        controller: AbortController;
        url: string;
        mapping: NonNullable<InstagramProfileInspection["mapping"]>;
      }[] = [];
      let pending = HashMap.empty<string, Deferred.Deferred<InstagramProfileInspection, InspectionError>>();
      let tail: Effect.Effect<void> = Effect.void;
      let rateLimitedUntil = 0;
      const put = (id: string, entry: InspectionCacheEntry): void => {
        if (!HashMap.has(cache, id)) cacheOrder.push(id);
        cache = HashMap.set(cache, id, entry);
      };
      const remove = (id: string): void => {
        cache = HashMap.remove(cache, id);
        cacheOrder = A.filter(cacheOrder, (key) => key !== id);
      };
      const save = Effect.fn("InstagramInspector.save")(function* (entry: InspectionCacheEntry) {
        put(entry.inspection.inspectionId, entry);
        const hasStorageDir = Boolean(options.storageDir);
        if (!hasStorageDir || options.storageDir === undefined) return;
        yield* files.makeDirectory(options.storageDir, true, 0o700);
        const target = path.join(options.storageDir, `${entry.inspection.inspectionId}.json`);
        const temporary = `${target}.${host.uuid()}.tmp`;
        const text = yield* S.encodeEffect(S.fromJsonString(S.Unknown))(entry.inspection).pipe(
          Effect.mapError((cause) =>
            BoundaryDecodeError.make({ operation: "instagram.save", legacyMessage: cause.message, cause })
          )
        );
        yield* files.write(temporary, text, 0o600);
        yield* files.rename(temporary, target);
      });
      const get = Effect.fn("InstagramInspector.get")(function* (id: string) {
        let entry = Option.getOrUndefined(HashMap.get(cache, id));
        const hasStorageDir = Boolean(options.storageDir);
        if (
          entry === undefined &&
          hasStorageDir &&
          options.storageDir !== undefined &&
          /^instagram_[a-f0-9]{64}$/.test(id)
        ) {
          const inspection = yield* files.read(path.join(options.storageDir, `${id}.json`)).pipe(
            Effect.flatMap((text) =>
              S.decodeEffect(S.fromJsonString(InstagramInventory))(text).pipe(Effect.mapError(() => unavailable()))
            ),
            Effect.catch((failure) => (missing(failure) ? Effect.undefined : Effect.fail(unavailable())))
          );
          if (inspection !== undefined) {
            entry = { inspection, categoryUrls: categoryUrlsFor(inspection.profile.username) };
            put(id, entry);
          }
        }
        if (entry === undefined) return null;
        if (entry.inspection.expiresAt <= options.clock()) {
          remove(id);
          return null;
        }
        return entry;
      });
      const withMapping = Effect.fn("InstagramInspector.snapshot")(function* (inspection: InstagramProfileInspection) {
        const completed = options.completedDownloads?.() ?? [];
        let changed = false;
        for (const category of inspection.categories)
          for (const item of category.items ?? []) {
            if (
              item.downloaded !== true &&
              A.some(
                completed,
                (task): boolean =>
                  task.url === item.url && task.category === category.category && task.assetCount === item.assetCount
              )
            ) {
              item.downloaded = true;
              changed = true;
            }
          }
        if (changed) {
          const entry = HashMap.get(cache, inspection.inspectionId);
          if (Option.isSome(entry)) yield* save(entry.value);
        }
        const snapshot = structuredClone(inspection);
        snapshot.mapping = undefined;
        for (const state of controllers) {
          if (state.controller.signal.aborted || state.url !== inspection.profile.profileUrl) continue;
          snapshot.mapping = { ...state.mapping };
          if (state.mapping.state === "running") break;
        }
        return snapshot;
      });
      const list = Effect.fn("InstagramInspector.list")(function* () {
        const ids = [...cacheOrder];
        const hasStorageDir = Boolean(options.storageDir);
        if (hasStorageDir && options.storageDir !== undefined) {
          const names = yield* files
            .readDirectory(options.storageDir)
            .pipe(Effect.catchIf(missing, () => Effect.succeed([])));
          for (const name of names)
            if (/^instagram_[a-f0-9]{64}\.json$/.test(name)) {
              const id = Str.slice(0, -5)(name);
              if (!A.contains(ids, id)) ids.push(id);
            }
        }
        const profiles: InstagramInspectionListEntry[] = [];
        for (const id of ids) {
          const entry = yield* get(id);
          if (entry === null) continue;
          const snapshot = yield* withMapping(entry.inspection);
          const { inspectionId, profile, totalSourceCount, totalAssetCount } = entry.inspection;
          profiles.push({
            inspectionId,
            profile: { ...profile },
            totalSourceCount,
            totalAssetCount,
            mapping: snapshot.mapping,
          });
        }
        return A.sort(profiles, (a: InstagramInspectionListEntry, b: InstagramInspectionListEntry) =>
          Str.localeCompare(b.profile.username)(a.profile.username)
        );
      });
      const scan = Effect.fn("InstagramInspector.scan")(function* (
        url: string,
        settings?: DownloadRuntimeSettings,
        requestedCategories?: readonly InstagramProfileCategory[],
        signal?: AbortSignal,
        mapping?: NonNullable<InstagramProfileInspection["mapping"]>
      ) {
        const normalized = yield* normalize(url);
        const id = instagramInspectionId(normalized.username);
        const cached = yield* get(id);
        const categoryUrls = categoryUrlsFor(normalized.username);
        const inspection: InstagramProfileInspection = cached?.inspection ?? {
          inspectionId: id,
          expiresAt: Number.MAX_SAFE_INTEGER,
          complete: false,
          profile: { username: normalized.username, profileUrl: normalized.profileUrl },
          categories: A.map(INSTAGRAM_PROFILE_CATEGORIES, (category) => ({
            category,
            state: "unscanned",
            sourceCount: 0,
            assetCount: 0,
            items: [],
          })),
          totalSourceCount: 0,
          totalAssetCount: 0,
        };
        const selected = requestedCategories ?? INSTAGRAM_PROFILE_CATEGORIES;
        if (cached === null) yield* save({ inspection, categoryUrls });
        if (selected.length === 0 || (signal?.aborted ?? false)) return yield* withMapping(inspection);
        const binaryPath = options.resolveBinaryPath();
        const extraArgs =
          options.resolveExtraArgs?.(settings) ??
          (yield* buildGalleryDlRuntimeArgs(settings).pipe(Effect.provide(dependencies)));
        for (const category of selected) {
          if (signal?.aborted ?? false) break;
          if (!A.contains(INSTAGRAM_PROFILE_CATEGORIES, category))
            return yield* InvalidDownload.make({
              operation: "instagram.scan",
              legacyMessage: "Unsupported Instagram category.",
            });
          const previous = Option.getOrUndefined(
            A.findFirst(inspection.categories, (entry) => entry.category === category)
          );
          const incremental =
            previous?.incremental === true || previous?.state === "ready" || previous?.state === "empty";
          let summary: InstagramCategorySummary;
          if (rateLimitedUntil > options.clock())
            summary = {
              ...previous,
              category,
              incremental,
              state: "unavailable",
              errorCode: "rate-limited",
              retryAfter: rateLimitedUntil,
              sourceCount: previous?.sourceCount ?? 0,
              assetCount: previous?.assetCount ?? 0,
            };
          else {
            const attempt = Effect.fn("InstagramInspector.category")(function* () {
              const hasStorageDir = Boolean(options.storageDir);
              const categoryArgs = [
                ...extraArgs,
                "-o",
                `extractor.instagram.vidbee-inspection-category=${category}`,
                ...(hasStorageDir && options.storageDir !== undefined
                  ? ["-o", `extractor.instagram.vidbee-known-profile=${path.join(options.storageDir, `${id}.json`)}`]
                  : []),
              ];
              if (mapping !== undefined) {
                mapping.category = category;
                mapping.state = "queued";
              }
              const release =
                options.admission === undefined ? Effect.void : yield* options.admission.acquire(url, signal);
              if (release === undefined || (signal?.aborted ?? false)) {
                if (release !== undefined) yield* release;
                return undefined;
              }
              if (mapping !== undefined) mapping.state = "running";
              const result = yield* runGalleryJson(
                binaryPath,
                categoryUrls[category],
                categoryArgs,
                true,
                signal,
                Effect.fn("InstagramInspector.checkpoint")(function* (progress) {
                  const priorItems = previous?.items ?? [];
                  let discovered = HashMap.fromIterable(A.map(priorItems, (item) => [item.id, item] as const));
                  const order = A.map(priorItems, (item) => item.id);
                  for (const item of galleryItems(progress)) {
                    const itemId = `${category}:${item.id}`;
                    const prior = Option.getOrUndefined(HashMap.get(discovered, itemId));
                    if (prior === undefined || item.assetCount >= prior.assetCount) {
                      if (!HashMap.has(discovered, itemId)) order.push(itemId);
                      discovered = HashMap.set(discovered, itemId, { ...item, id: itemId });
                    }
                  }
                  const items = A.map(order, (key) => HashMap.getUnsafe(discovered, key));
                  const partial: InstagramCategorySummary = {
                    category,
                    incremental,
                    state: "cancelled",
                    items,
                    cursor: progress.cursor ?? previous?.cursor,
                    sourceCount: items.length,
                    assetCount: A.reduce(items, 0, (total, item) => total + item.assetCount),
                    mappedAt: options.clock(),
                  };
                  inspection.categories = A.map(inspection.categories, (entry) =>
                    entry.category === category ? partial : entry
                  );
                  inspection.complete = false;
                  inspection.totalSourceCount = A.reduce(
                    inspection.categories,
                    0,
                    (total, entry) => total + entry.sourceCount
                  );
                  inspection.totalAssetCount = A.reduce(
                    inspection.categories,
                    0,
                    (total, entry) => total + entry.assetCount
                  );
                  yield* save({ inspection, categoryUrls }).pipe(Effect.orDie);
                })
              ).pipe(Effect.provide(dependencies), Effect.ensuring(release));
              const next: InstagramCategorySummary =
                result.cancelled === true
                  ? {
                      category,
                      state: "cancelled",
                      sourceCount: 0,
                      assetCount: 0,
                      cursor: result.cursor ?? previous?.cursor,
                    }
                  : InstagramScanServiceFunctions.toCategorySummary(category, result);
              next.incremental = incremental;
              const items = A.map(galleryItems(result), (item) => ({ ...item, id: `${category}:${item.id}` }));
              next.items = orderedMerge(previous?.items ?? [], items, result.cancelled === true);
              if (next.state === "unavailable" || next.state === "auth-required")
                next.cursor = result.cursor ?? previous?.cursor;
              if (next.items.length > 0) {
                if (next.state === "empty") next.state = "ready";
                next.sourceCount = next.items.length;
                next.assetCount = A.reduce(next.items, 0, (total, item) => total + item.assetCount);
              }
              next.mappedAt = options.clock();
              const user = resolveUserRecord(result.directoryMetadata[0]);
              inspection.profile.displayName =
                readString(user, "full_name", "fullname") ?? inspection.profile.displayName;
              inspection.profile.avatarUrl =
                readString(user, "profile_pic_url_hd", "profile_pic_url") ?? inspection.profile.avatarUrl;
              return next;
            });
            const outcome = yield* attempt().pipe(
              Effect.catch((failure) => {
                const message = failure.legacyMessage;
                return Effect.succeed<InstagramCategorySummary>({
                  ...previous,
                  category,
                  state: "unavailable",
                  sourceCount: previous?.sourceCount ?? 0,
                  assetCount: previous?.assetCount ?? 0,
                  errorCode: InstagramScanServiceFunctions.inspectionFailureCode(
                    message,
                    /ENOENT|not found/i.test(message)
                  ),
                });
              })
            );
            if (outcome === undefined) break;
            summary = outcome;
            if (summary.errorCode === "rate-limited") {
              rateLimitedUntil = options.clock() + INSTAGRAM_RATE_LIMIT_COOLDOWN_MS;
              summary.retryAfter = rateLimitedUntil;
            }
          }
          inspection.categories = A.map(INSTAGRAM_PROFILE_CATEGORIES, (key) =>
            key === category
              ? summary
              : Option.getOrElse(
                  A.findFirst(inspection.categories, (entry) => entry.category === key),
                  () => ({ category: key, state: "unscanned" as const, sourceCount: 0, assetCount: 0, items: [] })
                )
          );
          inspection.complete = A.every(
            inspection.categories,
            (entry) => entry.state === "ready" || entry.state === "empty"
          );
          inspection.totalSourceCount = A.reduce(inspection.categories, 0, (total, entry) => total + entry.sourceCount);
          inspection.totalAssetCount = A.reduce(inspection.categories, 0, (total, entry) => total + entry.assetCount);
          yield* save({ inspection, categoryUrls });
        }
        for (const key of [...cacheOrder]) {
          const entry = HashMap.get(cache, key);
          if (Option.isSome(entry) && entry.value.inspection.expiresAt <= options.clock()) remove(key);
        }
        while (HashMap.size(cache) >= (options.maxCacheEntries ?? 20)) {
          const oldest = cacheOrder[0];
          if (oldest === undefined || oldest === "") break;
          remove(oldest);
        }
        put(inspection.inspectionId, { inspection, categoryUrls });
        return yield* withMapping(inspection);
      });
      const request = Effect.fn("InstagramInspector.request")(function* (
        url: string,
        settings?: DownloadRuntimeSettings,
        categories?: readonly InstagramProfileCategory[]
      ) {
        const normalized = yield* normalize(url);
        if (categories?.length === 0) {
          const value = yield* scan(normalized.profileUrl, settings, []);
          return { key: "", result: Effect.succeed(value), snapshot: withMapping };
        }
        const key = yield* S.encodeEffect(S.fromJsonString(S.Unknown))([
          normalized.profileUrl,
          settings,
          categories,
        ]).pipe(
          Effect.mapError((cause) =>
            BoundaryDecodeError.make({ operation: "instagram.request", legacyMessage: cause.message, cause })
          )
        );
        const existing = HashMap.get(pending, key);
        if (Option.isSome(existing)) return { key, result: Deferred.await(existing.value), snapshot: withMapping };
        const controller = host.makeAbortController();
        const mapping: NonNullable<InstagramProfileInspection["mapping"]> = {
          category: categories?.[0] ?? "posts",
          state: "queued",
        };
        controllers.push({ controller, url: normalized.profileUrl, mapping });
        const prepared = yield* Effect.exit(scan(normalized.profileUrl, settings, []));
        const previous = tail;
        const result = yield* Deferred.make<InstagramProfileInspection, InspectionError>();
        const nextTail = yield* Deferred.make<void>();
        pending = HashMap.set(pending, key, result);
        tail = Deferred.await(nextTail);
        const stopped = Effect.callback<void>((resume) => {
          const abort = () => resume(Effect.void);
          controller.signal.addEventListener("abort", abort, { once: true });
          if (controller.signal.aborted) abort();
          return Effect.sync(() => controller.signal.removeEventListener("abort", abort));
        });
        const work = Effect.gen(function* () {
          yield* timing.turn("instagram.inspect.prepared");
          yield* prepared;
          yield* Effect.raceFirst(previous, stopped);
          yield* timing.turn("instagram.inspect.ready");
          return yield* scan(normalized.profileUrl, settings, categories, controller.signal, mapping);
        });
        yield* Effect.forkIn(
          Effect.gen(function* () {
            const exit = yield* Effect.exit(work);
            const index = A.findFirstIndex(controllers, (entry) => entry.controller === controller);
            if (Option.isSome(index)) controllers.splice(index.value, 1);
            pending = HashMap.remove(pending, key);
            yield* Deferred.done(result, exit);
            yield* previous;
            // The old allSettled continuation follows the request's finally and snapshot observers.
            yield* timing.turn("instagram.inspect.finally");
            yield* timing.turn("instagram.inspect.settled");
            yield* timing.turn("instagram.inspect.tail");
            yield* Deferred.succeed(nextTail, undefined);
          }),
          scope,
          { startImmediately: true }
        );
        return { key, result: Deferred.await(result), snapshot: withMapping };
      });
      const inspect = Effect.fn("InstagramInspector.inspect")(function* (
        url: string,
        settings?: DownloadRuntimeSettings,
        categories?: readonly InstagramProfileCategory[]
      ) {
        const scheduled = yield* request(url, settings, categories);
        const inspection = yield* scheduled.result;
        return yield* scheduled.snapshot(inspection);
      });
      const cancel = Effect.fn("InstagramInspector.cancel")(function* (url: string) {
        const normalized = yield* normalize(url);
        let cancelled = false;
        for (const state of controllers) {
          if (state.url === normalized.profileUrl) {
            state.controller.abort();
            cancelled = true;
          }
        }
        return cancelled;
      });
      const stop = Effect.gen(function* () {
        for (const state of controllers) state.controller.abort();
        yield* Effect.forEach(HashMap.values(pending), (result) => Deferred.await(result).pipe(Effect.ignore), {
          concurrency: "unbounded",
          discard: true,
        });
      });
      return InstagramProfileInspector.of({ get, list: list(), request, inspect, cancel, stop });
    })
  );
export { enqueueInstagramProfileDownload, restoreInstagramProfileGroupCaps } from "./InstagramEnqueue.service.js";
export { InstagramProfileInspector as InstagramProfiles };
