import { sha256 } from "@vidbee/task-queue/util/sha256";
import * as A from "effect/Array";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as S from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Str from "effect/String";
import { BoundaryDecodeError, InvalidDownload, ProfileBusy, ProfileIdentityMismatch } from "./Downloader.errors.js";
import { DownloadFiles } from "./DownloadFiles.service.js";
import { DownloadHost } from "./DownloadHost.service.js";
import { DownloadTiming } from "./DownloadTiming.service.js";
import { resolveMappedProfileSource } from "./mapped-profile-source.js";
import { SocialMappedProfileSchema } from "./ProfilePersistence.model.js";
import { SocialInventoryCodec } from "./SocialInventoryCodec.service.js";
import { SocialTraversal } from "./SocialTraversal.service.js";
import type { HostFailure } from "./Downloader.errors.js";
import type { SocialMappedItem, SocialMappedProfile } from "./ProfilePersistence.model.js";
import type { DownloadRuntimeSettings } from "./types.js";

export interface SocialProfileManagerOptions {
  readonly storageDir: string;
}
export interface SocialMapOptions {
  readonly incremental?: boolean | undefined;
  readonly signal?: AbortSignal | undefined;
}
type ManagerError = HostFailure | InvalidDownload | ProfileBusy | ProfileIdentityMismatch | BoundaryDecodeError;
export interface SocialProfileManagerOperations {
  readonly get: (url: string) => Effect.Effect<SocialMappedProfile, ManagerError>;
  readonly list: Effect.Effect<SocialMappedProfile[], ManagerError>;
  readonly map: (
    url: string,
    category: string,
    settings?: DownloadRuntimeSettings,
    options?: SocialMapOptions
  ) => Effect.Effect<SocialMappedProfile, ManagerError>;
  readonly mapAndWait: (
    url: string,
    category: string,
    settings?: DownloadRuntimeSettings,
    options?: SocialMapOptions
  ) => Effect.Effect<SocialMappedProfile, ManagerError>;
  readonly stop: (url: string) => Effect.Effect<SocialMappedProfile, ManagerError>;
}
export class SocialProfileManager extends Context.Service<SocialProfileManager, SocialProfileManagerOperations>()(
  "@vidbee/downloader-core/social-profile-manager/SocialProfileManager"
) {}

const profileSource = (url: string) => {
  const source = resolveMappedProfileSource(url);
  return source === null
    ? Effect.fail(
        InvalidDownload.make({
          operation: "profileSource",
          legacyMessage: "Enter a Facebook, X, TikTok, Redgifs, VSCO, Threads, Pinterest, or Snapchat profile URL.",
        })
      )
    : Effect.succeed(source);
};
const preAggregated = HashSet.make("facebook", "vsco", "threads", "pinterest", "snapchat");
const codec = S.fromJsonString(SocialMappedProfileSchema);

