import { LiteralKit } from "@vidbee/schema/LiteralKit";

export const FacebookMapCategory = LiteralKit(["photos", "albums", "reels"]);
export const DownloadMediaType = LiteralKit(["audio", "video"]);
export const OnlyFansFeed = LiteralKit(["messages", "media"]);
export const SnapchatUrlKind = LiteralKit(["profile", "stories", "spotlights", "story-snap", "spotlight"]);
export const SnapchatMapCategory = LiteralKit(["stories", "spotlight"]);
export const ThreadsUrlKind = LiteralKit(["post", "profile"]);
export const VscoUrlKind = LiteralKit(["gallery", "media", "video"]);
export const SubtitleSkipReason = LiteralKit(["auth-required", "automatic-captions-disabled"]);
export const ProcessOutputEnd = LiteralKit(["stdoutEnd", "stderrEnd"]);
export const TerminationSignal = LiteralKit(["SIGTERM", "SIGKILL"]);
export const ProcessOutputChannel = LiteralKit(["stdout", "stderr"]);
export const GalleryOutputFailureKind = LiteralKit(["unknown", "output-missing"]);
export const SubtitleVisibility = LiteralKit(["public", "private", "unlisted"]);
export const YtDlpPreflightFailureKind = LiteralKit(["unknown", "binary-missing"]);

export const SubtitleSourceKeys = LiteralKit(["type", "url"]);
export const InstagramInspectionKeys = LiteralKit([
  "inspectionId",
  "profile",
  "totalSourceCount",
  "totalAssetCount",
  "mapping",
]);
