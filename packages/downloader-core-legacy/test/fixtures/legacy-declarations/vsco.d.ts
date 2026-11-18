export interface NormalizedVscoUrl {
    /** `gallery` is the whole profile; `media` and `video` are single posts. */
    kind: 'gallery' | 'media' | 'video';
    username: string;
    /** Canonical URL to hand gallery-dl. */
    url: string;
    /** Post id, empty for a gallery. */
    id: string;
    directorySegments: readonly string[];
}
/** Normalize the VSCO profile and post routes gallery-dl can extract. */
export declare const normalizeVscoUrl: (value: string) => NormalizedVscoUrl | null;
/** A single VSCO post, which the profile mapper enumerates and queues one by one. */
export declare const vscoPostUrl: (username: string, id: string, video: boolean) => string | null;
