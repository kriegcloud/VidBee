/**
 * Map an ISO 639-2/T or 639-2/B tag onto ISO 639-1. Already-2-letter tags pass through.
 *
 * @param tag Normalized lowercase language tag, optionally with a region/script suffix.
 */
export declare const iso6391FromTag: (tag: string) => string;
