import { type AsrTierId } from './asr-tiers';
import type { ModelFileSpec, ModelGroup, ModelStatus } from './types';
export interface ModelManagerOptions {
    modelsDir: string;
    catalog?: readonly ModelFileSpec[];
    fetchImpl?: typeof fetch;
    /** Called at download time so a settings change applies to the next file. */
    preferChina?: boolean | (() => boolean);
    /** Override candidate URLs (tests). Production uses ModelScope + GitHub mirrors. */
    resolveUrls?: (spec: ModelFileSpec) => readonly string[];
    /** Per-URL header timeout so a blocked GitHub host does not sit at 0%. */
    attemptTimeoutMs?: number;
    /**
     * Test seam. Runs after this attempt's files are in its private staging
     * directory and before publication, so tests can overlap two managers.
     */
    afterArchiveStaged?: (stagingDir: string) => void | Promise<void>;
}
export interface EnsureReadyOptions {
    groups?: readonly ModelGroup[];
    tiers?: readonly AsrTierId[];
}
/**
 * Per-process staging file so the desktop host and ASR worker can download
 * the same model without sharing one `.part` stream.
 *
 * @param dest Final on-disk model path.
 */
export declare const modelPartPath: (dest: string) => string;
/**
 * Delete leftover staging files for a model dest.
 *
 * @param dest Final on-disk model path.
 */
export declare const removeModelPartFiles: (dest: string) => void;
/**
 * Move a finished download into place. Another process may already have
 * published the same file; that is success, not a missing-file error.
 *
 * @param tmp Staging `.part` path for this process.
 * @param dest Final on-disk model path.
 */
export declare const finalizeModelFile: (tmp: string, dest: string) => void;
export declare const MODEL_DOWNLOAD_CANCELLED = "download cancelled";
/**
 * True when a model fetch stopped because the user cancelled it.
 */
export declare const isModelDownloadCancelled: (error: unknown) => boolean;
export declare class ModelManager {
    readonly modelsDir: string;
    private readonly catalog;
    private readonly fetchImpl;
    private readonly preferChinaOption?;
    private readonly resolveUrls?;
    private readonly attemptTimeoutMs;
    private readonly afterArchiveStaged?;
    private readonly inflight;
    private readonly downloadProgressByKey;
    private readonly ensureCounts;
    private readonly abortByTier;
    private readonly progressListeners;
    private lastProgressEmitAt;
    private activeTiers;
    constructor(opts: ModelManagerOptions);
    /**
     * Listen for download progress. Returns an unsubscribe function.
     *
     * @param listener Called with occupancy status after progress changes.
     */
    subscribe(listener: (status: ModelStatus) => void): () => void;
    status(groups?: readonly ModelGroup[], tiers?: readonly AsrTierId[]): ModelStatus;
    pathFor(spec: Pick<ModelFileSpec, 'fileName'>): string;
    /**
     * Why a tier's on-disk tree must not be opened, or null when it is missing
     * or valid. A nonempty partial extract is an incomplete model.
     */
    incompleteModelIssue(tier?: AsrTierId): string | null;
    pathByRole(role: ModelFileSpec['role'], tier?: AsrTierId): string | null;
    /**
     * Resolve a catalog entry by id when more than one file shares a role.
     *
     * @param id Catalog id such as `speaker-embedding`.
     */
    pathById(id: string): string | null;
    ensureReady(opts?: EnsureReadyOptions): Promise<ModelStatus>;
    /**
     * Same as ensureReady, but a user cancel returns current status instead of throwing.
     */
    ensureReadyAllowCancel(opts?: EnsureReadyOptions): Promise<ModelStatus>;
    redownload(): Promise<ModelStatus>;
    /**
     * Delete on-disk files for one ASR model. Shared VAD/speaker files stay.
     */
    removeTier(tier: AsrTierId): ModelStatus;
    /**
     * Abort an in-flight model download. Partial files are removed.
     */
    cancelDownload(tier: AsrTierId): ModelStatus;
    /**
     * Remove ASR files, extract dirs, and cached archives for one model.
     */
    private purgeTierFiles;
    /**
     * Track an in-flight ensureReady so delete can refuse a busy model.
     */
    private beginTiers;
    /**
     * Drop the matching ensureReady refcount when a download batch finishes.
     */
    private endTiers;
    /**
     * Top-level path to remove for a catalog file (model directory or the file).
     */
    private modelRootFor;
    private wantedSpecs;
    private tierStatuses;
    private downloadMissing;
    private installSpec;
    /** Download and repair pinned directory members from a publisher's raw directory URL. */
    private installDirectory;
    /** Read a file's checksum from its pinned publisher manifest before downloading it. */
    private checksumFor;
    /**
     * Candidate URLs for one catalog file: ModelScope, GitHub, then proxies.
     */
    private urlsFor;
    /**
     * Read the latest China-mirror preference (settings can change mid-session).
     */
    private preferChinaNow;
    private installArchive;
    private downloadAndExtractArchive;
    /**
     * Same validation used for status, recognizer paths, and download skipping.
     * Directory specs must match their pinned members; other files must be nonempty.
     */
    private locationState;
    private archiveLocations;
    /** Catalog files that come out of this tar, including mirror URLs with the same name. */
    private specsSharingArchive;
    private archiveOutputReady;
    private reusableArchive;
    /**
     * Serialize publication and archive deletion across ModelManager instances.
     * The in-memory inflight map does not cover the desktop host and the worker.
     */
    private withArchiveLock;
    /**
     * Drop a stale marker unless another attempt already published a valid tree.
     * Returns true when this caller should not extract.
     */
    private prepareArchiveAttempt;
    /**
     * Delete an archive that failed to produce a valid tree. A live peer's
     * staging directory and a tree someone else just published are left alone.
     */
    private discardFailedArchive;
    private extractPublishedArchive;
    private stagedArchiveIssue;
    /**
     * Move validated top-level archive directories into the models directory.
     * If another attempt already published a valid tree, leave that tree in place.
     */
    private publishStagedArchive;
    private rethrowArchiveAbort;
    private pruneWhisperFp32;
    private remoteContentLength;
    /**
     * Deduplicate writes to the same dest so two models can share VAD/speaker files.
     */
    private downloadUrl;
    /**
     * Stream one URL to disk and record per-file progress for concurrent transfers.
     */
    private downloadUrlUnlocked;
    /**
     * Notify listeners of download progress, throttled unless `force` is set.
     *
     * @param force Emit even if the throttle window has not elapsed.
     */
    private emitProgress;
}
