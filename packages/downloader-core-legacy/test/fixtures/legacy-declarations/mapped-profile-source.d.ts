export type MappedProfilePlatform = 'x' | 'tiktok' | 'redgifs' | 'facebook' | 'vsco' | 'threads' | 'pinterest' | 'snapchat';
export interface MappedProfileSource {
    platform: MappedProfilePlatform;
    owner: string;
    profileUrl: string;
    category: string;
    categories: {
        key: string;
        url: string;
        requiresAuth: boolean;
    }[];
}
/** Site name shown wherever a mapped profile is named to the user. */
export declare const MAPPED_PROFILE_SITE_LABELS: Record<MappedProfilePlatform, string>;
/**
 * Platforms whose mapper reads cookies from a dedicated VidBee browser session.
 * Every other platform uses the browser cookies configured in Settings. The
 * desktop session manager and the mapper dialog both read this list, so the
 * dialog can never offer a login window the main process would refuse.
 */
export declare const DEDICATED_SESSION_PLATFORMS: readonly ["x", "tiktok"];
export type DedicatedSessionPlatform = (typeof DEDICATED_SESSION_PLATFORMS)[number];
/** True when this platform signs in through its own dedicated browser session. */
export declare const isDedicatedSessionPlatform: (platform: string | null | undefined) => platform is DedicatedSessionPlatform;
export declare const redGifsWatchUrl: (id: string) => string | null;
export declare const isMappedProfilePostUrl: (platform: MappedProfilePlatform, value: string) => boolean;
export declare const resolveMappedProfileSource: (value: string) => MappedProfileSource | null;
