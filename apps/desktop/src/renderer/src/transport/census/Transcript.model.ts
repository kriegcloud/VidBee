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
import { RpcArray, RpcMutableArray, RpcOptional } from "../RpcField.model.js";

const $I = $DesktopId.create("shared/Transcript.model");

/**
 * Validates List State at the desktop capability boundary before dispatch.
 *
 * **Example** (Use ListState at its owning boundary)
 *
 * ```ts
 * import { ListState } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(ListState);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
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
/**
 * Validates List Record at the desktop capability boundary before dispatch.
 *
 * **Example** (Use ListRecord at its owning boundary)
 *
 * ```ts
 * import { ListRecord } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(ListRecord);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
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
}).pipe($I.annoteSchema("Creation", { description: "Creation boundary in the desktop transport contract." }));
/**
 * Validates Partial Segment at the desktop capability boundary before dispatch.
 *
 * **Example** (Use PartialSegment at its owning boundary)
 *
 * ```ts
 * import { PartialSegment } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(PartialSegment);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const PartialSegment = S.Struct({
  ...P.PipelineSegment.fields,
  words: T.TranscriptWord.pipe(S.Array, S.mutable, RpcOptional),
}).pipe(
  $I.annoteSchema("PartialSegment", { description: "Partial Segment boundary in the desktop transport contract." })
);
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
  stageHistory: RpcArray(PersistedStage),
  title: S.NullOr(S.String),
  transcriptId: S.NullOr(S.String),
  transcriptionTaskId: S.NullOr(S.String),
  updatedAt: S.Finite,
};
/**
 * Validates Status at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Status at its owning boundary)
 *
 * ```ts
 * import { Status } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Status);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class Status extends S.Opaque<Status, { readonly brand: unique symbol }>()(
  S.Struct({ ...common, record: S.NullOr(ListRecord) }).pipe(
    $I.annoteSchema("Status", { description: "Compact library snapshot; no filesystem scan or body hydration." })
  )
) {}
/**
 * Validates Detail at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Detail at its owning boundary)
 *
 * ```ts
 * import { Detail } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Detail);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class Detail extends S.Opaque<Detail, { readonly brand: unique symbol }>()(
  S.Struct({ ...common, record: S.NullOr(T.StoredTranscriptRecord), sources: RpcArray(T.TranscriptSourceOption) }).pipe(
    $I.annoteSchema("Detail", { description: "Hydrated selected transcript including its source choices." })
  )
) {}
/**
 * Validates Updated at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Updated at its owning boundary)
 *
 * ```ts
 * import { Updated } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Updated);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class Updated extends S.Opaque<Updated, { readonly brand: unique symbol }>()(
  S.Struct({ ...Status.fields, sources: RpcArray(T.TranscriptSourceOption) }).pipe(
    $I.annoteSchema("Updated", { description: "Live compact update with source options, without segment bodies." })
  )
) {}
/**
 * Validates Partial at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Partial at its owning boundary)
 *
 * ```ts
 * import { Partial } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Partial);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class Partial extends S.Opaque<Partial, { readonly brand: unique symbol }>()(
  S.Struct({ downloadTaskId: S.String, taskId: S.String, segments: RpcArray(PartialSegment) }).pipe(
    $I.annoteSchema("Partial", {
      description: "Replaceable whole partial segment list, including the possibly empty task identity.",
    })
  )
) {}
/**
 * Validates Cues at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Cues at its owning boundary)
 *
 * ```ts
 * import { Cues } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Cues);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class Cues extends S.Opaque<Cues, { readonly brand: unique symbol }>()(
  S.Struct({
    language: S.NullOr(S.String),
    segments: RpcArray(T.TranscriptPlaybackCue),
    sourceKind: L.TranscriptSourceKind,
    snapshotSourceKind: S.NullOr(L.TranscriptSourceKind),
    transcriptId: S.String,
    updatedAt: S.Finite,
  }).pipe($I.annoteSchema("Cues", { description: "Playback body without word timestamps." }))
) {}
/**
 * Validates Source Cue at the desktop capability boundary before dispatch.
 *
 * **Example** (Use SourceCue at its owning boundary)
 *
 * ```ts
 * import { SourceCue } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(SourceCue);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const SourceCue = S.Struct({ startMs: S.Finite, endMs: S.Finite, text: S.String }).pipe(
  $I.annoteSchema("SourceCue", { description: "Unactivated secondary source caption." })
);
/**
 * Validates Source Cues at the desktop capability boundary before dispatch.
 *
 * **Example** (Use SourceCues at its owning boundary)
 *
 * ```ts
 * import { SourceCues } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(SourceCues);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const SourceCues = RpcArray(S.Union([T.TranscriptPlaybackCue, SourceCue])).pipe(
  $I.annoteSchema("SourceCues", {
    description: "Stored cues retain metadata; sidecar cues contain only times and text.",
  })
);
/**
 * Validates Mode at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Mode at its owning boundary)
 *
 * ```ts
 * import { Mode } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Mode);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Mode = LiteralKit(["soft", "hard"]).pipe(
  $I.annoteSchema("Mode", { description: "Mux subtitle track or burn captions into video." })
);
/**
 * Validates Export Input at the desktop capability boundary before dispatch.
 *
 * **Example** (Use ExportInput at its owning boundary)
 *
 * ```ts
 * import { ExportInput } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(ExportInput);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export class ExportInput extends S.Opaque<ExportInput, { readonly brand: unique symbol }>()(
  S.Struct({ defaultFileName: S.String, mode: Mode, sourcePath: S.String, subtitleText: S.String }).pipe(
    $I.annoteSchema("ExportInput", { description: "Video export consumes caller-produced subtitle bytes." })
  )
) {}
/**
 * Validates Export Result at the desktop capability boundary before dispatch.
 *
 * **Example** (Use ExportResult at its owning boundary)
 *
 * ```ts
 * import { ExportResult } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(ExportResult);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ExportResult = S.Union([
  S.Struct({ status: S.tag("saved"), path: S.String }),
  S.Struct({ status: S.tag("canceled") }),
  S.Struct({ status: S.tag("unavailable"), reason: LiteralKit(["missing-source", "audio-only"]) }),
  S.Struct({ status: S.tag("failed"), message: S.String }),
]).pipe(
  S.toTaggedUnion("status"),
  $I.annoteSchema("ExportResult", { description: "Expected video export outcomes; cleanup can separately fail." })
);
/**
 * Validates Export Progress at the desktop capability boundary before dispatch.
 *
 * **Example** (Use ExportProgress at its owning boundary)
 *
 * ```ts
 * import { ExportProgress } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(ExportProgress);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ExportProgress = S.Struct({ percent: S.NullOr(S.Finite) }).pipe(
  $I.annoteSchema("ExportProgress", { description: "Global live export progress; null means unknown duration." })
);
/**
 * Validates Changes at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Changes at its owning boundary)
 *
 * ```ts
 * import { Changes } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Changes);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Changes = S.Union([
  S.Struct({ kind: S.tag("updated"), value: Updated }),
  S.Struct({ kind: S.tag("partial"), value: Partial }),
]).pipe(
  S.toTaggedUnion("kind"),
  $I.annoteSchema("Changes", { description: "Ordered live transcript observations; partial flush precedes update." })
);
/**
 * Validates Patch at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Patch at its owning boundary)
 *
 * ```ts
 * import { Patch } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Patch);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Patch = S.Struct({
  downloadId: S.String,
  segmentId: S.String,
  endMs: RpcOptional(S.Finite),
  speakerId: S.String.pipe(S.NullOr, RpcOptional),
  startMs: RpcOptional(S.Finite),
  text: RpcOptional(S.String),
}).pipe($I.annoteSchema("Patch", { description: "Edit the currently viewed transcript at execution time." }));
/**
 * Validates Insert at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Insert at its owning boundary)
 *
 * ```ts
 * import { Insert } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Insert);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Insert = S.Struct({
  downloadId: S.String,
  afterId: S.String.pipe(S.NullOr, RpcOptional),
  beforeId: S.String.pipe(S.NullOr, RpcOptional),
  atMs: RpcOptional(S.Finite),
  speakerId: S.String.pipe(S.NullOr, RpcOptional),
  text: RpcOptional(S.String),
}).pipe($I.annoteSchema("Insert", { description: "Desktop insertion surface excludes explicit start and end times." }));
/**
 * Validates History Item at the desktop capability boundary before dispatch.
 *
 * **Example** (Use HistoryItem at its owning boundary)
 *
 * ```ts
 * import { HistoryItem } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(HistoryItem);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const HistoryItem = S.Struct({
  sourceMediaKind: LiteralKit(["image", "video", "mixed"]).pipe(S.UndefinedOr, S.optionalKey),
  collectionSummary: Q.SocialCollectionSummary.pipe(S.UndefinedOr, S.optionalKey),
  cookieSources: RpcArray(Q.DownloadCookieSource).pipe(S.UndefinedOr, S.optionalKey),
  configuredCookieSources: RpcArray(Q.DownloadCookieSource).pipe(S.UndefinedOr, S.optionalKey),
  id: S.String,
  url: S.String,
  title: S.String,
  thumbnail: S.String.pipe(S.UndefinedOr, S.optionalKey),
  type: LiteralKit(["video", "audio"]),
  status: D.DownloadStatus,
  downloadPath: S.String.pipe(S.UndefinedOr, S.optionalKey),
  savedFileName: S.String.pipe(S.UndefinedOr, S.optionalKey),
  filePath: S.String.pipe(S.UndefinedOr, S.optionalKey),
  resolvedFormatId: S.String.pipe(S.UndefinedOr, S.optionalKey),
  subtitleStatus: LiteralKit(["downloaded", "unavailable", "skipped-auth", "failed"]).pipe(
    S.UndefinedOr,
    S.optionalKey
  ),
  subtitleLanguages: RpcArray(S.String).pipe(S.UndefinedOr, S.optionalKey),
  fileSize: S.Finite.pipe(S.UndefinedOr, S.optionalKey),
  duration: S.Finite.pipe(S.UndefinedOr, S.optionalKey),
  downloadedAt: S.Finite,
  createdAt: S.Finite.pipe(S.UndefinedOr, S.optionalKey),
  startedAt: S.Finite.pipe(S.UndefinedOr, S.optionalKey),
  completedAt: S.Finite.pipe(S.UndefinedOr, S.optionalKey),
  error: S.String.pipe(S.UndefinedOr, S.optionalKey),
  ytDlpCommand: S.String.pipe(S.UndefinedOr, S.optionalKey),
  ytDlpLog: S.String.pipe(S.UndefinedOr, S.optionalKey),
  description: S.String.pipe(S.UndefinedOr, S.optionalKey),
  channel: S.String.pipe(S.UndefinedOr, S.optionalKey),
  uploader: S.String.pipe(S.UndefinedOr, S.optionalKey),
  viewCount: S.Finite.pipe(S.UndefinedOr, S.optionalKey),
  tags: RpcArray(S.String).pipe(S.UndefinedOr, S.optionalKey),
  origin: Q.TaskOrigin.pipe(S.UndefinedOr, S.optionalKey),
  agentConversation: Q.TaskCreationMetadata.fields.agentConversation.pipe(S.UndefinedOr, S.optionalKey),
  parentId: S.String.pipe(S.UndefinedOr, S.optionalKey),
  taskKind: Q.TaskKind.pipe(S.UndefinedOr, S.optionalKey),
  subscriptionId: S.String.pipe(S.UndefinedOr, S.optionalKey),
  selectedFormat: D.VideoFormat.pipe(S.UndefinedOr, S.optionalKey),
  playlistId: S.String.pipe(S.UndefinedOr, S.optionalKey),
  playlistTitle: S.String.pipe(S.UndefinedOr, S.optionalKey),
  playlistIndex: S.Finite.pipe(S.UndefinedOr, S.optionalKey),
  playlistSize: S.Finite.pipe(S.UndefinedOr, S.optionalKey),
  mediaKind: LiteralKit(["photo", "video", "recording"]).pipe(S.UndefinedOr, S.optionalKey),
  batchId: S.String.pipe(S.UndefinedOr, S.optionalKey),
  batchKind: LiteralKit(["instagram-profile", "social-media"]).pipe(S.UndefinedOr, S.optionalKey),
  batchTitle: S.String.pipe(S.UndefinedOr, S.optionalKey),
  batchCategory: S.String.pipe(S.UndefinedOr, S.optionalKey),
  batchOrder: S.Finite.pipe(S.UndefinedOr, S.optionalKey),
  batchSourceCount: S.Finite.pipe(S.UndefinedOr, S.optionalKey),
  batchAssetCount: S.Finite.pipe(S.UndefinedOr, S.optionalKey),
  outputDirectory: S.String.pipe(S.UndefinedOr, S.optionalKey),
  fileCount: S.Finite.pipe(S.UndefinedOr, S.optionalKey),
  downloadedCount: S.Finite.pipe(S.UndefinedOr, S.optionalKey),
  skippedCount: S.Finite.pipe(S.UndefinedOr, S.optionalKey),
  failedCount: S.Finite.pipe(S.UndefinedOr, S.optionalKey),
  totalSize: S.Finite.pipe(S.UndefinedOr, S.optionalKey),
}).pipe($I.annoteSchema("HistoryItem", { description: "Desktop history projector shape owned by downloads." }));
/**
 * Validates Import Result at the desktop capability boundary before dispatch.
 *
 * **Example** (Use ImportResult at its owning boundary)
 *
 * ```ts
 * import { ImportResult } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(ImportResult);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ImportResult = S.Struct({
  imported: RpcArray(
    S.Struct({ path: S.String, downloadId: S.String, created: S.Boolean, reused: S.Boolean, historyItem: HistoryItem })
  ),
  rejected: RpcArray(S.Struct({ path: S.String, reason: LiteralKit(["missing", "not-media"]) })),
}).pipe($I.annoteSchema("ImportResult", { description: "Ordered local import outcomes with complete history rows." }));
/**
 * Validates Cloud Model at the desktop capability boundary before dispatch.
 *
 * **Example** (Use CloudModel at its owning boundary)
 *
 * ```ts
 * import { CloudModel } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(CloudModel);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const CloudModel = S.StructWithRest(S.Struct({ id: S.String, name: S.String, creditsPerSecond: S.Finite }), [
  S.Record(S.String, S.Unknown),
]).pipe(
  $I.annoteSchema("CloudModel", {
    description: "Catalog model fields checked by desktop; extra server metadata survives.",
  })
);
/**
 * Validates Cloud Catalog at the desktop capability boundary before dispatch.
 *
 * **Example** (Use CloudCatalog at its owning boundary)
 *
 * ```ts
 * import { CloudCatalog } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(CloudCatalog);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const CloudCatalog = S.StructWithRest(S.Struct({ defaultModelId: S.String, models: RpcArray(CloudModel) }), [
  S.Record(S.String, S.Unknown),
]).pipe(
  $I.annoteSchema("CloudCatalog", {
    description: "Desktop checks model entries and membership; maximum audio hints are unchecked metadata.",
  })
);
/**
 * Describes List State ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ListState = typeof ListState.Type;
/**
 * Describes List Record ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ListRecord = typeof ListRecord.Type;
/**
 * Describes Source Cue ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type SourceCue = typeof SourceCue.Type;
/**
 * Describes Source Cues ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type SourceCues = typeof SourceCues.Type;
/**
 * Describes Mode ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Mode = typeof Mode.Type;
/**
 * Describes Export Result ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ExportResult = typeof ExportResult.Type;
/**
 * Describes Export Progress ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ExportProgress = typeof ExportProgress.Type;
/**
 * Describes Changes ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Changes = typeof Changes.Type;
/**
 * Describes Patch ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Patch = typeof Patch.Type;
/**
 * Describes Insert ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Insert = typeof Insert.Type;
/**
 * Describes History Item ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type HistoryItem = typeof HistoryItem.Type;
/**
 * Describes Import Result ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ImportResult = typeof ImportResult.Type;
/**
 * Describes Cloud Model ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type CloudModel = typeof CloudModel.Type;
/**
 * Describes Cloud Catalog ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type CloudCatalog = typeof CloudCatalog.Type;
/**
 * Validates Model Transfer at the desktop capability boundary before dispatch.
 *
 * **Example** (Use ModelTransfer at its owning boundary)
 *
 * ```ts
 * import { ModelTransfer } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(ModelTransfer);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ModelTransfer = S.Struct({ ...B.ModelDownloadProgress.fields, tier: RpcOptional(L.AsrTierId) }).pipe(
  $I.annoteSchema("ModelTransfer", { description: "Model Transfer boundary in the desktop transport contract." })
);
/**
 * Describes Model Transfer ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ModelTransfer = typeof ModelTransfer.Type;
/**
 * Validates Model Status at the desktop capability boundary before dispatch.
 *
 * **Example** (Use ModelStatus at its owning boundary)
 *
 * ```ts
 * import { ModelStatus } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(ModelStatus);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ModelStatus = S.Struct({
  ...B.ModelStatus.fields,
  pendingTiers: L.AsrTierId.pipe(S.Array, S.mutable, RpcOptional),
  downloading: S.NullOr(ModelTransfer),
  downloads: RpcMutableArray(ModelTransfer),
  machine: RpcOptional(B.MachineProfileStatus),
  recommended: L.AsrTierId.pipe(S.Array, S.mutable, RpcOptional),
  language: RpcOptional(S.String),
}).pipe($I.annoteSchema("ModelStatus", { description: "Model Status boundary in the desktop transport contract." }));
/**
 * Describes Model Status ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ModelStatus = typeof ModelStatus.Type;
/**
 * Describes Partial Segment ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type PartialSegment = typeof PartialSegment.Type;
