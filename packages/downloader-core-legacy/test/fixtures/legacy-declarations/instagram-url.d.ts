import type { InstagramProfileCategory } from './types';
export declare const INSTAGRAM_PROFILE_CATEGORIES: readonly InstagramProfileCategory[];
/** Instagram account URL (any profile tab or story alias) → canonical profile. */
export declare const normalizeInstagramProfileUrl: (value: string) => {
    username: string;
    profileUrl: string;
} | null;
