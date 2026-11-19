// Pre-port compiler-emitted declaration closure; kept unchanged for compatibility checks.
import type { CaptionTrack } from './captions';
import type { ExtractedCaptionTrack } from './extract-captions';
import type { MemoryTranscriptStore } from './memory-store';
import type { TranscriptStore } from './transcript-store';
import type { TranscriptRecord } from './types';
export interface ImportCaptionsInput {
    downloadTaskId: string;
    extractEmbedded?: () => Promise<ExtractedCaptionTrack[]>;
    preferredLanguages?: string[];
    sourceFilePath: string;
    store: TranscriptStore | MemoryTranscriptStore;
}
/**
 * Persist cues from one caption track when the download has no transcript yet.
 *
 * @param input Store, download id, and a parsed track.
 */
export declare const commitCaptionTrack: (input: Omit<ImportCaptionsInput, 'extractEmbedded'> & {
    convertScript?: boolean;
    replace?: boolean;
    track: CaptionTrack;
}) => TranscriptRecord | null;
/**
 * Activate a stored captions language, or import that sidecar now.
 *
 * @param input Store, media path, and language key such as `ai-zh`.
 */
export declare const switchToCaptionLanguage: (input: Omit<ImportCaptionsInput, 'extractEmbedded'> & {
    language: string;
}) => TranscriptRecord | null;
/**
 * Import sidecar subtitle files next to the video. Safe to call from a sync snapshot.
 *
 * @param input Store, download id, and media path.
 */
export declare const importSidecarCaptionsIfPresent: (input: Omit<ImportCaptionsInput, 'extractEmbedded'>) => TranscriptRecord | null;
/**
 * Import sidecar captions, then fall back to embedded text subtitle streams.
 *
 * @param input Store, media path, and optional embedded extractor.
 */
export declare const importCaptionsForDownload: (input: ImportCaptionsInput) => Promise<TranscriptRecord | null>;
