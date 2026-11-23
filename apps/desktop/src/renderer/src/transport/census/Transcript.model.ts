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
 * Classifies transcription queue state, including no-speech, cancellation and scheduled retries.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { ListState } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(ListState)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Projects a transcription list row with model, language and persistence timestamps.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { ListRecord } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(ListRecord)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Preserves an incrementally recognized segment and its word observations.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { PartialSegment } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(PartialSegment)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Preserves a transcription status observation and associated record.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Status } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Status)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Preserves a transcription detail read with its source observations.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Detail } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Detail)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Preserves a completed transcription update and its source observations.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Updated } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Updated)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Carries incremental segments with their transcription and originating download identities.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Partial } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Partial)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Describes subtitle cues with language, source provenance and transcript update identity.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Cues } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Cues)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Defines one subtitle cue using millisecond start and end times and visible text.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { SourceCue } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(SourceCue)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const SourceCue = S.Struct({ startMs: S.Finite, endMs: S.Finite, text: S.String }).pipe(
  $I.annoteSchema("SourceCue", { description: "Unactivated secondary source caption." })
);
/**
 * Preserves the ordered subtitle cue collection used for export.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { SourceCues } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(SourceCues)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Selects soft subtitle attachment or hard subtitle burn-in for export.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Mode } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Mode)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Mode = LiteralKit(["soft", "hard"]).pipe(
  $I.annoteSchema("Mode", { description: "Mux subtitle track or burn captions into video." })
);
/**
 * Validates subtitle export input, source path, text and default output filename.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { ExportInput } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(ExportInput)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Reports subtitle export completion or a missing-source or audio-only outcome.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { ExportResult } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(ExportResult)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Describes progress of a subtitle export operation.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { ExportProgress } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(ExportProgress)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ExportProgress = S.Struct({ percent: S.NullOr(S.Finite) }).pipe(
  $I.annoteSchema("ExportProgress", { description: "Global live export progress; null means unknown duration." })
);
/**
 * Preserves the transcription change variants consumed by renderer subscriptions.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Changes } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Changes)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Carries an edit to an existing transcription segment, including optional timing, speaker and text changes.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Patch } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Patch)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Carries a new transcription segment and its relative or millisecond insertion position.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Insert } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Insert)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Preserves a persisted download history row with output paths, source metadata and task relationships.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { HistoryItem } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(HistoryItem)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Reports imported media and rejected paths with their rejection reasons.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { ImportResult } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(ImportResult)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Advertises a cloud transcription model and its credit rate per second.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { CloudModel } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(CloudModel)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Advertises available cloud transcription models and the default model ID.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { CloudCatalog } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(CloudCatalog)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link ListState}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ListState = typeof ListState.Type;
/**
 * Decoded representation validated by {@link ListRecord}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ListRecord = typeof ListRecord.Type;
/**
 * Decoded representation validated by {@link SourceCue}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type SourceCue = typeof SourceCue.Type;
/**
 * Decoded representation validated by {@link SourceCues}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type SourceCues = typeof SourceCues.Type;
/**
 * Decoded representation validated by {@link Mode}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Mode = typeof Mode.Type;
/**
 * Decoded representation validated by {@link ExportResult}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ExportResult = typeof ExportResult.Type;
/**
 * Decoded representation validated by {@link ExportProgress}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ExportProgress = typeof ExportProgress.Type;
/**
 * Decoded representation validated by {@link Changes}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Changes = typeof Changes.Type;
/**
 * Decoded representation validated by {@link Patch}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Patch = typeof Patch.Type;
/**
 * Decoded representation validated by {@link Insert}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Insert = typeof Insert.Type;
/**
 * Decoded representation validated by {@link HistoryItem}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type HistoryItem = typeof HistoryItem.Type;
/**
 * Decoded representation validated by {@link ImportResult}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ImportResult = typeof ImportResult.Type;
/**
 * Decoded representation validated by {@link CloudModel}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type CloudModel = typeof CloudModel.Type;
/**
 * Decoded representation validated by {@link CloudCatalog}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type CloudCatalog = typeof CloudCatalog.Type;
/**
 * Identifies the local transcription model tier being transferred.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { ModelTransfer } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(ModelTransfer)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ModelTransfer = S.Struct({ ...B.ModelDownloadProgress.fields, tier: RpcOptional(L.AsrTierId) }).pipe(
  $I.annoteSchema("ModelTransfer", { description: "Model Transfer boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link ModelTransfer}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ModelTransfer = typeof ModelTransfer.Type;
/**
 * Preserves installed and downloading model state and machine-specific recommendations.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { ModelStatus } from "./Transcript.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(ModelStatus)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
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
 * Decoded representation validated by {@link ModelStatus}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ModelStatus = typeof ModelStatus.Type;
/**
 * Decoded representation validated by {@link PartialSegment}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type PartialSegment = typeof PartialSegment.Type;
