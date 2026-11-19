import * as Effect from "effect/Effect";
import * as Str from "effect/String";
import { normalizeBrowserCookiesSettingForYtDlp } from "./yt-dlp-args.js";
import type { DownloadRuntimeSettings } from "./types.js";

export const buildGalleryDlRuntimeArgs = Effect.fn("DownloadArguments.gallery")(function* (
  settings?: DownloadRuntimeSettings
) {
  const args: string[] = [];
  const browser = yield* normalizeBrowserCookiesSettingForYtDlp(settings?.browserForCookies);
  if (browser !== "" && browser !== "none") args.push("--cookies-from-browser", browser);
  const cookiesPath = Str.trim(settings?.cookiesPath ?? "");
  if (cookiesPath !== "") args.push("--cookies", cookiesPath);
  const proxy = Str.trim(settings?.proxy ?? "");
  if (proxy !== "") args.push("--proxy", proxy);
  return args;
});
