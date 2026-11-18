import { EventEmitter } from 'node:events';
import type { CreateDownloadInput, DownloadRuntimeSettings, DownloadTask, PlaylistDownloadInput, PlaylistDownloadResult, PlaylistInfo, VideoInfo } from './types';
export interface DownloaderCoreOptions {
    downloadDir?: string;
    maxConcurrent?: number;
    runtimeSettings?: DownloadRuntimeSettings;
}
export declare class DownloaderCore extends EventEmitter {
    private readonly maxConcurrent;
    private readonly downloadDir;
    private readonly defaultRuntimeSettings;
    private readonly jsRuntimeArgs;
    private readonly tasks;
    private readonly taskInputs;
    private readonly active;
    private readonly pending;
    private readonly history;
    private readonly cancelled;
    private ytdlp;
    private ffmpegLocation;
    constructor(options?: DownloaderCoreOptions);
    initialize(): Promise<void>;
    private getYtDlp;
    private publishHistory;
    private resolveRuntimeSettings;
    private updateTask;
    private runJsonCommand;
    getVideoInfo(url: string, runtimeSettings?: DownloadRuntimeSettings): Promise<VideoInfo>;
    getPlaylistInfo(url: string, runtimeSettings?: DownloadRuntimeSettings): Promise<PlaylistInfo>;
    startPlaylistDownload(input: PlaylistDownloadInput): Promise<PlaylistDownloadResult>;
    createDownload(input: CreateDownloadInput): Promise<DownloadTask>;
    private processQueue;
    cancelDownload(id: string): Promise<boolean>;
    removeHistoryItems(ids: string[]): number;
    removeHistoryByPlaylist(playlistId: string): number;
    listDownloads(): DownloadTask[];
    listHistory(): DownloadTask[];
    getStatus(): {
        active: number;
        pending: number;
    };
}
