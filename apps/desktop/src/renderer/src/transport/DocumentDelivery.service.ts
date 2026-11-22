import * as A from "effect/Array";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as HashMap from "effect/HashMap";
import * as O from "effect/Option";
import { failure } from "./DocumentDelivery.errors.js";
import type { DeliveryError } from "./DocumentDelivery.errors.js";
import type { Cut } from "./DocumentDelivery.model.js";

interface Watermark {
  applied: number;
  ended: boolean;
}
interface Waiter {
  readonly cuts: ReadonlyArray<Cut>;
  readonly resume: (effect: Effect.Effect<void, DeliveryError>) => void;
}
/** Local application gates never send an application receipt to main. */
export const makeDeliveryGate = ({
  maxCalls = 1024,
  maxTokens = 4096,
}: {
  readonly maxCalls?: number;
  readonly maxTokens?: number;
} = {}) => {
  let records = HashMap.empty<string, Watermark>();
  let pending: ReadonlyArray<Waiter> = [];
  let closed = false;
  // Length-prefixing prevents collisions from arbitrary document/family strings.
  const key = (cut: Cut) =>
    `${cut.epoch.length}:${cut.epoch}${cut.token.document.length}:${cut.token.document}${cut.token.client.length}:${cut.token.client}/${cut.token.generation}/${cut.token.family.length}:${cut.token.family}/${cut.token.serial}`;
  const status = (cuts: ReadonlyArray<Cut>) => {
    if (closed) return "failed";
    let waiting = false;
    for (const cut of cuts) {
      const record = HashMap.get(records, key(cut));
      if (O.isSome(record) && record.value.applied >= cut.through) continue;
      if (O.isSome(record) && record.value.ended) return "failed";
      waiting = true;
    }
    return waiting ? "waiting" : "ready";
  };
  const flush = () => {
    pending = A.filter(pending, (waiter) => {
      const state = status(waiter.cuts);
      if (state === "waiting") return true;
      waiter.resume(state === "ready" ? Effect.void : Effect.fail(failure("DeliveryLost")));
      return false;
    });
  };
  const disconnect = () => {
    closed = true;
    flush();
  };
  const update = (cut: Cut, ended: boolean) => {
    const id = key(cut);
    const old = HashMap.get(records, id);
    if (O.isNone(old) && HashMap.size(records) >= maxTokens) {
      disconnect();
      return;
    }
    records = HashMap.set(records, id, {
      applied: ended
        ? O.match(old, { onNone: () => 0, onSome: (value) => value.applied })
        : Math.max(O.match(old, { onNone: () => 0, onSome: (value) => value.applied }), cut.through),
      ended: ended || O.exists(old, (value) => value.ended),
    });
    flush();
  };
  const awaitCuts = (cuts: ReadonlyArray<Cut>) =>
    Effect.callback<void, DeliveryError>((resume) => {
      const state = status(cuts);
      if (state === "ready") {
        resume(Effect.void);
        return;
      }
      if (state === "failed" || cuts.length > 16 || pending.length >= maxCalls) {
        resume(Effect.fail(failure("DeliveryLost")));
        return;
      }
      const waiter = { cuts, resume };
      pending = A.append(pending, waiter);
      return Effect.sync(() => {
        pending = A.filter(pending, (entry) => entry !== waiter);
      });
    });
  return {
    awaitCuts,
    applied: (cut: Cut) => update(cut, false),
    end: (cut: Cut) => update(cut, true),
    disconnect,
    stats: () => ({ tokens: HashMap.size(records), pending: pending.length }),
  };
};
export class DocumentDelivery extends Context.Service<DocumentDelivery, ReturnType<typeof makeDeliveryGate>>()(
  "vidbee/renderer/src/transport/DocumentDelivery.service/DocumentDelivery"
) {}
