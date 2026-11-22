import * as D from "@vidbee/downloader-core/Download.model";
import { $DesktopId } from "@vidbee/identity/packages";
import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as Q from "@vidbee/task-queue/Task.model";
import { PersistedStage } from "@vidbee/transcription/Checkpoint.model";
import * as L from "@vidbee/transcription/Literal.model";
import * as B from "@vidbee/transcription/Model.model";
import * as P from "@vidbee/transcription/Pipeline.model";
import * as T from "@vidbee/transcription/Transcript.model";
import * as S from "effect/Schema";
import { RpcOptional } from "../RpcField.model.js";

const $I = $DesktopId.create("shared/Transcript.model");
export const ListState = LiteralKit([
  "none",
  "queued",
  "running",
  "completed",
  "no-speech",
  "failed",
  "cancelled",
  "retry-scheduled",
]).pipe(
  $I.annoteSchema("ListState", { description: "Library lifecycle interpreted from the selected source and task." })
);
export const ListRecord = S.Struct({
  asrTier: S.NullOr(S.String),
  createdAt: S.Finite,
  id: S.String,
  language: S.NullOr(S.String),
  modelVersion: S.String,
  resultKind: S.String,
  sourceKind: L.TranscriptSourceKind,
  updatedAt: S.Finite,
}).pipe($I.annoteSchema("ListRecord", { description: "Selected stored metadata without caption bodies." }));
const Creation = S.Struct({
  ...Q.TaskCreationMetadata.fields,
  agentConversation: RpcOptional(S.Struct({ downloadId: S.String, threadId: S.String, promptId: S.String })),
});
export const PartialSegment = S.Struct({
  ...P.PipelineSegment.fields,
  words: T.TranscriptWord.pipe(S.Array, S.mutable, RpcOptional),
});
const common = {
  asrTier: S.NullOr(L.AsrTierId),
  creation: RpcOptional(Creation),
  downloadTaskId: S.String,
  error: S.NullOr(S.String),
  listState: ListState,
  rediarize: S.Boolean,
  sourceFilePath: S.NullOr(S.String),
  sourceKind: S.NullOr(L.TranscriptSourceKind),
  speakerCount: L.SpeakerCount,
  stage: S.NullOr(S.String),
  stageHistory: S.Array(PersistedStage),
  title: S.NullOr(S.String),
  transcriptId: S.NullOr(S.String),
  transcriptionTaskId: S.NullOr(S.String),
  updatedAt: S.Finite,
};
export class Status extends S.Opaque<Status, { readonly brand: unique symbol }>()(
  S.Struct({ ...common, record: S.NullOr(ListRecord) }).pipe(
    $I.annoteSchema("Status", { description: "Compact library snapshot; no filesystem scan or body hydration." })
  )
) {}
export class Detail extends S.Opaque<Detail, { readonly brand: unique symbol }>()(
  S.Struct({ ...common, record: S.NullOr(T.StoredTranscriptRecord), sources: S.Array(T.TranscriptSourceOption) }).pipe(
    $I.annoteSchema("Detail", { description: "Hydrated selected transcript including its source choices." })
  )
) {}
export class Updated extends S.Opaque<Updated, { readonly brand: unique symbol }>()(
  S.Struct({ ...Status.fields, sources: S.Array(T.TranscriptSourceOption) }).pipe(
    $I.annoteSchema("Updated", { description: "Live compact update with source options, without segment bodies." })
  )
) {}
export class Partial extends S.Opaque<Partial, { readonly brand: unique symbol }>()(
  S.Struct({ downloadTaskId: S.String, taskId: S.String, segments: S.Array(PartialSegment) }).pipe(
    $I.annoteSchema("Partial", {
      description: "Replaceable whole partial segment list, including the possibly empty task identity.",
    })
  )
) {}
export class Cues extends S.Opaque<Cues, { readonly brand: unique symbol }>()(
  S.Struct({
    language: S.NullOr(S.String),
    segments: S.Array(T.TranscriptPlaybackCue),
    sourceKind: L.TranscriptSourceKind,
    snapshotSourceKind: S.NullOr(L.TranscriptSourceKind),
    transcriptId: S.String,
    updatedAt: S.Finite,
  }).pipe($I.annoteSchema("Cues", { description: "Playback body without word timestamps." }))
) {}
export const SourceCue = S.Struct({ startMs: S.Finite, endMs: S.Finite, text: S.String }).pipe(
  $I.annoteSchema("SourceCue", { description: "Unactivated secondary source caption." })
);
export const SourceCues = S.Array(S.Union([T.TranscriptPlaybackCue, SourceCue])).pipe(
  $I.annoteSchema("SourceCues", {
    description: "Stored cues retain metadata; sidecar cues contain only times and text.",
  })
);
export const Mode = LiteralKit(["soft", "hard"]).pipe(
  $I.annoteSchema("Mode", { description: "Mux subtitle track or burn captions into video." })
);
export class ExportInput extends S.Opaque<ExportInput, { readonly brand: unique symbol }>()(
  S.Struct({ defaultFileName: S.String, mode: Mode, sourcePath: S.String, subtitleText: S.String }).pipe(
    $I.annoteSchema("ExportInput", { description: "Video export consumes caller-produced subtitle bytes." })
  )
) {}
export const ExportResult = S.Union([
  S.Struct({ status: S.tag("saved"), path: S.String }),
  S.Struct({ status: S.tag("canceled") }),
  S.Struct({ status: S.tag("unavailable"), reason: LiteralKit(["missing-source", "audio-only"]) }),
  S.Struct({ status: S.tag("failed"), message: S.String }),
]).pipe(
  S.toTaggedUnion("status"),
  $I.annoteSchema("ExportResult", { description: "Expected video export outcomes; cleanup can separately fail." })
);
export const ExportProgress = S.Struct({ percent: S.NullOr(S.Finite) }).pipe(
  $I.annoteSchema("ExportProgress", { description: "Global live export progress; null means unknown duration." })
);
export const Changes = S.Union([
  S.Struct({ kind: S.tag("updated"), value: Updated }),
  S.Struct({ kind: S.tag("partial"), value: Partial }),
]).pipe(
  S.toTaggedUnion("kind"),
  $I.annoteSchema("Changes", { description: "Ordered live transcript observations; partial flush precedes update." })
);
export const Patch = S.Struct({
  downloadId: S.String,
  segmentId: S.String,
  endMs: RpcOptional(S.Finite),
  speakerId: S.String.pipe(S.NullOr, RpcOptional),
  startMs: RpcOptional(S.Finite),
  text: RpcOptional(S.String),
}).pipe($I.annoteSchema("Patch", { description: "Edit the currently viewed transcript at execution time." }));
export const Insert = S.Struct({
  downloadId: S.String,
  afterId: S.String.pipe(S.NullOr, RpcOptional),
  beforeId: S.String.pipe(S.NullOr, RpcOptional),
  atMs: RpcOptional(S.Finite),
  speakerId: S.String.pipe(S.NullOr, RpcOptional),
  text: RpcOptional(S.String),
}).pipe($I.annoteSchema("Insert", { description: "Desktop insertion surface excludes explicit start and end times." }));
export const HistoryItem = S.Struct({
  sourceMediaKind: LiteralKit(["image", "video", "mixed"]).pipe(S.optional),
  collectionSummary: Q.SocialCollectionSummary.pipe(S.optional),
  cookieSources: S.Array(Q.DownloadCookieSource).pipe(S.optional),
  configuredCookieSources: S.Array(Q.DownloadCookieSource).pipe(S.optional),
  id: S.String,
  url: S.String,
  title: S.String,
  thumbnail: S.String.pipe(S.optional),
  type: LiteralKit(["video", "audio"]),
  status: D.DownloadStatus,
  downloadPath: S.String.pipe(S.optional),
  savedFileName: S.String.pipe(S.optional),
  filePath: S.String.pipe(S.optional),
  resolvedFormatId: S.String.pipe(S.optional),
  subtitleStatus: LiteralKit(["downloaded", "unavailable", "skipped-auth", "failed"]).pipe(S.optional),
  subtitleLanguages: S.Array(S.String).pipe(S.optional),
  fileSize: S.Finite.pipe(S.optional),
  duration: S.Finite.pipe(S.optional),
  downloadedAt: S.Finite,
  createdAt: S.Finite.pipe(S.optional),
  startedAt: S.Finite.pipe(S.optional),
  completedAt: S.Finite.pipe(S.optional),
  error: S.String.pipe(S.optional),
  ytDlpCommand: S.String.pipe(S.optional),
  ytDlpLog: S.String.pipe(S.optional),
  description: S.String.pipe(S.optional),
  channel: S.String.pipe(S.optional),
  uploader: S.String.pipe(S.optional),
  viewCount: S.Finite.pipe(S.optional),
  tags: S.Array(S.String).pipe(S.optional),
  origin: Q.TaskOrigin.pipe(S.optional),
  agentConversation: Q.TaskCreationMetadata.fields.agentConversation.pipe(S.optional),
  parentId: S.String.pipe(S.optional),
  taskKind: Q.TaskKind.pipe(S.optional),
  subscriptionId: S.String.pipe(S.optional),
  selectedFormat: D.VideoFormat.pipe(S.optional),
  playlistId: S.String.pipe(S.optional),
  playlistTitle: S.String.pipe(S.optional),
  playlistIndex: S.Finite.pipe(S.optional),
  playlistSize: S.Finite.pipe(S.optional),
  mediaKind: LiteralKit(["photo", "video", "recording"]).pipe(S.optional),
  batchId: S.String.pipe(S.optional),
  batchKind: LiteralKit(["instagram-profile", "social-media"]).pipe(S.optional),
  batchTitle: S.String.pipe(S.optional),
  batchCategory: S.String.pipe(S.optional),
  batchOrder: S.Finite.pipe(S.optional),
  batchSourceCount: S.Finite.pipe(S.optional),
  batchAssetCount: S.Finite.pipe(S.optional),
  outputDirectory: S.String.pipe(S.optional),
  fileCount: S.Finite.pipe(S.optional),
  downloadedCount: S.Finite.pipe(S.optional),
  skippedCount: S.Finite.pipe(S.optional),
  failedCount: S.Finite.pipe(S.optional),
  totalSize: S.Finite.pipe(S.optional),
}).pipe($I.annoteSchema("HistoryItem", { description: "Desktop history projector shape owned by downloads." }));
export const ImportResult = S.Struct({
  imported: S.Array(
    S.Struct({ path: S.String, downloadId: S.String, created: S.Boolean, reused: S.Boolean, historyItem: HistoryItem })
  ),
  rejected: S.Array(S.Struct({ path: S.String, reason: LiteralKit(["missing", "not-media"]) })),
}).pipe($I.annoteSchema("ImportResult", { description: "Ordered local import outcomes with complete history rows." }));
export const CloudModel = S.StructWithRest(S.Struct({ id: S.String, name: S.String, creditsPerSecond: S.Finite }), [
  S.Record(S.String, S.Unknown),
]).pipe(
  $I.annoteSchema("CloudModel", {
    description: "Catalog model fields checked by desktop; extra server metadata survives.",
  })
);
export const CloudCatalog = S.StructWithRest(S.Struct({ defaultModelId: S.String, models: S.Array(CloudModel) }), [
  S.Record(S.String, S.Unknown),
]).pipe(
  $I.annoteSchema("CloudCatalog", {
    description: "Desktop checks model entries and membership; maximum audio hints are unchecked metadata.",
  })
);
export type ListState = typeof ListState.Type;
export type ListRecord = typeof ListRecord.Type;
export type SourceCue = typeof SourceCue.Type;
export type SourceCues = typeof SourceCues.Type;
export type Mode = typeof Mode.Type;
export type ExportResult = typeof ExportResult.Type;
export type ExportProgress = typeof ExportProgress.Type;
export type Changes = typeof Changes.Type;
export type Patch = typeof Patch.Type;
export type Insert = typeof Insert.Type;
export type HistoryItem = typeof HistoryItem.Type;
export type ImportResult = typeof ImportResult.Type;
export type CloudModel = typeof CloudModel.Type;
export type CloudCatalog = typeof CloudCatalog.Type;
export const ModelTransfer = S.Struct({ ...B.ModelDownloadProgress.fields, tier: RpcOptional(L.AsrTierId) });
export type ModelTransfer = typeof ModelTransfer.Type;
export const ModelStatus = S.Struct({
  ...B.ModelStatus.fields,
  pendingTiers: L.AsrTierId.pipe(S.Array, S.mutable, RpcOptional),
  downloading: S.NullOr(ModelTransfer),
  downloads: S.Array(ModelTransfer).pipe(S.mutable),
  machine: RpcOptional(B.MachineProfileStatus),
  recommended: L.AsrTierId.pipe(S.Array, S.mutable, RpcOptional),
  language: RpcOptional(S.String),
});
export type ModelStatus = typeof ModelStatus.Type;
export type PartialSegment = typeof PartialSegment.Type;
