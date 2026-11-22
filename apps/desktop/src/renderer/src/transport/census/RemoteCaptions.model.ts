import { $DesktopId } from "@vidbee/identity/packages";
import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as Q from "@vidbee/task-queue/Task.model";
import * as P from "effect/Predicate";
import * as S from "effect/Schema";

const $I = $DesktopId.create("main/lib/RemoteCaptions.service");
export const RemoteCaptionSnapshot = S.Struct({
  author: S.String,
  duration: S.declare(P.isNumber),
  error: S.NullOr(S.String),
  errorCode: S.NullOr(S.String),
  segments: S.Array(S.Struct({ end: S.declare(P.isNumber), start: S.declare(P.isNumber), text: S.String })),
  selectedTrackId: S.String,
  status: LiteralKit(["running", "completed", "error", "cancelled"]),
  title: S.String,
  tracks: S.Array(S.Struct({ auto: S.Boolean, id: S.String, label: S.String, language: S.String })),
  updatedAt: S.Finite,
  cookieSources: S.Array(Q.DownloadCookieSource).pipe(S.optional),
}).pipe(
  $I.annoteSchema("RemoteCaptionSnapshot", {
    description: "Remote extractor result including its existing error-as-data path.",
  })
);
export type RemoteCaptionSnapshot = typeof RemoteCaptionSnapshot.Type;
