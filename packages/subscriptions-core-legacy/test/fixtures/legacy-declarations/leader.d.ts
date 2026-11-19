// Pre-port compiler-emitted declarations kept for compile-time compatibility checks.
// Frozen before the Effect rewrite; nothing imports this fixture yet.
import { type LeaderAcquireOptions, type LeaderKind, type LeaderState } from './types';
export interface MetaStore {
    /**
     * Read all leader-related meta keys in a single transaction. Returning a
     * partial map (missing keys when the row doesn't exist) is fine.
     */
    readLeader(): Promise<LeaderState>;
    /**
     * Compare-and-swap the leader rows. Implementations MUST run the read and
     * write inside one SQLite transaction (or equivalent). Returns true on
     * success; false if the current state no longer matches `expectedLeaseId`.
     *
     * The semantics are:
     *   - if `expectedLeaseId` is null, succeed when the stored `leaseId` is
     *     null OR the lease has expired (<= now). This is the "acquire fresh
     *     lease" path.
     *   - otherwise, succeed only if the stored `leaseId === expectedLeaseId`.
     *     This is the "renew/release my lease" path.
     */
    casLeader(args: {
        expectedLeaseId: string | null;
        now: number;
        next: Pick<LeaderState, 'kind' | 'pid' | 'startedAt' | 'heartbeatAt' | 'lockExpiresAt' | 'leaseId'>;
    }): Promise<boolean>;
    /** Read the operator-set preference; nullable. */
    readPreferred(): Promise<LeaderKind | null>;
    /** Write the operator-set preference. */
    writePreferred(kind: LeaderKind | null): Promise<void>;
}
export interface LeaderElectionOptions extends LeaderAcquireOptions {
    metaStore: MetaStore;
    /**
     * Optional logger. Default is no-op so the package stays Electron / log
     * runtime free; hosts wire `electron-log` / `pino` etc.
     */
    log?: (level: 'info' | 'warn' | 'error', msg: string, meta?: unknown) => void;
    /**
     * Called whenever the lease state visibly changes (acquired, lost, stolen,
     * heartbeat-failed). Hosts use this to start/stop their feed-check timer.
     */
    onStateChange?: (state: LeaderState, isLeader: boolean) => void;
    /**
     * Schedule helpers. Default to `setInterval` / `clearInterval`. Tests
     * inject fake timers.
     */
    scheduleInterval?: (cb: () => void, ms: number) => unknown;
    clearInterval?: (handle: unknown) => void;
}
export declare class LeaderElection {
    private readonly metaStore;
    private readonly kind;
    private readonly pid;
    private readonly heartbeatIntervalMs;
    private readonly lockTtlMs;
    private readonly now;
    private readonly log;
    private readonly onStateChange?;
    private readonly scheduleInterval;
    private readonly clearIntervalImpl;
    private leaseId;
    private heartbeatHandle;
    private lastSnapshot;
    constructor(options: LeaderElectionOptions);
    isLeader(): boolean;
    /**
     * Try to acquire (or steal an expired) leader lease. Returns the resulting
     * leader state. If the call wins the lease, a heartbeat timer is started.
     */
    tryAcquire(): Promise<{
        acquired: boolean;
        state: LeaderState;
    }>;
    /**
     * Refresh `leader_heartbeat_at` and extend `leader_lock_expires_at`.
     * Called automatically every `heartbeatIntervalMs` once we're leader.
     * Returns true if heartbeat succeeded, false otherwise.
     */
    heartbeat(): Promise<boolean>;
    /**
     * Release the lease cooperatively. Idempotent. After release the host can
     * call `tryAcquire()` again on next interval.
     */
    release(): Promise<void>;
    /** Read fresh state straight through the store (no caching). */
    observe(): Promise<LeaderState>;
    private startHeartbeatTimer;
    /**
     * Return true iff this host is allowed to overwrite the current state.
     * The acquire path is conservative: only acquire when there is no leader
     * or the existing lease has aged past `lockExpiresAt`.
     *
     * `preferred_leader` is a *tie-breaker for expired leases*, not a license
     * to preempt a fresh leader. A non-preferred host whose lease is healthy
     * keeps it until heartbeat dies (max 90s), at which point the preferred
     * host wins the next acquire round.
     */
    private canAcquireOver;
}
