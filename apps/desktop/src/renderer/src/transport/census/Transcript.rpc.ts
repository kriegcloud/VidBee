import { $DesktopId } from "@vidbee/identity/packages";
import * as L from "@vidbee/transcription/Literal.model";
import * as B from "@vidbee/transcription/Model.model";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";
import * as S from "effect/Schema";
import { DeliveryError } from "../DocumentDelivery.errors.js";
import { Completion, Subscription, Token } from "../DocumentDelivery.model.js";
import { RpcArray, RpcOptional } from "../RpcField.model.js";
import { RpcObserved } from "../RpcObservation.model.js";
import { TranscriptOperationError } from "./Transcript.errors.js";
import * as M from "./Transcript.model.js";

const $TransportId = $DesktopId.create("renderer/src/transport/census/Transcript.rpc");

/**
 * Binds transcription work to the exact change, model, download, settings, account, agent and export subscriptions it depends on.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Dependencies } from "./Transcript.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Dependencies)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Dependencies = S.Struct({
  changes: RpcOptional(Token),
  models: RpcOptional(Token),
  downloads: RpcOptional(Token),
  settings: RpcOptional(Token),
  account: RpcOptional(Token),
  agent: RpcOptional(Token),
  exportProgress: RpcOptional(Token),
}).pipe(
  $TransportId.annoteSchema("Dependencies", { description: "Dependencies boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link Dependencies}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Dependencies = typeof Dependencies.Type;
/**
 * Binds an initial transcription read to its active subscription token.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Initial } from "./Transcript.rpc.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Initial)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Initial = S.Struct({ token: Token }).pipe(
  $TransportId.annoteSchema("Initial", { description: "Initial boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link Initial}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Initial = typeof Initial.Type;
const done = <A, I, RD, RE>(success: S.Codec<A, I, RD, RE>) =>
  Completion({ success: RpcObserved(success), error: TranscriptOperationError });
/**
 * Declares the frozen RPC surface for transcription, model management and subtitle export; share this group between handler layers and clients to keep payload, completion and stream contracts aligned.
 *
 * **Example** (Use TranscriptRpcs with its owner)
 *
 * ```ts
 * import { TranscriptRpcs } from "./Transcript.rpc.js"
 * import * as RpcClient from "effect/rpc/RpcClient"
 * export const make = RpcClient.make(TranscriptRpcs);
 * // Provide the document-owned RpcClient.Protocol and run make in the client scope.
 * // The resulting typed client exposes only this capability group's declared commands.
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const TranscriptRpcs = RpcGroup.make(
  Rpc.make("Transcript.GetCloudModels", {
    payload: S.Struct({ dependencies: Dependencies }).pipe(RpcObserved),
    success: done(M.CloudCatalog),
    error: DeliveryError,
  }),
  Rpc.make("Transcript.GetForDownload", {
    payload: S.Struct({ token: Token, dependencies: Dependencies, downloadId: S.String }).pipe(RpcObserved),
    success: done(M.Detail),
    error: DeliveryError,
  }),
  Rpc.make("Transcript.GetDetail", {
    payload: S.Struct({ token: Token, dependencies: Dependencies, downloadId: S.String }).pipe(RpcObserved),
    success: done(M.Detail),
    error: DeliveryError,
  }),
  Rpc.make("Transcript.GetPlaybackCues", {
    payload: S.Struct({ token: Token, dependencies: Dependencies, downloadId: S.String }).pipe(RpcObserved),
    success: M.Cues.pipe(S.NullOr, done),
    error: DeliveryError,
  }),
  Rpc.make("Transcript.GetSourceCues", {
    payload: S.Struct({ token: Token, dependencies: Dependencies, downloadId: S.String, key: S.String }).pipe(
      RpcObserved
    ),
    success: done(M.SourceCues),
    error: DeliveryError,
  }),
  Rpc.make("Transcript.GetStatusMap", {
    payload: S.Struct({ token: Token, dependencies: Dependencies }).pipe(RpcObserved),
    success: done(S.Record(S.String, M.Status)),
    error: DeliveryError,
  }),
  Rpc.make("Transcript.ImportLocal", {
    payload: S.Struct({ dependencies: Dependencies, paths: RpcArray(S.String) }).pipe(RpcObserved),
    success: done(M.ImportResult),
    error: DeliveryError,
  }),
  Rpc.make("Transcript.Start", {
    payload: S.Struct({
      dependencies: Dependencies,
      downloadId: S.String,
      force: RpcOptional(S.Boolean),
      speakerCount: RpcOptional(L.SpeakerCount),
    }).pipe(RpcObserved),
    success: done(M.Detail),
    error: DeliveryError,
  }),
  Rpc.make("Transcript.Rediarize", {
    payload: S.Struct({ dependencies: Dependencies, downloadId: S.String, speakerCount: L.SpeakerCount }).pipe(
      RpcObserved
    ),
    success: done(M.Detail),
    error: DeliveryError,
  }),
  Rpc.make("Transcript.SelectSource", {
    payload: S.Struct({ dependencies: Dependencies, downloadId: S.String, key: S.String }).pipe(RpcObserved),
    success: done(M.Detail),
    error: DeliveryError,
  }),
  Rpc.make("Transcript.Retry", {
    payload: S.Struct({ dependencies: Dependencies, downloadId: S.String }).pipe(RpcObserved),
    success: done(M.Detail),
    error: DeliveryError,
  }),
  Rpc.make("Transcript.Cancel", {
    payload: S.Struct({ dependencies: Dependencies, downloadId: S.String }).pipe(RpcObserved),
    success: done(M.Detail),
    error: DeliveryError,
  }),
  Rpc.make("Transcript.GetModelStatus", {
    payload: S.Struct({ dependencies: Dependencies }).pipe(RpcObserved),
    success: done(M.ModelStatus),
    error: DeliveryError,
  }),
  Rpc.make("Transcript.GetModelPrepStatus", {
    payload: S.Struct({ token: Token, dependencies: Dependencies }).pipe(RpcObserved),
    success: done(B.ModelPrepStatus),
    error: DeliveryError,
  }),
  Rpc.make("Transcript.RedownloadModels", {
    payload: S.Struct({ dependencies: Dependencies }).pipe(RpcObserved),
    success: done(M.ModelStatus),
    error: DeliveryError,
  }),
  Rpc.make("Transcript.GetPartials", {
    payload: S.Struct({ token: Token, dependencies: Dependencies, downloadId: S.String }).pipe(RpcObserved),
    success: M.PartialSegment.pipe(S.Array, done),
    error: DeliveryError,
  }),
  Rpc.make("Transcript.EnsureTier", {
    payload: S.Struct({ dependencies: Dependencies, tier: L.AsrTierId }).pipe(RpcObserved),
    success: done(M.ModelStatus),
    error: DeliveryError,
  }),
  Rpc.make("Transcript.SetTier", {
    payload: S.Struct({ dependencies: Dependencies, tier: L.AsrTierId }).pipe(RpcObserved),
    success: done(M.ModelStatus),
    error: DeliveryError,
  }),
  Rpc.make("Transcript.DeleteTier", {
    payload: S.Struct({ dependencies: Dependencies, tier: L.AsrTierId }).pipe(RpcObserved),
    success: done(M.ModelStatus),
    error: DeliveryError,
  }),
  Rpc.make("Transcript.CancelTier", {
    payload: S.Struct({ dependencies: Dependencies, tier: L.AsrTierId }).pipe(RpcObserved),
    success: done(M.ModelStatus),
    error: DeliveryError,
  }),
  Rpc.make("Transcript.Upgrade", {
    payload: S.Struct({ dependencies: Dependencies, downloadId: S.String, tier: L.AsrTierId }).pipe(RpcObserved),
    success: done(M.Detail),
    error: DeliveryError,
  }),
  Rpc.make("Transcript.UpdateSegment", {
    payload: S.Struct({ ...M.Patch.fields, dependencies: Dependencies }).pipe(RpcObserved),
    success: done(M.Detail),
    error: DeliveryError,
  }),
  Rpc.make("Transcript.DeleteSegments", {
    payload: S.Struct({ dependencies: Dependencies, downloadId: S.String, segmentIds: RpcArray(S.String) }).pipe(
      RpcObserved
    ),
    success: done(M.Detail),
    error: DeliveryError,
  }),
  Rpc.make("Transcript.InsertSegment", {
    payload: S.Struct({ ...M.Insert.fields, dependencies: Dependencies }).pipe(RpcObserved),
    success: done(S.Struct({ segmentId: S.String, snapshot: M.Detail })),
    error: DeliveryError,
  }),
  Rpc.make("Transcript.ExportVideo", {
    payload: S.Struct({ ...M.ExportInput.fields, dependencies: Dependencies }).pipe(RpcObserved),
    success: done(M.ExportResult),
    error: DeliveryError,
  }),
  Rpc.make("Transcript.CancelVideoExport", {
    payload: S.Struct({ dependencies: Dependencies }).pipe(RpcObserved),
    success: done(S.Void),
    error: DeliveryError,
  }),
  Rpc.make("Transcript.WatchChanges", {
    success: M.Changes.pipe(RpcObserved, Subscription),
    error: S.Union([TranscriptOperationError, DeliveryError]),
    stream: true,
  }),
  Rpc.make("Transcript.WatchModels", {
    success: B.ModelPrepStatus.pipe(RpcObserved, Subscription),
    error: S.Union([TranscriptOperationError, DeliveryError]),
    stream: true,
  }),
  Rpc.make("Transcript.WatchExportProgress", {
    success: M.ExportProgress.pipe(RpcObserved, Subscription),
    error: S.Union([TranscriptOperationError, DeliveryError]),
    stream: true,
  })
);
