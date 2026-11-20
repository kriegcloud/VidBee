import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { SubscriptionEntropy } from "./SubscriptionEntropy.service.js";
import { LeaderStateSink, SubscriptionLeader } from "./SubscriptionLeader.service.js";
import { SubscriptionLog } from "./SubscriptionLog.service.js";
import { SubscriptionMeta } from "./SubscriptionMeta.service.js";
import { SubscriptionTimers } from "./SubscriptionTimers.service.js";
import { DEFAULT_LEADER_HEARTBEAT_MS, DEFAULT_LEADER_LOCK_TTL_MS } from "./types.js";
import type { LeaderOptions } from "./Leader.model.js";
import type { LeaderState } from "./Subscription.model.js";
import type { TimerCancel } from "./SubscriptionTimers.service.js";
export const layer = (options: LeaderOptions) =>
  Layer.effect(
    SubscriptionLeader,
    Effect.gen(function* () {
      const meta = yield* SubscriptionMeta;
      const entropy = yield* SubscriptionEntropy;
      const timers = yield* SubscriptionTimers;
      const log = yield* SubscriptionLog;
      const sink = yield* LeaderStateSink;
      const heartbeatMs = options.heartbeatIntervalMs ?? DEFAULT_LEADER_HEARTBEAT_MS;
      const ttl = options.lockTtlMs ?? DEFAULT_LEADER_LOCK_TTL_MS;
      const { kind, pid } = options;
      let leaseId: string | null = null;
      let heartbeatCancel: TimerCancel | null = null;
      let snapshot: LeaderState | null = null;
      const stopTimer = Effect.gen(function* () {
        if (heartbeatCancel !== null) {
          yield* heartbeatCancel;
          heartbeatCancel = null;
        }
      });
      const heartbeat = Effect.gen(function* () {
        if (leaseId === null || !Boolean(leaseId)) return false;
        const now = yield* timers.now;
        const ok = yield* meta.casLeader({
          expectedLeaseId: leaseId,
          now,
          next: {
            kind,
            pid,
            startedAt: snapshot?.startedAt ?? now,
            heartbeatAt: now,
            lockExpiresAt: now + ttl,
            leaseId,
          },
        });
        if (!ok) {
          yield* log.write("warn", "leader: heartbeat CAS failed; lease was stolen", { kind, pid });
          const stolen = yield* meta.readLeader;
          leaseId = null;
          yield* stopTimer;
          snapshot = stolen;
          yield* sink.emit(stolen, false);
          return false;
        }
        snapshot = {
          kind,
          pid,
          startedAt: snapshot?.startedAt ?? now,
          heartbeatAt: now,
          lockExpiresAt: now + ttl,
          leaseId,
          preferred: snapshot?.preferred ?? null,
        };
        return true;
      });
      const startTimer = Effect.gen(function* () {
        if (heartbeatCancel !== null) yield* heartbeatCancel;
        heartbeatCancel = yield* timers.every(heartbeatMs, { run: Effect.asVoid(heartbeat) });
      });
      const canAcquire = (state: LeaderState, now: number): boolean => {
        if (!Boolean(state.leaseId)) return true;
        if (state.lockExpiresAt === null || state.lockExpiresAt <= now) {
          if (Boolean(state.preferred) && state.preferred !== kind) return false;
          return true;
        }
        return false;
      };
      return SubscriptionLeader.of({
        isLeader: Effect.sync(() => leaseId !== null),
        heartbeat,
        tryAcquire: Effect.gen(function* () {
          const state = yield* meta.readLeader;
          const now = yield* timers.now;
          if (canAcquire(state, now)) {
            const candidate = yield* entropy.leaseId;
            const next = { kind, pid, startedAt: now, heartbeatAt: now, lockExpiresAt: now + ttl, leaseId: candidate };
            const ok = yield* meta.casLeader({ expectedLeaseId: null, now, next });
            if (ok) {
              leaseId = candidate;
              yield* startTimer;
              const acquired = { ...next, preferred: state.preferred };
              snapshot = acquired;
              yield* log.write("info", "leader: acquired lease", { kind, pid, leaseId: candidate });
              yield* sink.emit(acquired, true);
              return { acquired: true, state: acquired };
            }
            yield* log.write("info", "leader: acquire CAS failed; another host is leader");
          }
          yield* stopTimer;
          leaseId = null;
          const fresh = yield* meta.readLeader;
          snapshot = fresh;
          yield* sink.emit(fresh, false);
          return { acquired: false, state: fresh };
        }),
        release: Effect.gen(function* () {
          if (leaseId === null || !Boolean(leaseId)) return;
          const now = yield* timers.now;
          const ok = yield* meta.casLeader({
            expectedLeaseId: leaseId,
            now,
            next: { kind: null, pid: null, startedAt: null, heartbeatAt: null, lockExpiresAt: null, leaseId: null },
          });
          if (!ok) yield* log.write("warn", "leader: release CAS failed; lease already moved on");
          leaseId = null;
          yield* stopTimer;
          const after = yield* meta.readLeader;
          snapshot = after;
          yield* sink.emit(after, false);
        }),
        observe: Effect.gen(function* () {
          const state = yield* meta.readLeader;
          snapshot = state;
          return state;
        }),
      });
    })
  );
