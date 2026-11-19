import { LiteralKit } from "@vidbee/schema/LiteralKit";
import { TaskExecutor } from "@vidbee/task-queue/TaskExecutor.service";
import * as A from "effect/Array";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { BoundaryDecodeError, InvalidDownload } from "./Downloader.errors.js";
import { DownloadFiles } from "./DownloadFiles.service.js";
import { DownloadHost } from "./DownloadHost.service.js";
import { DownloadQueue } from "./DownloadQueue.service.js";
import { DownloadTiming } from "./DownloadTiming.service.js";
import { resolveSocialSource, SocialMediaOptionsSchema, socialCollectionUrl } from "./social-media.js";
import { expandTikTokShortLink } from "./tiktok-short-link.js";
import type { ExecutorContext, ExecutorFinishEvent } from "@vidbee/task-queue/Executor.model";
import type { HostFailure } from "./Downloader.errors.js";
import type { SocialMediaOptions } from "./social-media.js";

export {
  SocialMappedItemSchema,
  SocialMappedProfileSchema,
  SocialProfileCategorySchema,
} from "./ProfilePersistence.model.js";
export type { SocialMappedItem, SocialMappedProfile, SocialProfileCategory } from "./ProfilePersistence.model.js";
export interface ProfileMapOptions {
  knownIds?: readonly string[] | undefined;
}
export interface SocialMediaDownloadRequest {
  categories?: string[] | undefined;
  customDownloadPath?: string | undefined;
  options?: Partial<SocialMediaOptions> | undefined;
  settings?: import("./types.js").DownloadRuntimeSettings | undefined;
  url: string;
}

export class SocialOptionsCodec extends Context.Service<
  SocialOptionsCodec,
  {
    readonly decode: (
      value: Partial<SocialMediaOptions>
    ) => Effect.Effect<SocialMediaOptions, BoundaryDecodeError | HostFailure>;
  }
