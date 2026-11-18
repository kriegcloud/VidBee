import type { SourceAdmission } from '@vidbee/task-queue-legacy/source-admission';
import type { SocialMappedItem } from './social-media-service';
/** yt-dlp exposes CDN URLs in flat entries; save only canonical watch pages. */
export declare const mapRedGifsProfile: (url: string, resolveYtDlpPath: () => string, admission: SourceAdmission | undefined, signal: AbortSignal, onItem: (item: SocialMappedItem) => void) => Promise<{
    complete: boolean;
    error?: string;
}>;
