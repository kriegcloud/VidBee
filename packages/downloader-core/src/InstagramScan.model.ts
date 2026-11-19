import * as S from "effect/Schema";
import { InstagramProfileItem } from "./Profile.model.js";

export const GalleryJsonResult = S.Struct({
  cursor: S.String.pipe(S.optional, S.mutableKey),
  exitCode: S.NullOr(S.Finite).pipe(S.mutableKey),
  cancelled: S.Boolean.pipe(S.optional, S.mutableKey),
  stderr: S.String.pipe(S.mutableKey),
  directoryMetadata: S.Array(S.Record(S.String, S.mutableKey(S.Unknown))).pipe(S.mutable, S.mutableKey),
  sourceIds: S.HashSet(S.String).pipe(S.mutableKey),
  assetCount: S.Finite.pipe(S.mutableKey),
  parseError: S.Boolean.pipe(S.mutableKey),
  items: S.HashMap(S.String, InstagramProfileItem).pipe(S.mutableKey),
  itemOrder: S.Array(S.String).pipe(S.mutable, S.mutableKey),
});
export type GalleryJsonResult = typeof GalleryJsonResult.Type;
