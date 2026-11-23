import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Str from "effect/String";
import { DesktopApp } from "../../App.service.js";
import { AppHost } from "../../AppHost.service.js";
import type { AppOperations } from "../../App.service.js";
import type { AppHostOperations } from "../../AppHost.service.js";
import type { NativeRetention } from "../../NativeFoundation.model.js";

/** Implements application sequencing over independently adapted native primitives. Retry uses the same preparation engine; it does not transfer ownership of that engine to the foundation runtime.
 * **Example** (Read sequential downloader readiness)
 * ```ts
 * import { makeApp } from './app-service.js'
 * import type { AppHostOperations } from '../../AppHost.service.js'
 * export const readiness = (host:AppHostOperations) => makeApp(host).getDownloaderStatus
 * // ffmpeg readiness settles before the synchronous yt-dlp readiness read.
 * ```
 * @category constructors
 * @since 0.0.0
 */
export const makeApp = (host: AppHostOperations): AppOperations => ({
  getVersion: host.version,
  getPlatform: host.platform,
  getYtDlpKernelStatus: host.kernelStatus,
  quit: host.quit,
  showMessageBox: host.messageBox,
  getDownloaderStatus: Effect.gen(function* () {
    const ffmpegReady = yield* host.ffmpegReady;
    const ytdlpReady = yield* host.ytdlpReady;
    return { ytdlpReady, ffmpegReady };
  }),
  retryYtDlpKernelPreparation: Effect.gen(function* () {
    const kernel = yield* host.acquireKernel;
    yield* kernel.prepare;
    return yield* kernel.status;
  }),
  getOsVersion: Effect.gen(function* () {
    const platform = yield* host.platform;
    const platformLabel =
      platform === "darwin" ? "macOS" : platform === "win32" ? "Windows" : platform === "linux" ? "Linux" : platform;
    const systemVersion = yield* host.systemVersion;
    if (platform === "win32") {
      const buildNumber = Number.parseInt(Str.split(systemVersion, ".").at(-1) ?? "", 10);
      const windowsName = Number.isFinite(buildNumber) && buildNumber >= 22_000 ? "Windows 11" : "Windows 10";
      return Number.isFinite(buildNumber)
        ? `${windowsName} (build ${buildNumber})`
        : Str.trim(`${platformLabel} ${systemVersion}`);
    }
    return Str.trim(`${platformLabel} ${systemVersion}`);
  }),
  getSiteIcon: Effect.fn("App.getSiteIcon")(function* (domain: string, retention?: NativeRetention) {
    const trimmed = Str.toLowerCase(Str.trim(domain));
    const first = Str.split(trimmed, "/")[0];
    const normalized = (first === undefined ? undefined : Str.trim(first)) || trimmed;
    const urls = [`https://${normalized}/favicon.ico`, `https://favicon.im/${encodeURIComponent(normalized)}`];
    for (const url of urls) {
      const image = yield* host
        .fetchIcon(url, retention)
        .pipe(
          Effect.catch((error) =>
            Effect.as(
              Effect.logError(`Failed to fetch site icon for ${domain}: ${String(error.original)}`).pipe(
                Effect.annotateLogs("electron-log.scope", "system")
              ),
              null
            )
          )
        );
      if (image !== null) return image;
    }
    return null;
  }),
});
/** Supplies the application implementation without performing native work during layer acquisition.
 * **Example** (Build the application layer with a driver)
 * ```ts
 * import { AppLive } from './app-service.js'
 * import * as Layer from 'effect/Layer'
 * export const acquire = Layer.build(AppLive)
 * // Supply AppHost and an application scope.
 * ```
 * @category layers
 * @since 0.0.0
 */
export const AppLive = Layer.effect(DesktopApp)(
  Effect.map(AppHost, (host) => ({ forCall: (call) => makeApp(host.forCall(call)) }))
);