/** Each layer owns its active scans and their continuation scope. */
export const socialProfileManagerLayer = (options: SocialProfileManagerOptions) =>
  Layer.effect(
    SocialProfileManager,
    Effect.gen(function* () {
      const files = yield* DownloadFiles;
      const inventoryCodec = yield* SocialInventoryCodec;
      const path = yield* Path.Path;
      const traversal = yield* SocialTraversal;
      const scope = yield* Scope.Scope;
      const timing = yield* DownloadTiming;
      const host = yield* DownloadHost;
      let active = HashMap.empty<
        string,
        { readonly controller: AbortController; readonly done: Fiber.Fiber<void, HostFailure | BoundaryDecodeError> }
      >();
      const filename = (platform: string, owner: string) =>
        path.join(options.storageDir, `${sha256(`${platform}:${Str.toLowerCase(owner)}`)}.json`);
      const save = Effect.fn("SocialProfileManager.save")(function* (profile: SocialMappedProfile) {
        yield* files.makeDirectory(options.storageDir, true, 0o700);
        profile.updatedAt = yield* Clock.currentTimeMillis;
        const target = filename(profile.platform, profile.owner);
        const text = yield* S.encodeEffect(codec)(profile).pipe(
          Effect.mapError((cause) =>
            BoundaryDecodeError.make({ operation: "social.save", legacyMessage: cause.message, cause })
          )
        );
        yield* files.write(`${target}.tmp`, text, 0o600);
        yield* files.rename(`${target}.tmp`, target);
      });
      const read = Effect.fn("SocialProfileManager.read")(function* (target: string) {
        const text = yield* files.read(target);
        return yield* inventoryCodec.decode(text);
      });
      const get = Effect.fn("SocialProfileManager.get")(function* (url: string) {
        const source = yield* profileSource(url);
        const target = filename(source.platform, source.owner);
        if (!(yield* files.exists(target))) {
          const profile: SocialMappedProfile = {
            profileUrl: source.profileUrl,
            platform: source.platform,
            owner: source.owner,
            categories: {},
            updatedAt: yield* Clock.currentTimeMillis,
          };
          for (const category of source.categories)
            profile.categories[category.key] = { state: "unscanned", items: [] };
          yield* save(profile);
          return profile;
        }
        const profile = yield* read(target);
        if (profile.platform !== source.platform || Str.toLowerCase(profile.owner) !== Str.toLowerCase(source.owner))
          return yield* ProfileIdentityMismatch.make({
            operation: "social.get",
            legacyMessage: "Saved social profile identity does not match.",
          });
        for (const category of source.categories) {
          const saved = profile.categories[category.key] ?? { state: "unscanned", items: [] };
          profile.categories[category.key] = saved;
          if (saved.state === "mapping" && !HashMap.has(active, target)) saved.state = "partial";
        }
        return profile;
      });
      const list = Effect.fn("SocialProfileManager.list")(function* () {
        if (!(yield* files.exists(options.storageDir))) return [];
        const results: SocialMappedProfile[] = [];
        for (const name of yield* files.readDirectory(options.storageDir)) {
          if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
          const profile = yield* read(path.join(options.storageDir, name)).pipe(
            Effect.flatMap((saved) => get(saved.profileUrl)),
            Effect.option
          );
          if (Option.isSome(profile)) results.push(profile.value);
        }
        return results.sort((left, right) => Str.localeCompare(right.owner)(left.owner));
      });
      const stop = Effect.fn("SocialProfileManager.stop")(function* (url: string) {
        const source = yield* profileSource(url);
        const running = HashMap.get(active, filename(source.platform, source.owner));
        if (Option.isSome(running)) {
          running.value.controller.abort();
          yield* Fiber.join(running.value.done);
        }
        return yield* get(url);
      });
      const map = Effect.fn("SocialProfileManager.map")(function* (
        url: string,
        category: string,
        settings?: DownloadRuntimeSettings,
        mapOptions: SocialMapOptions = {}
      ) {
        const source = yield* profileSource(url);
        const selectedOption = A.findFirst(source.categories, (entry) => entry.key === category);
        const selected = Option.getOrUndefined(selectedOption);
        if (selected === undefined)
          return yield* InvalidDownload.make({
            operation: "social.map",
            legacyMessage: "Unsupported profile category.",
          });
        const target = filename(source.platform, source.owner);
        if (HashMap.has(active, target))
          return yield* ProfileBusy.make({
            operation: "social.map",
            legacyMessage: "This profile is already mapping. Stop it or wait for completion.",
          });
        const profile = yield* get(url);
        const mapped = profile.categories[category];
        if (mapped === undefined)
          return yield* InvalidDownload.make({
            operation: "social.map",
            legacyMessage: "Unsupported profile category.",
          });
        const canStopEarly = mapOptions.incremental === true && mapped.state === "complete";
        mapped.state = "mapping";
        mapped.error = undefined;
        yield* save(profile);
        const controller = host.makeAbortController();
        let items = HashMap.fromIterable(A.map(mapped.items, (item) => [item.id, item] as const));
        const order = A.map(mapped.items, (item) => item.id);
        let seen = HashMap.empty<string, SocialMappedItem>();
        const onItem = Effect.fn("SocialProfileManager.onItem")(function* (entry: SocialMappedItem) {
          const current = HashMap.get(seen, entry.id);
          const next =
            Option.isSome(current) && !HashSet.has(preAggregated, source.platform)
              ? {
                  ...current.value,
                  url: entry.images !== 0 ? entry.url : current.value.url,
                  images: current.value.images + entry.images,
                  videos: current.value.videos + entry.videos,
                }
              : entry;
          seen = HashMap.set(seen, entry.id, next);
          if (!HashMap.has(items, entry.id)) order.push(entry.id);
          items = HashMap.set(items, entry.id, next);
          mapped.items = A.map(order, (id) => HashMap.getUnsafe(items, id));
          yield* save(profile);
        });
        const knownIds = canStopEarly && mapped.items.length > 0 ? A.map(mapped.items, (item) => item.id) : undefined;
        let completed = false;
        const work = traversal
          .map(
            {
              platform: source.platform,
              url: selected.url,
              category,
              owner: source.owner,
              settings,
              signal: controller.signal,
              knownIds,
            },
            onItem
          )
          .pipe(
            Effect.flatMap(
              Effect.fn("SocialProfileManager.complete")(function* (result) {
                mapped.state = result.complete
                  ? "complete"
                  : result.authRequired === true ||
                      (result.error !== undefined && Str.includes("AuthRequired")(result.error))
                    ? "auth-required"
                    : "partial";
                mapped.error = result.error;
                yield* save(profile);
              })
            ),
            Effect.catch(
              Effect.fn("SocialProfileManager.failed")(function* (failure) {
                mapped.state = controller.signal.aborted ? "partial" : "error";
                mapped.error = failure.legacyMessage;
                yield* save(profile);
              })
            ),
            Effect.ensuring(
              Effect.sync(() => {
                completed = true;
                active = HashMap.remove(active, target);
              })
            )
          );
        const done = yield* Effect.forkIn(work, scope, { startImmediately: true });
        if (!completed) active = HashMap.set(active, target, { controller, done });
        return structuredClone(profile);
      });
      const mapAndWait = Effect.fn("SocialProfileManager.mapAndWait")(function* (
        url: string,
        category: string,
        settings?: DownloadRuntimeSettings,
        mapOptions: SocialMapOptions = {}
      ) {
        const source = yield* profileSource(url);
        const target = filename(source.platform, source.owner);
        const previous = HashMap.get(active, target);
        if (Option.isSome(previous)) yield* Fiber.join(previous.value.done);
        yield* timing.turn("social.mapAndWait.previous");
        yield* map(url, category, settings, mapOptions);
        const running = HashMap.get(active, target);
        if (Option.isSome(running)) {
          const abort = () => running.value.controller.abort();
          mapOptions.signal?.addEventListener("abort", abort, { once: true });
          yield* Fiber.join(running.value.done).pipe(
            Effect.ensuring(Effect.sync(() => mapOptions.signal?.removeEventListener("abort", abort)))
          );
        }
        yield* timing.turn("social.mapAndWait.done");
        return yield* get(url);
      });
      return SocialProfileManager.of({ get, list: list(), stop, map, mapAndWait });
    })
  );

export { SocialProfileManager as SocialProfiles };