>()("@vidbee/downloader-core/social-media-service/SocialOptionsCodec") {}
export const SocialOptionsCodecLive = Layer.succeed(SocialOptionsCodec, {
  decode: Effect.fn("SocialOptionsCodec.decode")((value) =>
    S.decodeUnknownEffect(SocialMediaOptionsSchema)(value).pipe(
      Effect.mapError((cause) =>
        BoundaryDecodeError.make({ operation: "social.options", legacyMessage: cause.message, cause })
      )
    )
  ),
});
export const writeKnownItemsFile = Effect.fn("SocialMedia.writeKnownItems")(function* (
  directory: string,
  knownIds: readonly string[] | undefined
) {
  if (knownIds === undefined || knownIds.length === 0) return undefined;
  const path = yield* Path.Path;
  const files = yield* DownloadFiles;
  const file = path.join(directory, "known-items.json");
  const text = yield* S.encodeEffect(S.String.pipe(S.Array, S.fromJsonString))(knownIds).pipe(
    Effect.mapError((cause) =>
      BoundaryDecodeError.make({ operation: "social.knownItems", legacyMessage: cause.message, cause })
    )
  );
  yield* files.write(file, text, 0o600);
  return file;
});
export const inspectSocialMedia = Effect.fn("SocialMedia.inspect")(function* (url: string) {
  const expanded = yield* expandTikTokShortLink(url);
  const timing = yield* DownloadTiming;
  yield* timing.turn("social.inspect.expand");
  const source = resolveSocialSource(expanded);
  if (source === null || source.kind === "unsupported")
    return yield* InvalidDownload.make({
      operation: "social.inspect",
      legacyMessage: "This social media URL is not supported. Use a post, profile, or supported collection URL.",
    });
  return source;
});
interface QueuePosts {
  index: HashMap.HashMap<string, HashSet.HashSet<string>>;
  pending: HashSet.HashSet<string>;
}
const queuedXPosts = new WeakMap<object, QueuePosts>();
const nonTerminal = HashSet.make("queued", "running", "processing", "paused", "retry-scheduled");
export const downloadSocialMedia = Effect.fn("SocialMedia.download")(function* (
  request: SocialMediaDownloadRequest,
  batch?: { id: string; title: string; order: number }
) {
  const queue = yield* DownloadQueue;
  const host = yield* DownloadHost;
  const timing = yield* DownloadTiming;
  const optionsCodec = yield* SocialOptionsCodec;
  const source = yield* inspectSocialMedia(request.url);
  yield* timing.turn("social.download.inspect");
  const options = yield* optionsCodec.decode(request.options ?? {});
  const categories = A.dedupe(request.categories ?? []);
  const urls: string[] = [];
  for (const key of categories) {
    const category = A.findFirst(source.categories, (item) => item.key === key);
    if (Option.isNone(category))
      return yield* InvalidDownload.make({
        operation: "social.download",
        legacyMessage: `Unsupported collection category: ${key}`,
      });
    urls.push(category.value.url);
  }
  if (urls.length === 0) urls.push(socialCollectionUrl(source));
  const groupId = batch?.id ?? `social_${host.uuid()}`;
  const groupKey = `social:${source.platform}`;
  yield* queue.setMaxPerGroup(groupKey, 1);
  const ids: string[] = [];
  for (const [index, url] of urls.entries()) {
    const xPost = source.platform === "x" && resolveSocialSource(url)?.kind === "post";
    let state = queuedXPosts.get(queue.identity);
    if (xPost && state === undefined) {
      state = { index: HashMap.empty(), pending: HashSet.empty() };
      let cursor: string | null = null;
      do {
        const page: {
          readonly tasks: ReadonlyArray<Readonly<import("@vidbee/task-queue/types").Task>>;
          readonly nextCursor: string | null;
        } = yield* queue.list({ limit: 200, cursor });
        for (const task of page.tasks) {
          if (task.kind !== "social-media" || !HashSet.has(nonTerminal, task.status)) continue;
          const post = resolveSocialSource(task.input.url);
          if (post?.platform === "x" && post.kind === "post")
            state.index = HashMap.set(
              state.index,
              post.url,
              HashSet.add(
                Option.getOrElse(HashMap.get(state.index, post.url), () => HashSet.empty<string>()),
                task.id
              )
            );
        }
        cursor = page.nextCursor;
      } while (cursor !== null && cursor !== "");
      queuedXPosts.set(queue.identity, state);
    }
    if (xPost && state !== undefined) {
      if (HashSet.has(state.pending, url)) continue;
      let queued = false;
      for (const id of Option.getOrElse(HashMap.get(state.index, url), () => HashSet.empty<string>())) {
        const task = yield* queue.get(id);
        if (task !== undefined && HashSet.has(nonTerminal, task.status)) queued = true;
      }
      if (queued) continue;
      state.pending = HashSet.add(state.pending, url);
    }
    const result = yield* queue
      .add({
        groupKey,
        input: {
          kind: "social-media",
          url,
          title: `${source.platform}: ${source.owner}`,
          options: {
            socialMedia: options,
            settings: request.settings,
            customDownloadPath: request.customDownloadPath,
            downloadPath: Str.trim(request.customDownloadPath ?? "") || request.settings?.downloadPath,
            batchId: groupId,
            batchKind: "social-media",
            batchTitle: batch?.title ?? source.owner,
            batchCategory: resolveSocialSource(url)?.category,
            batchOrder: (batch?.order ?? 0) + index,
            sourceMediaKind: options.media === "images" ? "image" : options.media === "videos" ? "video" : "mixed",
          },
        },
      })
      .pipe(
        Effect.ensuring(
          Effect.sync(() => {
            if (state !== undefined) state.pending = HashSet.remove(state.pending, url);
          })
        )
      );
    ids.push(result.id);
    if (xPost && state !== undefined)
      state.index = HashMap.set(
        state.index,
        url,
        HashSet.add(
          Option.getOrElse(HashMap.get(state.index, url), () => HashSet.empty<string>()),
          result.id
        )
      );
  }
  return { groupId, ids };
});
export const restoreSocialMediaGroupCaps = Effect.fn("SocialMedia.restoreCaps")(function* () {
  const queue = yield* DownloadQueue;
  for (const platform of ["x", "reddit", "tiktok", "instagram"]) yield* queue.setMaxPerGroup(`social:${platform}`, 1);
});
export const previewSocialMedia = Effect.fn("SocialMedia.preview")(function* (
  url: string,
  settings?: import("./types.js").DownloadRuntimeSettings
) {
  const source = yield* inspectSocialMedia(url);
  const files = yield* DownloadFiles;
  const path = yield* Path.Path;
  const host = yield* DownloadHost;
  const executor = yield* TaskExecutor;
  const directory = yield* files.makeTempDirectory(path.join(host.tempDirectory(), "vidbee-social-preview-"));
  const admission = yield* SocialAdmission;
  const release = yield* admission.acquire(url);
  const result = yield* Effect.gen(function* () {
    const finished = yield* Deferred.make<ExecutorFinishEvent>();
    const context: ExecutorContext = {
      taskId: host.uuid(),
      attemptId: host.uuid(),
      attemptNumber: 1,
      input: {
        kind: "social-media",
        url: source.url,
        options: {
          settings,
          customDownloadPath: directory,
          socialInspect: true,
          socialMedia: { maxPosts: 3, linkedMedia: false },
        },
      },
    };
    const run = yield* executor.run(context, {
      emit: Effect.fn("SocialMedia.previewEvent")((event) =>
        event.type === "finish" ? Deferred.succeed(finished, event).pipe(Effect.asVoid) : Effect.void
      ),
    });
    const timer = yield* Effect.forkChild(Effect.sleep(30_000).pipe(Effect.andThen(run.cancel(0)), Effect.ignore));
    return yield* Deferred.await(finished).pipe(Effect.ensuring(Fiber.interrupt(timer)));
  }).pipe(Effect.ensuring((release ?? Effect.void).pipe(Effect.andThen(files.remove(directory, true)), Effect.orDie)));
  if (result.result.type !== "success" || result.result.output.collectionSummary === undefined)
    return yield* InvalidDownload.make({
      operation: "social.preview",
      legacyMessage: "Preview unavailable. Check access and cookies, or start the download to see detailed errors.",
    });
  const summary = result.result.output.collectionSummary;
  return {
    source,
    preview: {
      posts: summary.posts,
      images: summary.images,
      videos: summary.videos,
      limited: summary.reason === "limit",
    },
  };
});

