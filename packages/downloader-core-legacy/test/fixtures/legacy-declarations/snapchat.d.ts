/** Query key that scopes a story URL to one snap for the VidBee gallery-dl module. */
export declare const SNAPCHAT_SNAP_PARAM = "vidbee_snap";
export type SnapchatCategory = 'stories' | 'spotlight';
export interface NormalizedSnapchatUrl {
    /**
     * `profile` is an account page; `stories`/`spotlights` are its category
     * pages (mapped through VidBee's gallery-dl module); `story-snap` is one
     * story or saved-highlight snap; `spotlight` is one Spotlight post.
     */
    kind: 'profile' | 'stories' | 'spotlights' | 'story-snap' | 'spotlight';
    url: string;
    username: string;
    /** Snap file id (`story-snap`) or Spotlight id (`spotlight`). */
    id?: string;
    directorySegments: readonly string[];
}
export declare const snapchatProfileUrl: (username: string) => string;
/** Category page the VidBee gallery-dl module maps. */
export declare const snapchatCategoryUrl: (username: string, category: SnapchatCategory) => string;
export declare const snapchatStorySnapUrl: (username: string, fileId: string) => string;
export declare const snapchatSpotlightUrl: (username: string, id: string) => string;
/**
 * Normalize Snapchat public-profile URLs: `snapchat.com/@user`, `/add/user`,
 * `story.snapchat.com/@user`, their `/stories` and `/spotlights` tabs, one
 * Spotlight post, and VidBee's story-snap URL (`/stories?vidbee_snap=<id>`).
 */
export declare const normalizeSnapchatUrl: (value: string) => NormalizedSnapchatUrl | null;
