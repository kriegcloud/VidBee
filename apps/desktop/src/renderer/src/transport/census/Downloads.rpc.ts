import * as C from "@vidbee/downloader-core/Cookie.model";
import * as D from "@vidbee/downloader-core/Download.model";
import * as OF from "@vidbee/downloader-core/onlyfans-profile";
import * as P from "@vidbee/downloader-core/Profile.model";
import * as Inventory from "@vidbee/downloader-core/ProfilePersistence.model";
import * as Social from "@vidbee/downloader-core/social-media";
import { $DesktopId } from "@vidbee/identity/packages";
import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as Q from "@vidbee/task-queue/Task.model";
import * as Predicate from "effect/Predicate";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";
import * as S from "effect/Schema";
import { DeliveryError } from "../DocumentDelivery.errors.js";
import { Completion, Subscription, Token } from "../DocumentDelivery.model.js";
import { RpcArray, RpcOptional } from "../RpcField.model.js";
import { ObservedValue, RpcObserved } from "../RpcObservation.model.js";

const $I = $DesktopId.create("shared/Downloads.model");
export const DownloadStatus = LiteralKit([
  "pending",
  "downloading",
  "processing",
  "completed",
  "error",
  "cancelled",
]).pipe($I.annoteSchema("DownloadStatus", { description: "Desktop projected status." }));
export class VideoFormat extends S.Opaque<VideoFormat, { readonly brand: unique symbol }>()(
  S.StructWithRest(
    S.Struct({
      format_id: S.String.pipe(S.mutableKey),
      ext: S.String.pipe(S.mutableKey),
      height: ObservedValue.pipe(RpcOptional),
      width: ObservedValue.pipe(RpcOptional),
      fps: ObservedValue.pipe(RpcOptional),
      vcodec: ObservedValue.pipe(RpcOptional),
      acodec: ObservedValue.pipe(RpcOptional),
      filesize: ObservedValue.pipe(RpcOptional),
      filesize_approx: ObservedValue.pipe(RpcOptional),
      format_note: ObservedValue.pipe(RpcOptional),
      video_ext: ObservedValue.pipe(RpcOptional),
      audio_ext: ObservedValue.pipe(RpcOptional),
      tbr: ObservedValue.pipe(RpcOptional),
      quality: ObservedValue.pipe(RpcOptional),
      protocol: ObservedValue.pipe(RpcOptional),
      language: ObservedValue.pipe(RpcOptional),
    }),
    [S.Record(S.String, S.Unknown)]
  ).pipe(RpcObserved, $I.annoteSchema("VideoFormat", { description: "Desktop VideoFormat boundary value." }))
) {}
export class VideoInfo extends S.Opaque<VideoInfo, { readonly brand: unique symbol }>()(
  S.StructWithRest(
    S.Struct({
      id: S.String.pipe(S.mutableKey),
      title: S.String.pipe(S.mutableKey),
      thumbnail: ObservedValue.pipe(RpcOptional),
      duration: ObservedValue.pipe(RpcOptional),
      formats: RpcArray(VideoFormat).pipe(S.mutable, S.mutableKey),
      extractor_key: ObservedValue.pipe(RpcOptional),
      webpage_url: ObservedValue.pipe(RpcOptional),
      description: ObservedValue.pipe(RpcOptional),
      view_count: ObservedValue.pipe(RpcOptional),
      uploader: ObservedValue.pipe(RpcOptional),
    }),
    [S.Record(S.String, S.Unknown)]
  ).pipe(RpcObserved, $I.annoteSchema("VideoInfo", { description: "Desktop VideoInfo boundary value." }))
) {}
export class DownloadOptions extends S.Opaque<DownloadOptions, { readonly brand: unique symbol }>()(
  S.Struct({
    batchId: S.String.pipe(RpcOptional),
    batchTitle: S.String.pipe(RpcOptional),
    batchOrder: S.Finite.pipe(RpcOptional),
    socialMedia: Social.SocialMediaOptionsSchema.pipe(S.toEncoded, RpcObserved, RpcOptional),
    singleVideo: S.Boolean.pipe(RpcOptional),
    url: S.String.pipe(S.mutableKey),
    type: D.DownloadType.pipe(S.mutableKey),
    format: S.String.pipe(RpcOptional),
    audioFormat: S.String.pipe(RpcOptional),
    audioFormatIds: RpcArray(S.String).pipe(S.mutable, RpcOptional),
    startTime: S.String.pipe(RpcOptional),
    endTime: S.String.pipe(RpcOptional),
    downloadSubs: S.Boolean.pipe(RpcOptional),
    customDownloadPath: S.String.pipe(RpcOptional),
    customFilenameTemplate: S.String.pipe(RpcOptional),
    containerFormat: S.Literals(["auto", "mp4", "mkv", "webm", "mov"]).pipe(RpcOptional),
    tags: RpcArray(S.String).pipe(S.mutable, RpcOptional),
    origin: Q.TaskOrigin.pipe(RpcOptional),
    subscriptionId: S.String.pipe(RpcOptional),
    title: ObservedValue.pipe(RpcOptional),
    thumbnail: ObservedValue.pipe(RpcOptional),
    description: ObservedValue.pipe(RpcOptional),
    channel: ObservedValue.pipe(RpcOptional),
    uploader: ObservedValue.pipe(RpcOptional),
    viewCount: ObservedValue.pipe(RpcOptional),
    duration: ObservedValue.pipe(RpcOptional),
    selectedFormat: ObservedValue.pipe(RpcOptional),
  }).pipe($I.annoteSchema("DownloadOptions", { description: "Desktop DownloadOptions boundary value." }))
) {}
export class PlaylistEntry extends S.Opaque<PlaylistEntry, { readonly brand: unique symbol }>()(
  S.Struct({
    id: S.String.pipe(S.mutableKey),
    title: S.String.pipe(S.mutableKey),
    url: S.String.pipe(S.mutableKey),
    index: S.Finite.pipe(S.mutableKey),
    thumbnail: S.String.pipe(RpcOptional),
    mediaKind: D.PlaylistMediaKind.pipe(RpcOptional),
  }).pipe($I.annoteSchema("PlaylistEntry", { description: "Desktop PlaylistEntry boundary value." }))
) {}
export class PlaylistInfo extends S.Opaque<PlaylistInfo, { readonly brand: unique symbol }>()(
  S.Struct({
    id: S.String.pipe(S.mutableKey),
    title: S.String.pipe(S.mutableKey),
    entries: RpcArray(PlaylistEntry).pipe(S.mutable, S.mutableKey),
    entryCount: S.Finite.pipe(S.mutableKey),
  }).pipe($I.annoteSchema("PlaylistInfo", { description: "Desktop PlaylistInfo boundary value." }))
) {}
export class PlaylistDownloadOptions extends S.Opaque<PlaylistDownloadOptions, { readonly brand: unique symbol }>()(
  S.Struct({
    url: S.String.pipe(S.mutableKey),
    type: D.DownloadType.pipe(S.mutableKey),
    format: S.String.pipe(RpcOptional),
    entryIds: RpcArray(S.String).pipe(S.mutable, RpcOptional),
    startIndex: S.Finite.pipe(RpcOptional),
    endIndex: S.Finite.pipe(RpcOptional),
    filenameFormat: S.String.pipe(RpcOptional),
    folderFormat: S.String.pipe(RpcOptional),
    customDownloadPath: S.String.pipe(RpcOptional),
    containerFormat: S.Literals(["auto", "mp4", "mkv", "webm", "mov"]).pipe(RpcOptional),
  }).pipe(
    $I.annoteSchema("PlaylistDownloadOptions", { description: "Desktop PlaylistDownloadOptions boundary value." })
  )
) {}
export class PlaylistDownloadEntry extends S.Opaque<PlaylistDownloadEntry, { readonly brand: unique symbol }>()(
  S.Struct({
    downloadId: S.String.pipe(S.mutableKey),
    entryId: S.String.pipe(S.mutableKey),
    title: S.String.pipe(S.mutableKey),
    url: S.String.pipe(S.mutableKey),
    index: S.Finite.pipe(S.mutableKey),
  }).pipe($I.annoteSchema("PlaylistDownloadEntry", { description: "Desktop PlaylistDownloadEntry boundary value." }))
) {}
export class PlaylistDownloadResult extends S.Opaque<PlaylistDownloadResult, { readonly brand: unique symbol }>()(
  S.Struct({
    groupId: S.String.pipe(S.mutableKey),
    playlistId: S.String.pipe(S.mutableKey),
    playlistTitle: S.String.pipe(S.mutableKey),
    type: D.DownloadType.pipe(S.mutableKey),
    totalCount: S.Finite.pipe(S.mutableKey),
    startIndex: S.Finite.pipe(S.mutableKey),
    endIndex: S.Finite.pipe(S.mutableKey),
    entries: RpcArray(PlaylistDownloadEntry).pipe(S.mutable, S.mutableKey),
  }).pipe($I.annoteSchema("PlaylistDownloadResult", { description: "Desktop PlaylistDownloadResult boundary value." }))
) {}
export const ObservedNumber = S.declare(Predicate.isNumber).pipe(
  RpcObserved,
  $I.annoteSchema("ObservedNumber", { description: "A retained numeric projector observation, including NaN." })
);
export class DownloadProgress extends S.Opaque<DownloadProgress, { readonly brand: unique symbol }>()(
  S.Struct({
    percent: ObservedNumber.pipe(S.mutableKey),
    indeterminate: S.Boolean.pipe(RpcOptional),
    currentSpeed: S.String.pipe(RpcOptional),
    eta: S.String.pipe(RpcOptional),
    downloaded: S.String.pipe(RpcOptional),
    total: S.String.pipe(RpcOptional),
  }).pipe(
    $I.annoteSchema("DownloadProgress", { description: "Renderer progress with original optional property presence." })
  )
) {}
export class DownloadItem extends S.Opaque<DownloadItem, { readonly brand: unique symbol }>()(
  S.Struct({
    sourceMediaKind: ObservedValue.pipe(RpcOptional),
    collectionSummary: ObservedValue.pipe(RpcOptional),
    id: S.String.pipe(S.mutableKey),
    url: S.String.pipe(S.mutableKey),
    title: S.Unknown.pipe(S.mutableKey),
    type: D.DownloadType.pipe(S.mutableKey),
    status: DownloadStatus.pipe(S.mutableKey),
    createdAt: S.Finite.pipe(S.mutableKey),
    thumbnail: ObservedValue.pipe(RpcOptional),
    startedAt: ObservedValue.pipe(RpcOptional),
    completedAt: ObservedValue.pipe(RpcOptional),
    duration: ObservedValue.pipe(RpcOptional),
    fileSize: ObservedValue.pipe(RpcOptional),
    savedFileName: ObservedValue.pipe(RpcOptional),
    filePath: ObservedValue.pipe(RpcOptional),
    resolvedFormatId: ObservedValue.pipe(RpcOptional),
    subtitleStatus: ObservedValue.pipe(RpcOptional),
    subtitleLanguages: ObservedValue.pipe(RpcOptional),
    cookieSources: ObservedValue.pipe(RpcOptional),
    configuredCookieSources: ObservedValue.pipe(RpcOptional),
    speed: ObservedValue.pipe(RpcOptional),
    description: ObservedValue.pipe(RpcOptional),
    channel: ObservedValue.pipe(RpcOptional),
    uploader: ObservedValue.pipe(RpcOptional),
    viewCount: ObservedValue.pipe(RpcOptional),
    tags: ObservedValue.pipe(RpcOptional),
    playlistId: ObservedValue.pipe(RpcOptional),
    playlistTitle: ObservedValue.pipe(RpcOptional),
    playlistIndex: ObservedValue.pipe(RpcOptional),
    playlistSize: ObservedValue.pipe(RpcOptional),
    mediaKind: ObservedValue.pipe(RpcOptional),
    batchId: ObservedValue.pipe(RpcOptional),
    batchKind: ObservedValue.pipe(RpcOptional),
    batchTitle: ObservedValue.pipe(RpcOptional),
    batchCategory: ObservedValue.pipe(RpcOptional),
    batchOrder: ObservedValue.pipe(RpcOptional),
    batchSourceCount: ObservedValue.pipe(RpcOptional),
    batchAssetCount: ObservedValue.pipe(RpcOptional),
    outputDirectory: ObservedValue.pipe(RpcOptional),
    fileCount: ObservedValue.pipe(RpcOptional),
    downloadedCount: ObservedValue.pipe(RpcOptional),
    skippedCount: ObservedValue.pipe(RpcOptional),
    failedCount: ObservedValue.pipe(RpcOptional),
    totalSize: ObservedValue.pipe(RpcOptional),
    error: ObservedValue.pipe(RpcOptional),
    origin: Q.TaskOrigin.pipe(RpcOptional),
    agentConversation: Q.TaskCreationMetadata.fields.agentConversation.pipe(RpcOptional),
    parentId: S.String.pipe(RpcOptional),
    taskKind: Q.TaskKind.pipe(RpcOptional),
    subscriptionId: ObservedValue.pipe(RpcOptional),
    selectedFormat: ObservedValue.pipe(RpcOptional),
    ytDlpCommand: S.String.pipe(RpcOptional),
    ytDlpLog: S.String.pipe(RpcOptional),
    progress: DownloadProgress.pipe(RpcOptional),
    internalStatus: Q.TaskStatus.pipe(RpcOptional),
    statusReason: S.String.pipe(RpcOptional),
    subStatus: S.Literals(["paused", "retry-scheduled"]).pipe(RpcOptional),
    nextRetryAt: S.Finite.pipe(RpcOptional),
    attempt: S.Finite.pipe(RpcOptional),
    maxAttempts: S.Finite.pipe(RpcOptional),
    errorCategory: Q.ErrorCategory.pipe(RpcOptional),
  }).pipe($I.annoteSchema("DownloadItem", { description: "Desktop DownloadItem boundary value." }))
) {}
export class DownloadHistoryItem extends S.Opaque<DownloadHistoryItem, { readonly brand: unique symbol }>()(
  S.Struct({
    sourceMediaKind: ObservedValue.pipe(RpcOptional),
    collectionSummary: ObservedValue.pipe(RpcOptional),
    id: S.String.pipe(S.mutableKey),
    url: S.String.pipe(S.mutableKey),
    title: S.Unknown.pipe(S.mutableKey),
    type: D.DownloadType.pipe(S.mutableKey),
    status: DownloadStatus.pipe(S.mutableKey),
    thumbnail: ObservedValue.pipe(RpcOptional),
    startedAt: ObservedValue.pipe(RpcOptional),
    completedAt: ObservedValue.pipe(RpcOptional),
    duration: ObservedValue.pipe(RpcOptional),
    fileSize: ObservedValue.pipe(RpcOptional),
    savedFileName: ObservedValue.pipe(RpcOptional),
    filePath: ObservedValue.pipe(RpcOptional),
    resolvedFormatId: ObservedValue.pipe(RpcOptional),
    subtitleStatus: ObservedValue.pipe(RpcOptional),
    subtitleLanguages: ObservedValue.pipe(RpcOptional),
    cookieSources: ObservedValue.pipe(RpcOptional),
    configuredCookieSources: ObservedValue.pipe(RpcOptional),
    description: ObservedValue.pipe(RpcOptional),
    channel: ObservedValue.pipe(RpcOptional),
    uploader: ObservedValue.pipe(RpcOptional),
    viewCount: ObservedValue.pipe(RpcOptional),
    tags: ObservedValue.pipe(RpcOptional),
    playlistId: ObservedValue.pipe(RpcOptional),
    playlistTitle: ObservedValue.pipe(RpcOptional),
    playlistIndex: ObservedValue.pipe(RpcOptional),
    playlistSize: ObservedValue.pipe(RpcOptional),
    mediaKind: ObservedValue.pipe(RpcOptional),
    batchId: ObservedValue.pipe(RpcOptional),
    batchKind: ObservedValue.pipe(RpcOptional),
    batchTitle: ObservedValue.pipe(RpcOptional),
    batchCategory: ObservedValue.pipe(RpcOptional),
    batchOrder: ObservedValue.pipe(RpcOptional),
    batchSourceCount: ObservedValue.pipe(RpcOptional),
    batchAssetCount: ObservedValue.pipe(RpcOptional),
    outputDirectory: ObservedValue.pipe(RpcOptional),
    fileCount: ObservedValue.pipe(RpcOptional),
    downloadedCount: ObservedValue.pipe(RpcOptional),
    skippedCount: ObservedValue.pipe(RpcOptional),
    failedCount: ObservedValue.pipe(RpcOptional),
    totalSize: ObservedValue.pipe(RpcOptional),
    error: ObservedValue.pipe(RpcOptional),
    origin: Q.TaskOrigin.pipe(RpcOptional),
    agentConversation: Q.TaskCreationMetadata.fields.agentConversation.pipe(RpcOptional),
    parentId: S.String.pipe(RpcOptional),
    taskKind: Q.TaskKind.pipe(RpcOptional),
    subscriptionId: ObservedValue.pipe(RpcOptional),
    selectedFormat: ObservedValue.pipe(RpcOptional),
    ytDlpCommand: S.String.pipe(RpcOptional),
    ytDlpLog: S.String.pipe(RpcOptional),
    createdAt: S.Finite.pipe(RpcOptional),
    downloadedAt: S.Unknown.pipe(S.mutableKey),
    downloadPath: ObservedValue.pipe(RpcOptional),
  }).pipe($I.annoteSchema("DownloadHistoryItem", { description: "Desktop DownloadHistoryItem boundary value." }))
) {}
export class VideoInfoCommandResult extends S.Opaque<VideoInfoCommandResult, { readonly brand: unique symbol }>()(
  S.Struct({
    info: ObservedValue.pipe(RpcOptional),
    ytDlpCommand: S.String.pipe(S.mutableKey),
    error: S.String.pipe(RpcOptional),
  }).pipe($I.annoteSchema("VideoInfoCommandResult", { description: "Desktop VideoInfoCommandResult boundary value." }))
) {}
export class LocalPosterRequest extends S.Opaque<LocalPosterRequest, { readonly brand: unique symbol }>()(
  S.Struct({
    filePath: S.NullOr(S.String).pipe(RpcOptional),
    directory: S.NullOr(S.String).pipe(RpcOptional),
  }).pipe($I.annoteSchema("LocalPosterRequest", { description: "Desktop LocalPosterRequest boundary value." }))
) {}
export class PlayerAttachInput extends S.Opaque<PlayerAttachInput, { readonly brand: unique symbol }>()(
  S.Struct({
    filePath: S.String.pipe(S.mutableKey),
  }).pipe($I.annoteSchema("PlayerAttachInput", { description: "Desktop PlayerAttachInput boundary value." }))
) {}
export class PlayerAttachResult extends S.Opaque<PlayerAttachResult, { readonly brand: unique symbol }>()(
  S.Struct({
    playablePath: S.String.pipe(S.mutableKey),
    reason: S.String.pipe(RpcOptional),
  }).pipe($I.annoteSchema("PlayerAttachResult", { description: "Desktop PlayerAttachResult boundary value." }))
) {}
export class AppIconMenuState extends S.Opaque<AppIconMenuState, { readonly brand: unique symbol }>()(
  S.Struct({
    canNext: S.Boolean.pipe(S.mutableKey),
    canPrevious: S.Boolean.pipe(S.mutableKey),
    canToggle: S.Boolean.pipe(S.mutableKey),
    playing: S.Boolean.pipe(S.mutableKey),
  }).pipe($I.annoteSchema("AppIconMenuState", { description: "Desktop AppIconMenuState boundary value." }))
) {}
export class PathResult extends S.Opaque<PathResult, { readonly brand: unique symbol }>()(
  S.Struct({
    path: S.String.pipe(S.mutableKey),
  }).pipe($I.annoteSchema("PathResult", { description: "Desktop PathResult boundary value." }))
) {}
export class CountResult extends S.Opaque<CountResult, { readonly brand: unique symbol }>()(
  S.Struct({
    count: S.Finite.pipe(S.mutableKey),
  }).pipe($I.annoteSchema("CountResult", { description: "Desktop CountResult boundary value." }))
) {}
export class ExtensionSource extends S.Opaque<ExtensionSource, { readonly brand: unique symbol }>()(
  S.Struct({
    id: S.String.pipe(S.mutableKey),
    browser: S.String.pipe(S.mutableKey),
    variant: S.Literals(["dev", "store"]).pipe(RpcOptional),
    lastConnectedAt: S.Finite.pipe(RpcOptional),
    legacy: S.Boolean.pipe(RpcOptional),
    connected: S.Boolean.pipe(S.mutableKey),
    lastSeenAt: S.Finite.pipe(RpcOptional),
    sites: RpcArray(C.CookieSiteMatch).pipe(S.mutable, S.mutableKey),
  }).pipe($I.annoteSchema("ExtensionSource", { description: "Desktop ExtensionSource boundary value." }))
) {}
export class ExtensionConnection extends S.Opaque<ExtensionConnection, { readonly brand: unique symbol }>()(
  S.Struct({
    connected: S.Boolean.pipe(S.mutableKey),
    browser: S.String.pipe(RpcOptional),
    lastSeenAt: S.Finite.pipe(RpcOptional),
    sites: RpcArray(C.CookieSiteMatch).pipe(S.mutable, S.mutableKey),
    activeSourceId: S.String.pipe(RpcOptional),
    sources: RpcArray(ExtensionSource).pipe(S.mutable, S.mutableKey),
  }).pipe($I.annoteSchema("ExtensionConnection", { description: "Desktop ExtensionConnection boundary value." }))
) {}
export class Validation extends S.Opaque<Validation, { readonly brand: unique symbol }>()(
  S.Struct({
    valid: S.Boolean.pipe(S.mutableKey),
    reason: S.String.pipe(RpcOptional),
  }).pipe($I.annoteSchema("Validation", { description: "Desktop Validation boundary value." }))
) {}
export class ExportVideoSource extends S.Opaque<ExportVideoSource, { readonly brand: unique symbol }>()(
  S.Struct({
    url: S.String,
    label: S.String.pipe(RpcOptional),
  }).pipe($I.annoteSchema("ExportVideoSource", { description: "Desktop ExportVideoSource boundary value." }))
) {}
export class AgentArtifact extends S.Opaque<AgentArtifact, { readonly brand: unique symbol }>()(
  S.Struct({
    id: S.String,
    threadId: S.String,
    runId: S.String,
    sourceDownloadId: S.String.pipe(RpcOptional),
    kind: S.Literals(["image", "video"]),
    name: S.String,
    path: S.String,
    posterPath: S.String.pipe(RpcOptional),
    start: S.Finite,
    end: S.Finite.pipe(RpcOptional),
    width: S.Finite.pipe(RpcOptional),
    height: S.Finite.pipe(RpcOptional),
  }).pipe($I.annoteSchema("AgentArtifact", { description: "Existing share artifact links." }))
) {}
export class AgentSkillLabel extends S.Opaque<AgentSkillLabel, { readonly brand: unique symbol }>()(
  S.Struct({ name: S.String, label: S.String.pipe(RpcOptional) }).pipe(
    $I.annoteSchema("AgentSkillLabel", { description: "Saved skill label." })
  )
) {}
export const SharePayload = S.Union([
  S.Struct({
    kind: S.tag("caption"),
    coverSrc: S.String.pipe(S.NullOr, RpcOptional),
    durationMs: S.Finite.pipe(RpcOptional),
    quote: S.Struct({ after: S.String, before: S.String, endMs: S.Finite, quote: S.String, startMs: S.Finite }),
    sourceByline: S.String.pipe(S.NullOr, RpcOptional),
    sourceTitle: S.String.pipe(S.NullOr, RpcOptional),
    tagline: S.String,
  }),
  S.Struct({
    kind: S.tag("prompt"),
    artifacts: AgentArtifact.pipe(RpcArray, RpcOptional),
    runId: S.String.pipe(RpcOptional),
    coverSrc: S.String.pipe(S.NullOr, RpcOptional),
    markdown: S.String,
    promptTitle: S.String,
    sourceByline: S.String.pipe(S.NullOr, RpcOptional),
    sourceTitle: S.String.pipe(S.NullOr, RpcOptional),
    tagline: S.String,
    thinkingLabel: S.String.pipe(RpcOptional),
    userText: S.String.pipe(S.NullOr, RpcOptional),
    userSkills: AgentSkillLabel.pipe(RpcArray, RpcOptional),
  }),
]).pipe(
  S.toTaggedUnion("kind"),
  $I.annoteSchema("SharePayload", { description: "Existing caption or prompt share request." })
);
export type SharePayload = typeof SharePayload.Type;
export class MermaidPayload extends S.Opaque<MermaidPayload, { readonly brand: unique symbol }>()(
  S.Struct({ source: S.String, format: S.Literals(["svg", "png", "jpg"]), theme: S.Literals(["light", "dark"]) }).pipe(
    $I.annoteSchema("MermaidPayload", { description: "Existing diagram export." })
  )
) {}
export class MermaidImage extends S.Opaque<MermaidImage, { readonly brand: unique symbol }>()(
  S.Struct({ data: S.Uint8ArrayFromBase64, width: S.Finite, height: S.Finite }).pipe(
    $I.annoteSchema("MermaidImage", { description: "Rendered diagram bytes and dimensions." })
  )
) {}
export class ShareReady extends S.Opaque<ShareReady, { readonly brand: unique symbol }>()(
  S.Struct({
    requestId: S.Finite,
    width: S.Finite,
    height: S.Finite,
    error: S.String.pipe(RpcOptional),
    layout: S.Struct({
      width: S.Finite,
      height: S.Finite,
      padding: S.Finite,
      footerTop: S.Finite.pipe(RpcOptional),
      safeBreaks: RpcArray(S.Finite),
      preferredBreaks: RpcArray(S.Finite),
    }).pipe(RpcOptional),
    diagram: MermaidImage.pipe(RpcOptional),
  }).pipe($I.annoteSchema("ShareReady", { description: "Hidden renderer layout or diagram completion." }))
) {}
export const FailureKind = LiteralKit([
  "validation",
  "metadata",
  "profile",
  "cookie",
  "file",
  "process",
  "persistence",
  "capture",
]);
export class DownloadsFailure extends S.TaggedError<DownloadsFailure, { readonly brand: unique symbol }>(
  $I`DownloadsFailure`
)(
  "DownloadsFailure",
  { operation: S.String, message: S.String, kind: FailureKind },
  $I.annote("DownloadsFailure", { description: "Serializable desktop failure; original cause remains main-only." })
) {}
export const DownloadEvent = S.TaggedUnion({
  Queued: { item: DownloadItem },
  Updated: { id: S.String, updates: S.Record(S.String, ObservedValue) },
  Started: { id: S.String },
  Progress: { id: S.String, progress: DownloadProgress },
  Log: { id: S.String, chunk: S.String },
  Completed: { id: S.String },
  Error: { id: S.String, error: S.String },
  Cancelled: { id: S.String },
  Removed: { id: S.String },
}).pipe($I.annoteSchema("DownloadEvent", { description: "Ordered live application download notifications." }));
export type DownloadEvent = typeof DownloadEvent.Type;
export const DownloadsRpcs = RpcGroup.make(
  Rpc.make("Downloads.WatchDeeplink", {
    success: S.Struct({ url: S.String, type: S.Literals(["single", "playlist"]) }).pipe(RpcObserved, Subscription),
    error: S.Union([DownloadsFailure, DeliveryError]),
    stream: true,
  }),
  Rpc.make("Downloads.FanslyProfileCommand", {
    payload: { input: OF.OnlyFansCommandSchema.pipe(S.toEncoded, RpcObserved) },
    success: Completion({ success: OF.OnlyFansProfileSchema.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Downloads.ListFanslyProfiles", {
    success: Completion({ success: RpcArray(OF.OnlyFansProfileSchema).pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Downloads.DownloadFanslyProfile", {
    payload: { input: OF.OnlyFansDownloadSchema.pipe(RpcObserved) },
    success: Completion({ success: CountResult.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Downloads.OnlyFansProfileCommand", {
    payload: { input: OF.OnlyFansCommandSchema.pipe(S.toEncoded, RpcObserved) },
    success: Completion({ success: OF.OnlyFansProfileSchema.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Downloads.ListOnlyFansProfiles", {
    success: Completion({ success: RpcArray(OF.OnlyFansProfileSchema).pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Downloads.DownloadOnlyFansProfile", {
    payload: { input: OF.OnlyFansDownloadSchema.pipe(RpcObserved) },
    success: Completion({ success: CountResult.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Downloads.InspectSocialMedia", {
    payload: { url: S.String },
    success: Completion({
      success: S.Struct({ source: Social.SocialSourceSchema, preview: Social.SocialMediaPreviewSchema }).pipe(
        RpcObserved
      ),
      error: DownloadsFailure,
    }),
    error: DeliveryError,
  }),
  Rpc.make("Downloads.OpenSocialProfileLogin", {
    payload: { url: S.String },
    success: Completion({ success: S.Void.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Downloads.GetSocialProfile", {
    payload: { url: S.String },
    success: Completion({ success: Inventory.SocialMappedProfile.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Downloads.StopSocialProfile", {
    payload: { url: S.String },
    success: Completion({ success: Inventory.SocialMappedProfile.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Downloads.ResolveUrl", {
    payload: { url: S.String },
    success: Completion({ success: S.String.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Downloads.GetVideoInfo", {
    payload: { url: S.String },
    success: Completion({ success: ObservedValue.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Downloads.GetVideoInfoWithCommand", {
    payload: { url: S.String },
    success: Completion({ success: VideoInfoCommandResult.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Downloads.GetPlaylistInfo", {
    payload: { url: S.String },
    success: Completion({ success: PlaylistInfo.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Downloads.CancelInstagramProfileMapping", {
    payload: { url: S.String },
    success: Completion({ success: S.Boolean.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Downloads.ListSocialProfiles", {
    success: Completion({
      success: RpcArray(Inventory.SocialMappedProfile).pipe(RpcObserved),
      error: DownloadsFailure,
    }),
    error: DeliveryError,
  }),
  Rpc.make("Downloads.MapSocialProfile", {
    payload: { url: S.String, category: S.String },
    success: Completion({ success: Inventory.SocialMappedProfile.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Downloads.DownloadSocialProfileItems", {
    payload: { url: S.String, category: S.String, ids: RpcArray(S.String), destination: S.String.pipe(RpcOptional) },
    success: Completion({ success: CountResult.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Downloads.DownloadSocialMedia", {
    payload: {
      request: S.Struct({
        url: S.String,
        categories: RpcArray(S.String).pipe(RpcOptional),
        options: Social.SocialMediaOptionsSchema.pipe(S.toEncoded, RpcObserved, RpcOptional),
        customDownloadPath: S.String.pipe(RpcOptional),
        settings: D.DownloadRuntimeSettings.pipe(RpcObserved, RpcOptional),
      }),
    },
    success: Completion({
      success: S.Struct({ groupId: S.String, ids: RpcArray(S.String) }).pipe(RpcObserved),
      error: DownloadsFailure,
    }),
    error: DeliveryError,
  }),
  Rpc.make("Downloads.ListInstagramProfiles", {
    success: Completion({
      success: RpcArray(
        S.Struct({
          inspectionId: P.InstagramProfileInspection.fields.inspectionId,
          profile: P.InstagramProfileInspection.fields.profile,
          totalSourceCount: S.Finite,
          totalAssetCount: S.Finite,
          mapping: P.InstagramProfileInspection.fields.mapping,
        })
      ).pipe(RpcObserved),
      error: DownloadsFailure,
    }),
    error: DeliveryError,
  }),
  Rpc.make("Downloads.InspectInstagramProfile", {
    payload: { url: S.String, categories: RpcArray(P.InstagramProfileCategory).pipe(RpcOptional) },
    success: Completion({ success: P.InstagramProfileInspection.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Downloads.StartDownload", {
    payload: { id: S.String, options: DownloadOptions },
    success: Completion({ success: S.Boolean.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Downloads.CancelDownload", {
    payload: { id: S.String },
    success: Completion({ success: S.Boolean.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Downloads.PauseDownload", {
    payload: { id: S.String },
    success: Completion({ success: S.Boolean.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Downloads.ResumeDownload", {
    payload: { id: S.String },
    success: Completion({ success: S.Boolean.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Downloads.RetryDownload", {
    payload: { id: S.String },
    success: Completion({ success: S.Boolean.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Downloads.CancelAllDownloads", {
    success: Completion({
      success: S.Struct({ cancelled: S.Finite, failed: S.Finite }).pipe(RpcObserved),
      error: DownloadsFailure,
    }),
    error: DeliveryError,
  }),
  Rpc.make("Downloads.GetQueueStatus", {
    success: Completion({
      success: S.Struct({ active: S.Finite, pending: S.Finite }).pipe(RpcObserved),
      error: DownloadsFailure,
    }),
    error: DeliveryError,
  }),
  Rpc.make("Downloads.GetActiveDownloads", {
    payload: { token: Token },
    success: Completion({ success: RpcArray(DownloadItem).pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Downloads.UpdateDownloadInfo", {
    payload: { id: S.String, updates: S.Record(S.String, ObservedValue) },
    success: Completion({ success: S.Void.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Downloads.StartPlaylistDownload", {
    payload: { options: PlaylistDownloadOptions },
    success: Completion({ success: PlaylistDownloadResult.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Downloads.StartInstagramProfileDownload", {
    payload: { input: D.InstagramProfileDownloadInput.pipe(RpcObserved) },
    success: Completion({ success: D.InstagramProfileDownloadResult.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Downloads.Watch", {
    success: DownloadEvent.pipe(RpcObserved, Subscription),
    error: S.Union([DownloadsFailure, DeliveryError]),
    stream: true,
  })
);
export const HistoryRpcs = RpcGroup.make(
  Rpc.make("History.GetHistory", {
    payload: { token: Token },
    success: Completion({ success: RpcArray(DownloadHistoryItem).pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("History.GetHistoryById", {
    payload: { id: S.String },
    success: Completion({ success: S.UndefinedOr(DownloadHistoryItem).pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("History.AddHistoryItem", {
    payload: { item: DownloadHistoryItem },
    success: Completion({ success: S.Void.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("History.RemoveHistoryItem", {
    payload: { id: S.String },
    success: Completion({ success: S.Boolean.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("History.RemoveHistoryItems", {
    payload: { ids: RpcArray(S.String) },
    success: Completion({ success: S.Finite.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("History.RemoveHistoryByPlaylistId", {
    payload: { playlistId: S.String },
    success: Completion({ success: S.Finite.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("History.ClearHistory", {
    success: Completion({ success: S.Void.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("History.GetHistoryCount", {
    success: Completion({
      success: S.Struct({
        active: S.Finite,
        completed: S.Finite,
        error: S.Finite,
        cancelled: S.Finite,
        total: S.Finite,
      }).pipe(RpcObserved),
      error: DownloadsFailure,
    }),
    error: DeliveryError,
  })
);
export const ThumbnailRpcs = RpcGroup.make(
  Rpc.make("Thumbnail.GetThumbnailPath", {
    payload: { url: S.NullOr(S.String).pipe(RpcOptional) },
    success: Completion({ success: S.NullOr(S.String).pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Thumbnail.GetLocalPoster", {
    payload: { request: S.NullOr(LocalPosterRequest).pipe(RpcOptional) },
    success: Completion({ success: S.NullOr(S.String).pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  })
);
export const PlayerRpcs = RpcGroup.make(
  Rpc.make("Player.Attach", {
    payload: { input: PlayerAttachInput },
    success: Completion({ success: PlayerAttachResult.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Player.Detach", {
    success: Completion({ success: S.Void.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Player.SyncIconMenu", {
    payload: { state: AppIconMenuState },
    success: Completion({ success: S.Void.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Player.WatchIconMenu", {
    success: S.Literals(["next", "previous", "toggle"]).pipe(RpcObserved, Subscription),
    error: S.Union([DownloadsFailure, DeliveryError]),
    stream: true,
  })
);
export const FilesRpcs = RpcGroup.make(
  Rpc.make("Files.ReadClipboardFilePaths", {
    success: Completion({ success: RpcArray(S.String).pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Files.SelectDirectory", {
    success: Completion({ success: S.NullOr(S.String).pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Files.SelectFile", {
    success: Completion({ success: S.NullOr(S.String).pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Files.SelectMediaFiles", {
    success: Completion({ success: RpcArray(S.String).pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Files.GetDefaultDownloadPath", {
    success: Completion({ success: S.String.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Files.OpenMacFilesAndFoldersSettings", {
    success: Completion({ success: S.Boolean.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Files.OpenFileLocation", {
    payload: { filePath: S.String },
    success: Completion({ success: S.Boolean.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Files.OpenFile", {
    payload: { filePath: S.String },
    success: Completion({ success: S.Boolean.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Files.CopyFileToClipboard", {
    payload: { filePath: S.String },
    success: Completion({ success: S.Boolean.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Files.FileExists", {
    payload: { filePath: S.String },
    success: Completion({ success: S.Boolean.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Files.DeleteFile", {
    payload: { filePath: S.String, allowMissing: S.Boolean.pipe(RpcOptional) },
    success: Completion({ success: S.Boolean.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Files.OpenExternal", {
    payload: { url: S.String },
    success: Completion({ success: S.Boolean.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Files.ValidateCookiesFile", {
    payload: { filePath: S.String },
    success: Completion({ success: Validation.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Files.SaveTextFile", {
    payload: {
      options: S.Struct({
        content: S.String,
        defaultFileName: S.String,
        threadId: S.String.pipe(RpcOptional),
        thinkingLabel: S.String.pipe(RpcOptional),
        source: ExportVideoSource.pipe(RpcOptional),
      }),
    },
    success: Completion({ success: S.NullOr(PathResult).pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Files.SaveMarkdownPdf", {
    payload: {
      options: S.Struct({
        markdown: S.String,
        defaultFileName: S.String,
        title: S.String.pipe(RpcOptional),
        threadId: S.String.pipe(RpcOptional),
        thinkingLabel: S.String.pipe(RpcOptional),
        source: ExportVideoSource.pipe(RpcOptional),
      }),
    },
    success: Completion({ success: S.NullOr(PathResult).pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Files.SaveBinaryFile", {
    payload: { options: S.Struct({ data: S.Uint8ArrayFromBase64, defaultFileName: S.String }) },
    success: Completion({ success: S.NullOr(PathResult).pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Files.SaveSplitShareImage", {
    payload: {
      options: S.Struct({ payload: SharePayload, defaultFileName: S.String, imageCount: S.Finite.pipe(RpcOptional) }),
    },
    success: Completion({
      success: S.NullOr(S.Struct({ path: S.String, count: S.Finite })).pipe(RpcObserved),
      error: DownloadsFailure,
    }),
    error: DeliveryError,
  }),
  Rpc.make("Files.ShareFile", {
    payload: { options: S.Struct({ data: S.Uint8ArrayFromBase64, fileName: S.String }) },
    success: Completion({ success: S.Boolean.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("Files.ShowDownloadCompletedNotification", {
    payload: { title: S.String, body: S.String, filePaths: RpcArray(S.String), downloadPath: S.String },
    success: Completion({ success: S.Boolean.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  })
);
export const BrowserCookiesRpcs = RpcGroup.make(
  Rpc.make("BrowserCookies.ListInstalledBrowsers", {
    success: Completion({ success: RpcArray(C.InstalledCookieBrowser).pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("BrowserCookies.GetExtensionConnection", {
    success: Completion({ success: ExtensionConnection.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("BrowserCookies.SetExtensionSourceOrder", {
    payload: { sourceIds: RpcArray(S.String) },
    success: Completion({ success: ExtensionConnection.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("BrowserCookies.RemoveExtensionSource", {
    payload: { sourceId: S.String },
    success: Completion({ success: ExtensionConnection.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("BrowserCookies.InspectCookieHealth", {
    payload: { input: S.Struct({ browser: S.String, profile: S.String, cookiesPath: S.String }) },
    success: Completion({ success: C.CookieHealth.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("BrowserCookies.GetBrowserProfilePath", {
    payload: { browser: S.String },
    success: Completion({ success: S.String.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  }),
  Rpc.make("BrowserCookies.ValidateBrowserProfilePath", {
    payload: { browser: S.String, profilePath: S.String },
    success: Completion({ success: Validation.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  })
);
export const ShareCaptureRpcs = RpcGroup.make(
  Rpc.make("ShareCapture.Watch", {
    success: S.Struct({ requestId: S.Finite, payload: SharePayload }).pipe(RpcObserved, Subscription),
    error: S.Union([DownloadsFailure, DeliveryError]),
    stream: true,
  }),
  Rpc.make("ShareCapture.WatchMermaid", {
    success: S.Struct({ requestId: S.Finite, payload: MermaidPayload }).pipe(RpcObserved, Subscription),
    error: S.Union([DownloadsFailure, DeliveryError]),
    stream: true,
  }),
  Rpc.make("ShareCapture.Ready", {
    payload: { message: ShareReady, tokens: RpcArray(Token) },
    success: Completion({ success: S.Void.pipe(RpcObserved), error: DownloadsFailure }),
    error: DeliveryError,
  })
);
