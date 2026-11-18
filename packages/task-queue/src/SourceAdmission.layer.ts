import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as MutableHashMap from "effect/MutableHashMap";
import * as MutableHashSet from "effect/MutableHashSet";
import * as Option from "effect/Option";
import * as Str from "effect/String";
import { SourceAdmission } from "./SourceAdmission.service.js";
import type { AdmissionState, Release } from "./SourceAdmission.service.js";

interface Waiter {
  readonly grant: () => void;
}
interface Listener {
  active: boolean;
  readonly effect: Effect.Effect<void>;
}
const keyOf = (url: string): string | undefined => {
  try {
    const host = Str.replace(/^www\./, "")(Str.toLowerCase(new URL(url).hostname));
    for (const domain of [
      "instagram.com",
      "tiktok.com",
      "facebook.com",
      "vsco.co",
      "threads.net",
      "threads.com",
      "dzen.ru",
      "youtube.com",
    ]) {
      if (host === domain || Str.endsWith(`.${domain}`)(host)) return domain === "threads.net" ? "threads.com" : domain;
    }
    return host === "youtu.be" ? "youtube.com" : host;
  } catch {
    return undefined;
  }
};
export const makeState = (): AdmissionState => {
  const held = MutableHashSet.empty<string>();
  const waiting = MutableHashMap.empty<string, Waiter[]>();
  const listeners: { entries: Listener[]; depth: number } = { entries: [], depth: 0 };
  const pruneListeners = () => {
    if (listeners.depth === 0) listeners.entries = A.filter(listeners.entries, (entry) => entry.active);
  };
  const take = (url: string): Option.Option<Release> => {
    const key = keyOf(url);
    if (key === undefined) return Option.some(Effect.void);
    if (MutableHashSet.has(held, key)) return Option.none();
    MutableHashSet.add(held, key);
    let released = false;
    return Option.some(
      Effect.gen(function* () {
        if (released) return;
        released = true;
        MutableHashSet.remove(held, key);
        Option.getOrUndefined(MutableHashMap.get(waiting, key))?.shift()?.grant();
        listeners.depth++;
        yield* Effect.gen(function* () {
          for (const listener of listeners.entries) if (listener.active) yield* listener.effect;
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              listeners.depth--;
              pruneListeners();
            })
          )
        );
      })
    );
  };
  return {
    tryAcquire: (url) => Effect.sync(() => take(url)),
    acquire: (url) =>
      Effect.suspend(() => {
        const release = take(url);
        if (Option.isSome(release)) return Effect.succeed(release.value);
        const key = keyOf(url);
        if (key === undefined) return Effect.succeed(Effect.void);
        return Effect.callback<Release>((resume) => {
          const queue = Option.getOrUndefined(MutableHashMap.get(waiting, key)) ?? [];
          const waiter: Waiter = {
            grant: () => {
              const next = take(url);
              if (Option.isSome(next)) resume(Effect.succeed(next.value));
            },
          };
          queue.push(waiter);
          MutableHashMap.set(waiting, key, queue);
          return Effect.sync(() => {
            const index = queue.indexOf(waiter);
            if (index >= 0) queue.splice(index, 1);
          });
        });
      }),
    subscribe: (effect) =>
      Effect.sync(() => {
        let listener = Option.getOrUndefined(
          A.findFirst(listeners.entries, (entry) => entry.active && entry.effect === effect)
        );
        if (listener === undefined) {
          listener = { effect, active: true };
          listeners.entries.push(listener);
        }
        return () => {
          const current = A.findFirst(listeners.entries, (entry) => entry.active && entry.effect === effect);
          if (Option.isSome(current)) current.value.active = false;
          pruneListeners();
        };
      }),
  };
};
export const layerFromShared = (state: AdmissionState) => Layer.succeed(SourceAdmission, state);
export const layer = Layer.sync(SourceAdmission, makeState);