export class SocialAdmission extends Context.Service<
  SocialAdmission,
  {
    readonly acquire: (
      url: string,
      signal?: AbortSignal
    ) => Effect.Effect<Effect.Effect<void> | undefined, HostFailure>;
  }
>()("@vidbee/downloader-core/social-media-service/SocialAdmission") {}
export const SocialAdmissionLive = Layer.succeed(SocialAdmission, {
  acquire: Effect.fn("SocialAdmission.acquire")(() => Effect.succeed(Effect.void)),
});
const socialItemEvent = S.fromJsonString(
  S.Struct({
    type: S.Literal("item"),
    item: S.Struct({
      id: S.String,
      url: S.String,
      author: S.String,
      kind: LiteralKit(["image", "video"]),
      date: S.optional(S.Unknown),
    }),
  })
);
const socialPrefix = "__VIDBEE_SOCIAL__\t";
const rateLimitDiagnostic = /\b429\b|Too Many Requests|rate.?limit/i;
/** Stream stable post references; malformed item events cannot enter persisted inventories. */
export const mapSocialMediaProfile = Effect.fn("SocialMedia.map")(function* (
  url: string,
  settings: import("./types.js").DownloadRuntimeSettings | undefined,
  signal: AbortSignal,
  onItem: (item: import("./ProfilePersistence.model.js").SocialMappedItem) => Effect.Effect<void>,
  options: ProfileMapOptions = {}
) {
  const source = yield* inspectSocialMedia(url);
  if (!(A.contains(["x", "tiktok"], source.platform) && A.contains(["profile", "feed"], source.kind)))
    return yield* InvalidDownload.make({
      operation: "social.map",
      legacyMessage: "Map an X or TikTok profile category URL.",
    });
  const files = yield* DownloadFiles;
  const path = yield* Path.Path;
  const host = yield* DownloadHost;
  const admission = yield* SocialAdmission;
  const executor = yield* TaskExecutor;
  const directory = yield* files.makeTempDirectory(path.join(host.tempDirectory(), "vidbee-social-map-"));
  let release: Effect.Effect<void> | undefined;
  let discoveredItems = 0;
  return yield* Effect.gen(function* () {
    release = yield* admission.acquire(url, signal);
    if (signal.aborted) return { complete: false };
    const knownItemsFile = yield* writeKnownItemsFile(directory, options.knownIds);
    const finished = yield* Deferred.make<ExecutorFinishEvent>();
    const run = yield* executor.run(
      {
        taskId: host.uuid(),
        attemptId: host.uuid(),
        attemptNumber: 1,
        input: {
          kind: "social-media",
          url: source.url,
          options: {
            settings,
            customDownloadPath: directory,
            socialInspect: true,
            socialMap: true,
            ...(knownItemsFile !== undefined ? { socialKnownItemsFile: knownItemsFile } : {}),
            socialMedia: { linkedMedia: false },
          },
        },
      },
      {
        emit: Effect.fn("SocialMedia.mapEvent")(function* (event) {
          if (event.type === "finish") {
            yield* Deferred.succeed(finished, event);
            return;
          }
          if (event.type !== "std" || !Str.startsWith(socialPrefix)(event.line)) return;
          const parsed = S.decodeOption(socialItemEvent)(Str.slice(socialPrefix.length)(event.line));
          if (Option.isNone(parsed)) return;
          const entry = parsed.value.item;
          if (!/^\d+$/.test(entry.id)) return;
          const post = resolveSocialSource(entry.url);
          if (post?.kind !== "post" || post.platform !== source.platform) return;
          discoveredItems += 1;
          const item: import("./ProfilePersistence.model.js").SocialMappedItem = {
            id: entry.id,
            url: post.url,
            author: entry.author,
            images: entry.kind === "image" ? 1 : 0,
            videos: entry.kind === "video" ? 1 : 0,
          };
          if (typeof entry.date === "number" && Number.isFinite(entry.date) && entry.date > 0)
            item.publishedAt = Math.trunc(entry.date);
          yield* onItem(item).pipe(Effect.ignoreCause);
        }),
      }
    );
    const cancellation = yield* Effect.forkChild(
      Effect.callback<void>((resume) => {
        const abort = () => resume(run.cancel(0).pipe(Effect.ignore));
        signal.addEventListener("abort", abort, { once: true });
        return Effect.sync(() => signal.removeEventListener("abort", abort));
      }),
      { startImmediately: true }
    );
    const result = yield* Deferred.await(finished).pipe(Effect.ensuring(Fiber.interrupt(cancellation)));
    if (signal.aborted || result.result.type === "cancelled") return { complete: false };
    if (result.result.type === "success")
      return source.platform === "x" && discoveredItems === 0
        ? {
            complete: false,
            error: "X returned no downloadable posts. Check the dedicated browser session and retry mapping.",
          }
        : { complete: true };
    const diagnostic = `${result.result.error.rawMessage}\n${result.stderrTail}`;
    return {
      complete: false,
      error: /AuthRequired|Could not authenticate you|login required|authenticated cookies|Extracted 0 cookies/i.test(
        diagnostic
      )
        ? source.platform === "x"
          ? "AuthRequired: X rejected the dedicated browser cookies. Reopen the browser, sign in again if prompted, close it, then retry mapping."
          : "AuthRequired: sign in with the dedicated browser and retry mapping."
        : rateLimitDiagnostic.test(diagnostic)
          ? "RateLimited: the site is limiting requests from this network. Saved items were retained; retry later."
          : "Profile mapping stopped before traversal completed. Saved items were retained.",
    };
  }).pipe(
    Effect.ensuring(
      Effect.suspend(() => (release ?? Effect.void).pipe(Effect.andThen(files.remove(directory, true)), Effect.orDie))
    )
  );
});
