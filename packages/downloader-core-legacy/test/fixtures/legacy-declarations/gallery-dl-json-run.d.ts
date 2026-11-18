import type { SourceAdmission } from '@vidbee/task-queue-legacy/source-admission';
import type { DownloadRuntimeSettings } from './types';
/** Binaries and cookie arguments a profile mapper needs from its host. */
export interface GalleryDlProfileMapRuntime {
    admission?: SourceAdmission;
    resolveGalleryDlPath: () => string;
    resolveYtDlpPath: () => string;
    resolveGalleryDlArgs?: (settings?: DownloadRuntimeSettings, url?: string) => readonly string[];
}
export interface GalleryDlJsonRun {
    stdout: string;
    /** Last few KiB of stderr, where gallery-dl logs warnings such as challenges. */
    stderr: string;
    error?: string;
    complete: boolean;
}
/**
 * Run a mapper binary that streams newline-delimited JSON, bounded by output
 * size and wall clock so a runaway traversal cannot exhaust memory.
 */
export declare const runGalleryDlJson: (binary: string, args: string[], signal: AbortSignal, label: string, onLine?: (line: string) => void) => Promise<GalleryDlJsonRun>;
/** Arguments shared by every gallery-dl traversal that only reads metadata. */
export declare const GALLERY_DL_MAP_ARGS: readonly ['--config-ignore', '--no-input', '--no-colors', '-j', '-o', 'output.jsonl=true', '--sleep-request', '1', '--sleep-429', '60', '--retries', '1'];
/**
 * Metadata of one `Message.Url` event from a `-j --output.jsonl` traversal.
 * gallery-dl writes each event as `[type, url, metadata]`; type 3 is a URL.
 */
export declare const galleryDlUrlMetadata: (line: string) => Record<string, unknown> | null;
