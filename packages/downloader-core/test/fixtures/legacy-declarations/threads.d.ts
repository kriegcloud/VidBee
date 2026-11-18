export interface NormalizedThreadsUrl {
    kind: 'post' | 'profile';
    url: string;
    username: string;
    shortcode?: string;
    directorySegments: readonly string[];
}
/** Threads profiles download their Media tab; replies and reposts are excluded. */
export declare const normalizeThreadsUrl: (value: string) => NormalizedThreadsUrl | null;
