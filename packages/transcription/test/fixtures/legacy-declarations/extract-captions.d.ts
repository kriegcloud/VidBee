// Pre-port compiler-emitted declaration closure; kept unchanged for compatibility checks.
export interface ExtractedCaptionTrack {
    language: string | null;
    text: string;
    title?: string;
}
/**
 * Resolve the ffprobe binary that sits next to ffmpeg.
 *
 * @param ffmpegPath Absolute ffmpeg path.
 */
export declare const ffprobePathFromFfmpeg: (ffmpegPath: string) => string;
/**
 * Extract text subtitle streams from a container as WebVTT documents.
 *
 * Preferred UI languages are extracted first so a Chinese or English track is
 * not dropped when ffmpeg listed Arabic (or another 639-2 tag) ahead of them.
 *
 * @param input ffmpeg binary, media path, and optional UI language tags.
 */
export declare const extractEmbeddedCaptionTracks: (input: {
    ffmpegPath: string;
    filePath: string;
    preferredLanguages?: string[];
}) => Promise<ExtractedCaptionTrack[]>;
