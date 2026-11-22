import { $DesktopId } from "@vidbee/identity/packages";
import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as Q from "@vidbee/task-queue/Task.model";
import * as P from "effect/Predicate";
import * as S from "effect/Schema";
import { RpcArray } from "../RpcField.model.js";

const $I = $DesktopId.create("main/lib/RemoteCaptions.service");

/**
 * Preserves the remote-caption task snapshot, including track selection, source cookies and cancellation state.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { RemoteCaptionSnapshot } from "./RemoteCaptions.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(RemoteCaptionSnapshot)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const RemoteCaptionSnapshot = S.Struct({
  author: S.String,
  duration: S.declare(P.isNumber),
  error: S.NullOr(S.String),
  errorCode: S.NullOr(S.String),
  segments: RpcArray(S.Struct({ end: S.declare(P.isNumber), start: S.declare(P.isNumber), text: S.String })),
  selectedTrackId: S.String,
  status: LiteralKit(["running", "completed", "error", "cancelled"]),
  title: S.String,
  tracks: RpcArray(S.Struct({ auto: S.Boolean, id: S.String, label: S.String, language: S.String })),
  updatedAt: S.Finite,
  cookieSources: RpcArray(Q.DownloadCookieSource).pipe(S.UndefinedOr, S.optionalKey),
}).pipe(
  $I.annoteSchema("RemoteCaptionSnapshot", {
    description: "Remote extractor result including its existing error-as-data path.",
  })
);
/**
 * Decoded representation validated by {@link RemoteCaptionSnapshot}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type RemoteCaptionSnapshot = typeof RemoteCaptionSnapshot.Type;
