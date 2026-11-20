// Pre-port compiler-emitted declarations kept for compile-time compatibility checks.
// Frozen before the Effect rewrite; nothing imports this fixture yet.
import type { ParsedFeed } from './types';
export interface FeedFetcher {
    fetch(feedUrl: string, signal?: AbortSignal): Promise<ParsedFeed>;
}
/** Discover only explicitly advertised RSS/Atom links, resolving relative URLs after redirects. */
export declare function discoverFeedUrls(html: string, pageUrl: string): string[];
/**
 * Default fetcher backed by `fetch` + `rss-parser`. Lazily constructs the
 * underlying parser so unused fetchers pay no startup cost.
 */
export declare class RssParserFeedFetcher implements FeedFetcher {
    private parser;
    /**
     * Download and parse one RSS/Atom feed URL.
     *
     * @param feedUrl Absolute HTTP(S) feed URL
     */
    fetch(feedUrl: string, signal?: AbortSignal): Promise<ParsedFeed>;
    /** Test a feed or follow up to three advertised feeds without saving or queuing anything. */
    probe(feedUrl: string, signal?: AbortSignal): Promise<{
        feed: ParsedFeed;
        feedUrl: string;
        discovered: boolean;
    }>;
    /** Share one configured parser between direct fetches and discovery probes. */
    private parse;
}
