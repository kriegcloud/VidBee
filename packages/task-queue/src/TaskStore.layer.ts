import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as MutableHashMap from "effect/MutableHashMap";
import * as MutableHashSet from "effect/MutableHashSet";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { TaskStatus } from "./Task.model.js";
import { DuplicateTaskId, StoreMissingTask } from "./TaskQueue.errors.js";
import { TaskStore } from "./TaskStore.service.js";
import type * as T from "./Task.model.js";

interface Listing {
  readonly ids: string[];
  readonly positions: MutableHashMap.MutableHashMap<string, number>;
}
const listingKey = S.encodeResult(S.fromJsonString(S.Unknown));

export const layer = Layer.sync(TaskStore, () => {
  const tasks = MutableHashMap.empty<string, T.Task>();
  const groups = MutableHashMap.empty<string, MutableHashSet.MutableHashSet<string>>();
  const parents = MutableHashMap.empty<string | null, MutableHashSet.MutableHashSet<string>>();
  const statuses = MutableHashMap.empty<T.TaskStatus, MutableHashSet.MutableHashSet<string>>();
  const listings = MutableHashMap.empty<string, Listing>();
  const listingOrder: string[] = [];
  const clearListings = () => {
    MutableHashMap.clear(listings);
    listingOrder.length = 0;
  };
  const get = (id: string) => Option.getOrUndefined(MutableHashMap.get(tasks, id));
  const bucket = <K>(map: MutableHashMap.MutableHashMap<K, MutableHashSet.MutableHashSet<string>>, key: K) => {
    const existing = MutableHashMap.get(map, key);
    if (Option.isSome(existing)) return existing.value;
    const fresh = MutableHashSet.empty<string>();
    MutableHashMap.set(map, key, fresh);
    return fresh;
  };
  const drop = <K>(
    map: MutableHashMap.MutableHashMap<K, MutableHashSet.MutableHashSet<string>>,
    key: K,
    id: string,
    removeEmpty: boolean
  ) => {
    const found = MutableHashMap.get(map, key);
    if (Option.isSome(found)) {
      MutableHashSet.remove(found.value, id);
      if (removeEmpty && MutableHashSet.size(found.value) === 0) MutableHashMap.remove(map, key);
    }
  };
  for (const status of TaskStatus.literals) bucket(statuses, status);
  return TaskStore.of({
    has: Effect.fn("TaskStore.has")((id) => Effect.sync(() => MutableHashMap.has(tasks, id))),
    get: Effect.fn("TaskStore.get")((id) => Effect.sync(() => get(id))),
    insert: Effect.fn("TaskStore.insert")((task) =>
      Effect.suspend(() => {
        if (MutableHashMap.has(tasks, task.id))
          return DuplicateTaskId.make({ legacyMessage: `TaskStore: duplicate id ${task.id}` });
        return Effect.sync(() => {
          MutableHashMap.set(tasks, task.id, task);
          MutableHashSet.add(bucket(groups, task.groupKey), task.id);
          MutableHashSet.add(bucket(parents, task.parentId), task.id);
          MutableHashSet.add(bucket(statuses, task.status), task.id);
          clearListings();
        });
      })
    ),
    update: Effect.fn("TaskStore.update")((task) =>
      Effect.suspend(() => {
        const previous = get(task.id);
        if (previous === undefined) return StoreMissingTask.make({ legacyMessage: `TaskStore: missing id ${task.id}` });
        return Effect.sync(() => {
          if (previous.status !== task.status) {
            drop(statuses, previous.status, previous.id, false);
            MutableHashSet.add(bucket(statuses, task.status), task.id);
          }
          if (previous.groupKey !== task.groupKey) {
            drop(groups, previous.groupKey, previous.id, true);
            MutableHashSet.add(bucket(groups, task.groupKey), task.id);
          }
          if (previous.parentId !== task.parentId) {
            drop(parents, previous.parentId, previous.id, true);
            MutableHashSet.add(bucket(parents, task.parentId), task.id);
          }
          if (
            previous.status !== task.status ||
            previous.groupKey !== task.groupKey ||
            previous.parentId !== task.parentId ||
            previous.createdAt !== task.createdAt
          )
            clearListings();
          MutableHashMap.set(tasks, task.id, task);
        });
      })
    ),
    remove: Effect.fn("TaskStore.remove")((id) =>
      Effect.sync(() => {
        const previous = get(id);
        if (previous === undefined) return false;
        MutableHashMap.remove(tasks, id);
        drop(statuses, previous.status, id, false);
        drop(groups, previous.groupKey, id, true);
        drop(parents, previous.parentId, id, true);
        clearListings();
        return true;
      })
    ),
    snapshot: Effect.fn("TaskStore.snapshot")((id) =>
      Effect.sync(() => {
        const task = get(id);
        return task === undefined ? undefined : { task };
      })
    ),
    list: Effect.fn("TaskStore.list")((options) =>
      Effect.sync(() => {
        const query = options?.query === undefined ? undefined : Str.toLocaleLowerCase()(Str.trim(options.query));
        const kind = options?.kind;
        const cacheable = (query === undefined || query === "") && kind === undefined;
        const encodedKey = listingKey([options?.status, options?.groupKey, options?.parentId]);
        // Schema's Unknown JSON encoder accepts this array of strings and undefined.
        const key = Result.isSuccess(encodedKey) ? encodedKey.success : "";
        let listing = cacheable ? Option.getOrUndefined(MutableHashMap.get(listings, key)) : undefined;
        if (listing === undefined) {
          const candidates =
            options?.parentId !== undefined && options.parentId !== ""
              ? Option.getOrElse(MutableHashMap.get(parents, options.parentId), () => [])
              : options?.status !== undefined
                ? Option.getOrElse(MutableHashMap.get(statuses, options.status), () => [])
                : options?.groupKey !== undefined && options.groupKey !== ""
                  ? Option.getOrElse(MutableHashMap.get(groups, options.groupKey), () => [])
                  : A.map(A.fromIterable(tasks), ([id]) => id);
          const all = A.filterMap(A.fromIterable(candidates), (id) => {
            const task = get(id);
            if (task === undefined) return Result.failVoid;
            if (options?.status !== undefined && task.status !== options.status) return Result.failVoid;
            if (options?.groupKey !== undefined && options.groupKey !== "" && task.groupKey !== options.groupKey)
              return Result.failVoid;
            if (options?.parentId !== undefined && options.parentId !== "" && task.parentId !== options.parentId)
              return Result.failVoid;
            if (kind !== undefined && task.kind !== kind) return Result.failVoid;
            if (
              query !== undefined &&
              query !== "" &&
              !Str.includes(query)(Str.toLocaleLowerCase()(`${task.id}\n${task.input.title ?? ""}\n${task.input.url}`))
            )
              return Result.failVoid;
            return Result.succeed(task);
          });
          all.sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
          const ids = A.map(all, (task) => task.id);
          listing = { ids, positions: MutableHashMap.fromIterable(A.map(ids, (id, index) => [id, index] as const)) };
          if (cacheable) {
            if (MutableHashMap.size(listings) >= 32) {
              const oldest = listingOrder.shift();
              if (oldest !== undefined) MutableHashMap.remove(listings, oldest);
            }
            MutableHashMap.set(listings, key, listing);
            listingOrder.push(key);
          }
        }
        const start =
          options?.cursor != null && options.cursor !== ""
            ? Option.getOrElse(MutableHashMap.get(listing.positions, options.cursor), () => -1) + 1
            : 0;
        const limit = options?.limit ?? 100;
        const page = A.filterMap(listing.ids.slice(start, start + limit), (id) => {
          const task = get(id);
          return task === undefined ? Result.failVoid : Result.succeed(task);
        });
        return {
          tasks: page,
          nextCursor: start + page.length < listing.ids.length && page.length > 0 ? (page.at(-1)?.id ?? null) : null,
        };
      })
    ),
    stats: Effect.fn("TaskStore.stats")((capacity) =>
      Effect.sync(() => {
        const byStatus = {
          queued: 0,
          running: 0,
          processing: 0,
          paused: 0,
          "retry-scheduled": 0,
          completed: 0,
          failed: 0,
          cancelled: 0,
        };
        for (const status of TaskStatus.literals) byStatus[status] = MutableHashSet.size(bucket(statuses, status));
        const perGroup: Record<string, number> = {};
        for (const [key, value] of groups) perGroup[key] = MutableHashSet.size(value);
        return {
          total: MutableHashMap.size(tasks),
          byStatus,
          running: byStatus.running,
          queued: byStatus.queued,
          capacity,
          perGroup,
        };
      })
    ),
    size: Effect.sync(() => MutableHashMap.size(tasks)),
  });
});
