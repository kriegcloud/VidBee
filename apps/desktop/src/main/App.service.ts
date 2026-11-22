import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { DownloaderStatus, MessageBoxOptions, MessageBoxResult } from "../shared/App.model.js";
import type { YtDlpKernelStatus } from "../shared/types/ytdlp-kernel.js";
import type { OriginalFailure } from "./lib/OriginalFailure.errors.js";
import type { SynchronousCall } from "./lib/SynchronousHost.service.js";
import type { NativeMessageBoxOptions, NativeRetention } from "./NativeFoundation.model.js";
/** Application operations; retry and readiness sequencing live in the strict implementation.
 * @category type-level
 * @since 0.0.0
 */
export interface AppOperations {
  readonly getDownloaderStatus: Effect.Effect<DownloaderStatus, OriginalFailure>;
  readonly getOsVersion: Effect.Effect<string, OriginalFailure>;
  readonly getPlatform: Effect.Effect<string, OriginalFailure>;
  readonly getSiteIcon: (domain: string, retention?: NativeRetention) => Effect.Effect<string | null, OriginalFailure>;
  readonly getVersion: Effect.Effect<string, OriginalFailure>;
  readonly getYtDlpKernelStatus: Effect.Effect<YtDlpKernelStatus, OriginalFailure>;
  readonly quit: Effect.Effect<void, OriginalFailure>;
  readonly retryYtDlpKernelPreparation: Effect.Effect<YtDlpKernelStatus, OriginalFailure>;
  readonly showMessageBox: (
    options: MessageBoxOptions | NativeMessageBoxOptions
  ) => Effect.Effect<MessageBoxResult, OriginalFailure>;
}
/** Application contract over explicitly borrowed host access.
 * **Example** (Read application metadata)
 * ```ts
 * import { DesktopApp } from './App.service.js'
 * import type { SynchronousCall } from './lib/SynchronousHost.service.js'
 * export const version = (call:SynchronousCall) => DesktopApp.use(app => app.forCall(call).getVersion)
 * ```
 * @category services
 * @since 0.0.0
 */
export class DesktopApp extends Context.Service<
  DesktopApp,
  { readonly forCall: (call: SynchronousCall) => AppOperations }
>()("vidbee/main/App.service/DesktopApp") {}
