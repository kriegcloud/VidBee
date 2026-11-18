export type OneClickQualityPreset = 'best' | 'good' | 'normal' | 'bad' | 'worst';
export type OneClickContainerOption = 'auto' | 'mp4' | 'mkv' | 'webm' | 'original';
export declare const ONE_CLICK_CONTAINER_OPTIONS: OneClickContainerOption[];
/**
 * Container passed into each playlist video download.
 *
 * Desktop and web playlist dialogs share this rule: an explicit playlist
 * selection wins, otherwise the global Container setting is used. Audio
 * downloads do not remux into a video container.
 */
export declare const resolvePlaylistContainerFormat: (downloadType: 'video' | 'audio', selectedContainer: OneClickContainerOption | undefined, fallbackContainer: OneClickContainerOption | undefined) => OneClickContainerOption | undefined;
export interface OneClickFormatSettings {
    oneClickQuality?: OneClickQualityPreset;
}
export declare const buildVideoFormatPreference: (settings: OneClickFormatSettings) => string;
export declare const buildAudioFormatPreference: (settings: OneClickFormatSettings) => string;
