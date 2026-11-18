export interface NormalizedFacebookGalleryUrl {
    url: string;
    directorySegments: readonly string[];
}
/** Recognize photo resources without claiming Facebook video, reel, or share URLs. */
export declare const normalizeFacebookGalleryUrl: (value: string) => NormalizedFacebookGalleryUrl | null;
