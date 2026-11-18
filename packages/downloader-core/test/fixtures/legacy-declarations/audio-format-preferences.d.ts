export interface AudioFormatLike {
    formatId?: string;
    format_id?: string;
    language?: string;
}
/**
 * Pick the best matching audio format id for a saved language preference.
 *
 * @param formats Available audio formats.
 * @param preferredLanguage Last language the user picked, if any.
 * @returns A format id, or undefined when the list is empty.
 */
export declare const pickPreferredAudioFormatId: (formats: AudioFormatLike[], preferredLanguage?: string) => string | undefined;
