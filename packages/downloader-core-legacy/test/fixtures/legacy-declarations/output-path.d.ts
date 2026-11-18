export interface VideoDownloadPathInfo {
    title?: string;
    uploader?: string;
}
/**
 * Normalize user-derived path segments so they remain valid on filesystems.
 *
 * @param value Raw folder or file fragment.
 * @returns A trimmed, punctuation-safe segment.
 */
export declare const sanitizePathSegment: (value: string) => string;
/**
 * Sanitize a folder name generated from remote metadata.
 *
 * @param value Uploader or title.
 * @param fallback Used when the value is empty after sanitizing.
 * @returns A usable folder name.
 */
export declare const sanitizeFolderName: (value: string, fallback: string) => string;
/**
 * Resolve the on-disk folder for a single-video download.
 *
 * Files land in `{downloadPath}/{channel}` by default, or `{downloadPath}`
 * when channel subfolders are disabled.
 *
 * @param basePath Configured download directory.
 * @param info Optional title/uploader from the video.
 * @param skipChannelSubfolders When true, skip the channel folder.
 * @returns Destination directory.
 */
export declare const resolveAutoVideoDownloadPath: (basePath: string, info?: VideoDownloadPathInfo | null, skipChannelSubfolders?: boolean) => string;
