import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { HostFailure } from "./Capture.errors.js";
import type { CaptureFileInfo, DirectoryOptions, FileOptions, RemoveOptions, WriteOptions } from "./Host.model.js";

export type { DirectoryOptions, FileOptions, RemoveOptions, WriteOptions } from "./Host.model.js";
export class CaptureFiles extends Context.Service<
  CaptureFiles,
  {
    readonly readText: (path: string, options?: FileOptions) => Effect.Effect<string, HostFailure>;
    readonly readBytes: (path: string, options?: FileOptions) => Effect.Effect<Uint8Array, HostFailure>;
    readonly exists: (path: string) => Effect.Effect<boolean, HostFailure>;
    readonly stat: (path: string, options?: FileOptions) => Effect.Effect<CaptureFileInfo, HostFailure>;
    readonly list: (path: string, options?: FileOptions) => Effect.Effect<string[], HostFailure>;
    readonly mkdir: (path: string, options?: DirectoryOptions) => Effect.Effect<void, HostFailure>;
    readonly tempDirectory: (prefix: string, options?: FileOptions) => Effect.Effect<string, HostFailure>;
    readonly copy: (source: string, target: string, options?: FileOptions) => Effect.Effect<void, HostFailure>;
    readonly write: (
      path: string,
      data: string | Uint8Array,
      options?: WriteOptions
    ) => Effect.Effect<void, HostFailure>;
    readonly rename: (source: string, target: string, options?: FileOptions) => Effect.Effect<void, HostFailure>;
    readonly remove: (path: string, options?: RemoveOptions) => Effect.Effect<void, HostFailure>;
  }
>()("@vidbee/browser-capture/CaptureFiles.service/CaptureFiles") {}
