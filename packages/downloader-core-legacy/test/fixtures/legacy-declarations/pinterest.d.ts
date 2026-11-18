export type PinterestSource = {
    kind: 'pin';
    id: string;
    url: string;
    directorySegments: readonly string[];
} | {
    kind: 'profile';
    username: string;
    url: string;
    directorySegments: readonly string[];
};
/** Profile roots select created pins, never the unrelated board named `_created`. */
export declare const normalizePinterestUrl: (value: string) => PinterestSource | null;
export declare const PINTEREST_EXTRACTOR_ARGS: readonly ['-o', 'extractor.pinterest.videos=true', '-o', 'extractor.pinterest.stories=true'];
