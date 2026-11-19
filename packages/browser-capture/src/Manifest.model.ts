import { SocialCollectionSummary } from "@vidbee/task-queue/Task.model";
import * as S from "effect/Schema";
/** The existing photo-manifest projection; writes serialize the supplied value separately. */
export const PhotoManifest = S.Struct({
  files: S.String.pipe(S.Array, S.mutable, S.mutableKey),
  ...SocialCollectionSummary.fields,
});
export type PhotoManifest = typeof PhotoManifest.Type;
