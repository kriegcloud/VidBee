import * as Context from "effect/Context";
import type { DownloadQueueOperations } from "@vidbee/downloader-core/DownloadQueue.service";
import type { OnlyFansCommand, OnlyFansDownload, OnlyFansProfile } from "@vidbee/downloader-core/onlyfans-profile";
import type * as Effect from "effect/Effect";
import type { CaptureError, HostFailure } from "./Capture.errors.js";
import type { BrowserProfileAdapter } from "./onlyfans-profile.js";
export class ProfileQueue extends Context.Service<ProfileQueue, DownloadQueueOperations>()(
  "@vidbee/browser-capture/BrowserProfiles.service/ProfileQueue"
) {}
export class ProfileCodec extends Context.Service<
  ProfileCodec,
  {
    readonly read: (text: string) => Effect.Effect<OnlyFansProfile, CaptureError>;
    readonly command: (input: OnlyFansCommand) => Effect.Effect<OnlyFansCommand, CaptureError>;
    readonly download: (input: OnlyFansDownload) => Effect.Effect<OnlyFansDownload, CaptureError>;
  }
>()("@vidbee/browser-capture/BrowserProfiles.service/ProfileCodec") {}
export class ProfileHost extends Context.Service<
  ProfileHost,
  {
    readonly defaultDirectory: Effect.Effect<string, HostFailure>;
    readonly delay: (ms: number, signal: AbortSignal) => Effect.Effect<void, HostFailure>;
  }
>()("@vidbee/browser-capture/BrowserProfiles.service/ProfileHost") {}
export interface ProfileOptions {
  readonly adapter: BrowserProfileAdapter;
  readonly storageDir: string;
}
export interface TransferSink {
  readonly emit: (bytes: number, total: number) => Effect.Effect<void>;
}
export interface BrowserProfilesShape {
  readonly command: (input: OnlyFansCommand) => Effect.Effect<OnlyFansProfile, CaptureError>;
  readonly download: (
    profileUrl: string,
    mediaId: string,
    destination: string,
    signal: AbortSignal,
    sink: TransferSink
  ) => Effect.Effect<{ filePath: string; size: number }, CaptureError>;
  readonly enqueue: (
    queue: DownloadQueueOperations,
    input: OnlyFansDownload
  ) => Effect.Effect<{ count: number }, CaptureError>;
  readonly get: (url: string) => Effect.Effect<OnlyFansProfile, CaptureError>;
  readonly list: Effect.Effect<OnlyFansProfile[], CaptureError>;
  readonly stop: Effect.Effect<void, CaptureError>;
}
export class BrowserProfiles extends Context.Service<BrowserProfiles, BrowserProfilesShape>()(
  "@vidbee/browser-capture/BrowserProfiles.service/BrowserProfiles"
) {}
