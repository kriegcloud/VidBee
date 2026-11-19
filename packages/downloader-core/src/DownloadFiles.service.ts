import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { HostFailure } from "./Downloader.errors.js";
import type { FileStat } from "./DownloadFiles.model.js";

/** File operations retain separate probe, read and write failure policies. */
export class DownloadFiles extends Context.Service<
  DownloadFiles,
  {
    readonly read: (path: string) => Effect.Effect<string, HostFailure>;
    readonly exists: (path: string) => Effect.Effect<boolean>;
    readonly stat: (path: string) => Effect.Effect<FileStat, HostFailure>;
    readonly write: (path: string, text: string, mode?: number) => Effect.Effect<void, HostFailure>;
    readonly makeDirectory: (path: string, recursive: boolean, mode?: number) => Effect.Effect<void, HostFailure>;
    readonly makeTempDirectory: (prefix: string) => Effect.Effect<string, HostFailure>;
    readonly rename: (source: string, target: string) => Effect.Effect<void, HostFailure>;
    readonly readDirectory: (path: string) => Effect.Effect<ReadonlyArray<string>, HostFailure>;
    readonly remove: (path: string, recursive: boolean) => Effect.Effect<void, HostFailure>;
    readonly chmod: (path: string, mode: number) => Effect.Effect<void, HostFailure>;
  }
>()("@vidbee/downloader-core/DownloadFiles.service/DownloadFiles") {}
