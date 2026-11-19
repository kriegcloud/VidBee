import * as Context from "effect/Context";
import type { ExecutorContext } from "@vidbee/task-queue/Executor.model";
import type * as Effect from "effect/Effect";
import type { HostFailure } from "./Downloader.errors.js";
import type { ProcessSpec } from "./Process.model.js";

export interface GalleryCommand {
  readonly args: string[];
  readonly configuredOutputDirectory: string;
  readonly expectedAssetCount: number;
  readonly outputDirectory: string;
  readonly profileCategory: boolean;
  readonly social: boolean;
  readonly unsupported: boolean;
}
export interface GalleryInspection {
  readonly firstFileSize: number;
  readonly invalidCount: number;
  readonly totalSize: number;
}
export class GalleryDlExecutorHost extends Context.Service<
  GalleryDlExecutorHost,
  {
    readonly now: () => number;
    readonly parseDate: (value: string) => number;
    readonly killGraceMs: number;
    readonly platform: () => string;
    readonly command: (context: ExecutorContext) => Effect.Effect<GalleryCommand>;
    readonly binary: Effect.Effect<string, HostFailure>;
    readonly spec: (binary: string, args: readonly string[]) => Effect.Effect<ProcessSpec>;
    readonly inspect: (paths: string[]) => Effect.Effect<GalleryInspection, HostFailure>;
    readonly socialManifest: (
      directory: string
    ) => Effect.Effect<
      { readonly directory: string; readonly manifest: string; readonly isFile: boolean },
      HostFailure
    >;
  }
>()("@vidbee/downloader-core/GalleryDlExecutorHost.service/GalleryDlExecutorHost") {}
