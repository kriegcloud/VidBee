export declare const FILENAME_STYLES: readonly ['classic', 'basic', 'pretty', 'nerdy'];
export type FilenameStyle = (typeof FILENAME_STYLES)[number];
export declare const DEFAULT_FILENAME_STYLE: FilenameStyle;
export declare const DEFAULT_FILENAME_VIA_VIDBEE = true;
export declare const VIA_VIDBEE_LABEL = "via VidBeep";
export declare const DEFAULT_FILENAME_TEMPLATE = "%(title)s.%(ext)s";
export declare const SHARED_FILENAME_TEMPLATE = "%(title)s via VidBeep.%(ext)s";
export declare const FILENAME_STYLE_PREVIEWS: Record<FilenameStyle, {
    audio: string;
    video: string;
}>;
/**
 * Return whether a value is a supported filename style.
 *
 * @param value Unknown setting value from storage or the UI.
 * @returns True when the value is a known filename style.
 */
export declare const isFilenameStyle: (value: unknown) => value is FilenameStyle;
/**
 * Insert `via VidBeep` before the file extension when the setting is on.
 *
 * Already branded names are left unchanged so share-watermark templates and
 * repeated calls do not double the suffix.
 *
 * @param value yt-dlp template or preview filename.
 * @param enabled Whether the via VidBeep suffix should be applied.
 * @returns The original value, or the same name with `via VidBeep` added.
 */
export declare const applyViaVidBeeFilename: (value: string, enabled?: boolean) => string;
/**
 * Resolve the yt-dlp output template for a filename style and download type.
 *
 * Custom caller templates still win. Share-watermark mode always uses the
 * branded title template. An unset style uses pretty. An unset via VidBeep
 * flag defaults to on.
 *
 * @param style Saved filename style, or undefined for the pretty default.
 * @param type Video or audio download.
 * @param shareWatermark Whether the share-watermark filename should be used.
 * @param filenameViaVidBee Whether to append via VidBeep before the extension.
 * @returns A yt-dlp `-o` template without the download directory.
 */
export declare const resolveFilenameTemplate: (style: FilenameStyle | undefined, type: 'audio' | 'video', shareWatermark?: boolean, filenameViaVidBee?: boolean) => string;
