// Pre-port compiler-emitted declarations kept for compile-time compatibility checks.
// Frozen before the Effect rewrite; nothing imports this fixture yet.
export interface FeedCheckSchedulerOptions {
    /**
     * Run the periodic feed-check pass over all enabled subscriptions, or one
     * if `subscriptionId` is given. Hosts implement this; the scheduler only
     * decides when to call.
     */
    runAll: () => Promise<void>;
    runOne: (subscriptionId: string) => Promise<void>;
    /**
     * Returns true if this host currently holds the leader lease.
     *
     * The scheduler reads this every tick rather than caching, so a leader
     * loss between ticks is honored without needing the `LeaderElection`
     * instance to feed events into here.
     */
    isLeader: () => boolean;
    /** Default 3h. */
    intervalMs?: number;
    /**
     * Window during which a duplicate `triggerNow(id)` is dropped. Default 30s
     * (matches NEX-132 spec for cross-host refresh dedupe).
     */
    refreshDedupeWindowMs?: number;
    /** Default `setTimeout`. */
    setTimeoutImpl?: (cb: () => void, ms: number) => unknown;
    clearTimeoutImpl?: (handle: unknown) => void;
    now?: () => number;
    log?: (level: 'info' | 'warn' | 'error', msg: string, meta?: unknown) => void;
}
export declare class FeedCheckScheduler {
    private readonly opts;
    private timer;
    private running;
    private pending;
    private stopped;
    private generation;
    private readonly recentTriggers;
    constructor(options: FeedCheckSchedulerOptions);
    /**
     * Start the periodic timer. Calling start() multiple times is harmless;
     * the next scheduled run replaces any prior timer.
     */
    start(initialDelayMs?: number): void;
    stop(): void;
    /**
     * Trigger an out-of-band run. If `subscriptionId` is given, only that
     * subscription is refreshed; otherwise all enabled subscriptions are. The
     * call is dropped silently when the same subscription was triggered less
     * than `refreshDedupeWindowMs` ago — this is the cross-host dedupe.
     */
    triggerNow(subscriptionId?: string): Promise<void>;
    /**
     * Internal periodic tick. Only the leader runs `runAll`; non-leaders
     * just re-arm their timer so they can take over instantly when the
     * leader expires.
     */
    private tick;
    private runIfIdle;
    private scheduleNext;
    private pruneRecentTriggers;
}
