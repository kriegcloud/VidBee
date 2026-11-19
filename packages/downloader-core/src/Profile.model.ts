import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as S from "effect/Schema";
export const InstagramProfileCategory = LiteralKit(["posts", "reels", "stories", "highlights", "tagged"]);
export type InstagramProfileCategory = typeof InstagramProfileCategory.Type;
export const InstagramCategoryState = LiteralKit([
  "cancelled",
  "unscanned",
  "ready",
  "empty",
  "auth-required",
  "unavailable",
]);
export type InstagramCategoryState = typeof InstagramCategoryState.Type;
export const InstagramInspectionErrorCode = LiteralKit([
  "auth-required",
  "rate-limited",
  "not-found",
  "network",
  "binary-missing",
  "unavailable",
]);
export type InstagramInspectionErrorCode = typeof InstagramInspectionErrorCode.Type;
export const InstagramProfileItem = S.Struct({
  assetIds: S.Array(S.String).pipe(S.mutable, S.optional, S.mutableKey),
  sourceVersion: S.String.pipe(S.optional, S.mutableKey),
  downloaded: S.Boolean.pipe(S.optional, S.mutableKey),
  id: S.String.pipe(S.mutableKey),
  url: S.String.pipe(S.mutableKey),
  assetCount: S.Finite.pipe(S.mutableKey),
  title: S.String.pipe(S.optional, S.mutableKey),
});
export type InstagramProfileItem = typeof InstagramProfileItem.Type;
export const InstagramCategorySummary = S.Struct({
  incremental: S.Boolean.pipe(S.optional, S.mutableKey),
  cursor: S.String.pipe(S.optional, S.mutableKey),
  category: InstagramProfileCategory.pipe(S.mutableKey),
  state: InstagramCategoryState.pipe(S.mutableKey),
  sourceCount: S.Finite.pipe(S.mutableKey),
  assetCount: S.Finite.pipe(S.mutableKey),
  errorCode: InstagramInspectionErrorCode.pipe(S.optional, S.mutableKey),
  retryAfter: S.Finite.pipe(S.optional, S.mutableKey),
  items: S.Array(InstagramProfileItem).pipe(S.mutable, S.optional, S.mutableKey),
  mappedAt: S.Finite.pipe(S.optional, S.mutableKey),
});
export type InstagramCategorySummary = typeof InstagramCategorySummary.Type;
export const InstagramProfileInspection = S.Struct({
  mapping: S.Struct({
    category: InstagramProfileCategory.pipe(S.mutableKey),
    state: LiteralKit(["queued", "running"]).pipe(S.mutableKey),
  }).pipe(S.optional, S.mutableKey),
  inspectionId: S.String.pipe(S.mutableKey),
  expiresAt: S.Finite.pipe(S.mutableKey),
  complete: S.Boolean.pipe(S.mutableKey),
  profile: S.Struct({
    username: S.String.pipe(S.mutableKey),
    profileUrl: S.String.pipe(S.mutableKey),
    displayName: S.String.pipe(S.optional, S.mutableKey),
    avatarUrl: S.String.pipe(S.optional, S.mutableKey),
    isPrivate: S.Boolean.pipe(S.optional, S.mutableKey),
  }).pipe(S.mutableKey),
  categories: S.Array(InstagramCategorySummary).pipe(S.mutable, S.mutableKey),
  totalSourceCount: S.Finite.pipe(S.mutableKey),
  totalAssetCount: S.Finite.pipe(S.mutableKey),
});
export type InstagramProfileInspection = typeof InstagramProfileInspection.Type;
