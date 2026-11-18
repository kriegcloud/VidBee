import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { HostFailure } from "./Downloader.errors.js";

/** Host defaults are supplied at the old call position by each host implementation. */
export class DownloadHost extends Context.Service<
  DownloadHost,
  {
    readonly platform: () => string;
    readonly homeDirectory: () => string;
    readonly tempDirectory: () => string;
    readonly environment: () => Readonly<Record<string, string | undefined>>;
    readonly setEnvironment: (key: string, value: string) => Effect.Effect<void, HostFailure>;
    readonly makeAbortController: () => AbortController;
    readonly uuid: () => string;
  }
>()("@vidbee/downloader-core/DownloadHost.service/DownloadHost") {}
