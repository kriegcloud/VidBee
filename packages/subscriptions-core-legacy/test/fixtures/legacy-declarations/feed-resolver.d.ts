// Pre-port compiler-emitted declarations kept for compile-time compatibility checks.
// Frozen before the Effect rewrite; nothing imports this fixture yet.
import { type ProfilePlatform, type ResolvedFeed } from './types';
/** Synthetic, case-folded feed URL so one account can only be subscribed once. */
export declare const profileFeedUrl: (platform: ProfilePlatform, owner: string) => string;
/**
 * Recognize an account on a platform VidBee maps itself. Any tab, post-less
 * profile alias or category URL of the account resolves to its profile page.
 */
export declare const resolveProfileSource: (rawUrl: string) => ResolvedFeed | null;
export declare const resolveFeedFromInput: (rawUrl: string) => ResolvedFeed;
/**
 * Build a stable hash key for duplicate-feed detection. Two feeds compare
 * equal iff their host+path+query collapse to the same string after a few
 * normalization passes (case, trailing slash, missing protocol).
 */
export declare const buildFeedKey: (feedUrl: string) => string;
