import { $DesktopId } from "@vidbee/identity/packages";
import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as Q from "@vidbee/task-queue/Task.model";
import * as P from "effect/Predicate";
import * as S from "effect/Schema";
import { RpcArray } from "../RpcField.model.js";

const $I = $DesktopId.create("main/lib/RemoteCaptions.service");

/**
 * Validates Remote Caption Snapshot at the desktop capability boundary before dispatch.
 *
 * **Example** (Use RemoteCaptionSnapshot at its owning boundary)
 *
 * ```ts
 * import { RemoteCaptionSnapshot } from "./RemoteCaptions.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(RemoteCaptionSnapshot);
 * const validated = decode({});
 * void validated;
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
 * Describes Remote Caption Snapshot ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type RemoteCaptionSnapshot = typeof RemoteCaptionSnapshot.Type;
