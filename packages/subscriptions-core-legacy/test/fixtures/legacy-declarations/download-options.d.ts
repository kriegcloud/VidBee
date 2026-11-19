// Pre-port compiler-emitted declarations kept for compile-time compatibility checks.
// Frozen before the Effect rewrite; nothing imports this fixture yet.
import { type OneClickContainerOption, type OneClickQualityPreset } from '@vidbee/downloader-core/format-preferences';
import type { SubscriptionDownloadPreferences } from './types';
interface SubscriptionDownloadDefaults {
    oneClickDownloadType?: 'video' | 'audio';
    oneClickQuality?: OneClickQualityPreset;
    oneClickContainer?: OneClickContainerOption;
}
/** Resolve subscription overrides into executor options for automatic and manual downloads. */
export declare const buildSubscriptionDownloadOptions: (subscription: SubscriptionDownloadPreferences, defaults: SubscriptionDownloadDefaults) => {
    type: 'subtitles';
    format: 'srt';
} | {
    type: 'video' | 'audio';
    format: string;
    containerFormat?: OneClickContainerOption;
};
export {};
