import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { MessageBoxOptions, MessageBoxResult } from "../shared/App.model.js";
import type { YtDlpKernelStatus } from "../shared/types/ytdlp-kernel.js";
import type { OriginalFailure } from "./lib/OriginalFailure.errors.js";
import type { SynchronousCall } from "./lib/SynchronousHost.service.js";
import type { NativeMessageBoxOptions, NativeRetention } from "./NativeFoundation.model.js";

/** Individually adapted host operations; sequencing and platform labeling belong to the application service.
 * @category type-level
 * @since 0.0.0
 */
export interface AppHostOperations {
  readonly acquireKernel: Effect.Effect<
    {
      readonly prepare: Effect.Effect<void, OriginalFailure>;
      readonly status: Effect.Effect<YtDlpKernelStatus, OriginalFailure>;
    },
    OriginalFailure
  >;
  readonly fetchIcon: (url: string, retention?: NativeRetention) => Effect.Effect<string | null, OriginalFailure>;
  readonly ffmpegReady: Effect.Effect<boolean, OriginalFailure>;
  readonly kernelStatus: Effect.Effect<YtDlpKernelStatus, OriginalFailure>;
  readonly messageBox: (
    options: MessageBoxOptions | NativeMessageBoxOptions
  ) => Effect.Effect<MessageBoxResult, OriginalFailure>;
  readonly platform: Effect.Effect<string, OriginalFailure>;
  readonly quit: Effect.Effect<void, OriginalFailure>;
  readonly systemVersion: Effect.Effect<string, OriginalFailure>;
  readonly version: Effect.Effect<string, OriginalFailure>;
  readonly ytdlpReady: Effect.Effect<boolean, OriginalFailure>;
}
/** Borrowed application host, supplied by the native driver at the historical composition point.
 * **Example** (Inspect the host version Effect)
 * ```ts
 * import { AppHost } from './AppHost.service.js'
 * import type { SynchronousCall } from './lib/SynchronousHost.service.js'
 * export const version = (call:SynchronousCall) => AppHost.use(host => host.forCall(call).version)
 * ```
 * @category services
 * @since 0.0.0
 */
export class AppHost extends Context.Service<
  AppHost,
  { readonly forCall: (call: SynchronousCall) => AppHostOperations }
>()("vidbee/main/AppHost.service/AppHost") {}
