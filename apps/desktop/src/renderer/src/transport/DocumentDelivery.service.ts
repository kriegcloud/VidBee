import * as A from "effect/Array";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import * as O from "effect/Option";
import { failure } from "./DocumentDelivery.errors.js";
import type { DeliveryError } from "./DocumentDelivery.errors.js";
import type { Cut } from "./DocumentDelivery.model.js";

interface Watermark {
  applied: number;
  readonly client: string;
  ended: boolean;
  readonly retention?: import("./ElectronRpc.model.js").RetentionLease;
}
interface Waiter {
  readonly cuts: ReadonlyArray<Cut>;
  readonly resume: (effect: Effect.Effect<void, DeliveryError>) => void;
  readonly retention?: import("./ElectronRpc.model.js").RetentionLease;
}
/** Local application gates never send an application receipt to main. */
export const makeDeliveryGate = ({
  maxCalls = 1024,
  resources,
  maxTokens = 4096,
}: {
  readonly resources?: import("./ElectronRpc.model.js").ResourceBudget;
  readonly maxCalls?: number;
  readonly maxTokens?: number;
} = {}) => {
  let records = HashMap.empty<string, Watermark>();
  let pending: ReadonlyArray<Waiter> = [];
  let closed = false;
  let retired = HashSet.empty<string>();
  // Length-prefixing prevents collisions from arbitrary document/family strings.
  const key = (cut: Cut) =>
    `${cut.epoch.length}:${cut.epoch}${cut.token.document.length}:${cut.token.document}${cut.token.client.length}:${cut.token.client}/${cut.token.generation}/${cut.token.family.length}:${cut.token.family}/${cut.token.serial}`;
  const status = (cuts: ReadonlyArray<Cut>) => {
    if (closed) return "failed";
    let waiting = false;
    for (const cut of cuts) {
      if (HashSet.has(retired, cut.token.client)) return "failed";
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
      waiter.retention?.release();
      waiter.resume(state === "ready" ? Effect.void : Effect.fail(failure("DeliveryLost")));
      return false;
    });
  };
  const disconnect = () => {
    closed = true;
    flush();
    for (const record of HashMap.values(records)) record.retention?.release();
    records = HashMap.empty();
  };
  const update = (cut: Cut, ended: boolean) => {
    if (closed || HashSet.has(retired, cut.token.client)) return;
    const id = key(cut);
    const old = HashMap.get(records, id);
    if (O.isNone(old) && HashMap.size(records) >= maxTokens) {
      retireClient(cut.token.client);
      return;
    }
    const retention = O.isSome(old) ? old.value.retention : resources?.claim("watermark", 128 + id.length * 2);
    if (
      O.isNone(old) &&
      (A.filter(HashMap.values(records), (entry) => entry.client === cut.token.client).length >= 1024 ||
        (resources !== undefined && retention === undefined))
    ) {
      retireClient(cut.token.client);
      return;
    }
    records = HashMap.set(records, id, {
      client: cut.token.client,
      ...(retention === undefined ? {} : { retention }),
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
      const cutBytes = A.reduce(cuts, 128, (sum, cut) => sum + key(cut).length * 2 + 128);
      const retention = cutBytes <= 4096 ? resources?.claim("cut", cutBytes) : undefined;
      if (cutBytes > 4096 || (resources !== undefined && retention === undefined)) {
        resume(Effect.fail(failure("DeliveryLost")));
        return;
      }
      const waiter = { cuts, resume, ...(retention === undefined ? {} : { retention }) };
      pending = A.append(pending, waiter);
      return Effect.sync(() => {
        retention?.release();
        pending = A.filter(pending, (entry) => entry !== waiter);
      });
    });
  const retireClient = (client: string) => {
    if (HashSet.has(retired, client)) return;
    if (HashSet.size(retired) >= 64) {
      disconnect();
      return;
    }
    retired = HashSet.add(retired, client);
    for (const [key, record] of HashMap.toEntries(records))
      if (record.client === client) {
        record.retention?.release();
        records = HashMap.remove(records, key);
      }
    flush();
  };
  return {
    retireClient,
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
