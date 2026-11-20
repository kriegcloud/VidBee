import * as Effect from "effect/Effect";
import * as HashMap from "effect/HashMap";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as SqlClient from "effect/sql/SqlClient";
import * as R from "./Rows.model.js";
import { decodeRow } from "./Rows.model.js";
import { readSqlHost, sqlSegment } from "./SqlSegment.js";
import { SubscriptionMeta } from "./SubscriptionMeta.service.js";
import { SubscriptionTimers } from "./SubscriptionTimers.service.js";
import type { LeaderKind, LeaderState } from "./Subscription.model.js";
import type { LeaderCasRequest } from "./SubscriptionMeta.service.js";

const KEYS = {
  kind: "leader_kind",
  pid: "leader_pid",
  startedAt: "leader_started_at",
  heartbeatAt: "leader_heartbeat_at",
  lockExpiresAt: "leader_lock_expires_at",
  leaseId: "leader_lease_id",
  preferred: "preferred_leader",
};
const kind = (value: string | undefined): LeaderKind | null => (value === "desktop" || value === "api" ? value : null);
const number = (value: string | undefined): number | null => {
  if (value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const empty = (): LeaderState => ({
  kind: null,
  pid: null,
  startedAt: null,
  heartbeatAt: null,
  lockExpiresAt: null,
  leaseId: null,
  preferred: null,
});
const allowed = (state: LeaderState, r: LeaderCasRequest): boolean =>
  r.expectedLeaseId === null
    ? state.leaseId === null || (state.lockExpiresAt !== null && state.lockExpiresAt <= r.now)
    : state.leaseId === r.expectedLeaseId;
export const SubscriptionMetaSqlLive = Layer.effect(
  SubscriptionMeta,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const segment = sqlSegment(sql);

    const timers = yield* SubscriptionTimers;
    const read = Effect.fn("SubscriptionMeta.read")(function* () {
      const raw = yield* sql`SELECT * FROM subscriptions_meta`;
      let map = HashMap.empty<string, string>();
      for (const value of raw) {
        const row = yield* decodeRow("subscriptions_meta")(R.SubscriptionsMetaRawRowFromSql)(value);
        map = HashMap.set(map, row.key, row.value);
      }
      const get = (key: string) => Option.getOrUndefined(HashMap.get(map, key));
      return {
        kind: kind(get(KEYS.kind)),
        pid: number(get(KEYS.pid)),
        startedAt: number(get(KEYS.startedAt)),
        heartbeatAt: number(get(KEYS.heartbeatAt)),
        lockExpiresAt: number(get(KEYS.lockExpiresAt)),
        leaseId: get(KEYS.leaseId) ?? null,
        preferred: kind(get(KEYS.preferred)),
      };
    });
    const write = Effect.fn("SubscriptionMeta.write")(function* (
      key: string,
      value: string | number | null,
      at: number
    ) {
      if (value === null) {
        yield* sql`DELETE FROM subscriptions_meta WHERE key=${key}`;
        return;
      }
      yield* sql`INSERT INTO subscriptions_meta (key,value,updated_at) VALUES (${key},${String(value)},${at}) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`;
    });
    const store = SubscriptionMeta.of({
      readLeader: read(),
      readPreferred: read().pipe(Effect.map((s) => s.preferred)),
      writePreferred: Effect.fn(function* (value) {
        const at = yield* readSqlHost(timers.now);
        yield* write(KEYS.preferred, value, at);
      }),
      casLeader: Effect.fn(function* (request) {
        return yield* sql
          .withTransaction(
            Effect.gen(function* () {
              const state = yield* read();
              if (!allowed(state, request)) return false;
              yield* write(KEYS.kind, request.next.kind, request.now);
              yield* write(KEYS.pid, request.next.pid, request.now);
              yield* write(KEYS.startedAt, request.next.startedAt, request.now);
              yield* write(KEYS.heartbeatAt, request.next.heartbeatAt, request.now);
              yield* write(KEYS.lockExpiresAt, request.next.lockExpiresAt, request.now);
              yield* write(KEYS.leaseId, request.next.leaseId, request.now);
              return true;
            })
          )
          .pipe(Effect.provideService(SqlClient.BeginTransaction, "BEGIN"));
      }),
    });
    return SubscriptionMeta.of({
      readLeader: segment(store.readLeader),
      readPreferred: segment(store.readPreferred),
      writePreferred: Effect.fn("SubscriptionMeta.writePreferred")((kind) => segment(store.writePreferred(kind))),
      casLeader: Effect.fn("SubscriptionMeta.casLeader")((request) => segment(store.casLeader(request))),
    });
  })
);
export const SubscriptionMetaMemoryLive = Layer.effect(
  SubscriptionMeta,
  Effect.sync(() => {
    let state = empty();
    return SubscriptionMeta.of({
      readLeader: Effect.sync(() => ({ ...state })),
      readPreferred: Effect.sync(() => state.preferred),
      writePreferred: Effect.fn("SubscriptionMeta.writePreferred")((preferred) =>
        Effect.sync(() => {
          state = { ...state, preferred };
        })
      ),
      casLeader: Effect.fn("SubscriptionMeta.casLeader")((request) =>
        Effect.sync(() => {
          if (!allowed(state, request)) return false;
          state = { ...state, ...request.next };
          return true;
        })
      ),
    });
  })
);
