export declare const SPEAKER_COUNT_CHOICES: readonly ['auto', 1, 2, 3, 4, 5, 6, 7, 8];
export type SpeakerCount = (typeof SPEAKER_COUNT_CHOICES)[number];
export declare const DEFAULT_SPEAKER_COUNT: SpeakerCount;
export declare const MAX_SPEAKER_COUNT = 8;
/**
 * Return true when the value is a supported speaker-count setting.
 *
 * @param value Raw setting or task option.
 */
export declare const isSpeakerCount: (value: unknown) => value is SpeakerCount;
/**
 * Coerce an unknown setting/task value to a speaker count. Default is auto.
 *
 * @param value Raw setting or task option.
 * @param fallback Value used when parsing fails.
 */
export declare const parseSpeakerCount: (value: unknown, fallback?: SpeakerCount) => SpeakerCount;
/**
 * Map a product speaker count onto sherpa `numClusters` (-1 means auto).
 *
 * @param count Parsed speaker-count setting.
 */
export declare const sherpaNumClusters: (count: SpeakerCount) => number;
