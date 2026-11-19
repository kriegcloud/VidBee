import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as S from "effect/Schema";
import {
  InstagramCategoryState,
  InstagramInspectionErrorCode,
  InstagramProfileCategory,
  InstagramProfileInspection,
} from "./Download.model.js";
import { ProfileUrl as Url } from "./ProfileUrl.model.js";

const Counter = S.Finite.check(S.isInt(), S.isGreaterThanOrEqualTo(0));
export const MappedProfilePlatform = LiteralKit([
  "x",
  "tiktok",
  "redgifs",
  "facebook",
  "vsco",
  "threads",
  "pinterest",
  "snapchat",
]);
export type MappedProfilePlatform = typeof MappedProfilePlatform.Type;
export const SocialProfileState = LiteralKit(["unscanned", "mapping", "partial", "complete", "auth-required", "error"]);
export const SocialMappedItem = S.Struct({
  id: S.String.pipe(S.mutableKey),
  url: Url.pipe(S.mutableKey),
  author: S.String.pipe(S.mutableKey),
  title: S.String.pipe(S.optional, S.mutableKey),
  images: Counter.pipe(S.mutableKey),
  videos: Counter.pipe(S.mutableKey),
  downloaded: S.Boolean.pipe(S.optional, S.mutableKey),
  publishedAt: Counter.pipe(S.optional, S.mutableKey),
});
export type SocialMappedItem = typeof SocialMappedItem.Type;
export const SocialProfileCategory = S.Struct({
  state: SocialProfileState.pipe(S.mutableKey),
  items: S.Array(SocialMappedItem).pipe(S.mutable, S.mutableKey),
  error: S.String.pipe(S.optional, S.mutableKey),
});
export type SocialProfileCategory = typeof SocialProfileCategory.Type;
export const SocialMappedProfile = S.Struct({
  profileUrl: Url.pipe(S.mutableKey),
  platform: MappedProfilePlatform.pipe(S.mutableKey),
  owner: S.String.pipe(S.mutableKey),
  categories: S.Record(S.String, SocialProfileCategory.pipe(S.mutableKey)).pipe(S.mutableKey),
  updatedAt: S.Finite.pipe(S.mutableKey),
});
export type SocialMappedProfile = typeof SocialMappedProfile.Type;
export {
  SocialMappedItem as SocialMappedItemSchema,
  SocialMappedProfile as SocialMappedProfileSchema,
  SocialProfileCategory as SocialProfileCategorySchema,
};

const InstagramItem = S.Struct({
  id: S.String.pipe(S.mutableKey),
  url: Url.pipe(S.mutableKey),
  assetCount: Counter.pipe(S.mutableKey),
  assetIds: S.Array(S.String).pipe(S.mutable, S.optional, S.mutableKey),
  sourceVersion: S.String.pipe(S.optional, S.mutableKey),
  downloaded: S.Boolean.pipe(S.optional, S.mutableKey),
  title: S.String.pipe(S.optional, S.mutableKey),
});
export const InstagramCategory = S.Struct({
  incremental: S.Boolean.pipe(S.optional, S.mutableKey),
  cursor: S.String.pipe(S.optional, S.mutableKey),
  category: InstagramProfileCategory.pipe(S.mutableKey),
  state: InstagramCategoryState.pipe(S.mutableKey),
  sourceCount: Counter.pipe(S.mutableKey),
  assetCount: Counter.pipe(S.mutableKey),
  items: S.Array(InstagramItem).pipe(S.mutable, S.optional, S.mutableKey),
  mappedAt: S.Finite.pipe(S.optional, S.mutableKey),
  errorCode: InstagramInspectionErrorCode.pipe(S.optional, S.mutableKey),
  retryAfter: S.Finite.pipe(S.optional, S.mutableKey),
});
/** Closed at every object level: legacy inventory rewrites discard unknown keys. */
export const InstagramInventory = S.Struct({
  ...InstagramProfileInspection.fields,
  inspectionId: S.String.check(S.isNonEmpty()).pipe(S.mutableKey),
  expiresAt: S.Finite.check(S.isInt(), S.isGreaterThan(0)).pipe(S.mutableKey),
  profile: S.Struct({
    username: S.String.check(S.isNonEmpty()).pipe(S.mutableKey),
    profileUrl: Url.pipe(S.mutableKey),
    displayName: S.String.pipe(S.optional, S.mutableKey),
    avatarUrl: Url.pipe(S.optional, S.mutableKey),
    isPrivate: S.Boolean.pipe(S.optional, S.mutableKey),
  }).pipe(S.mutableKey),
  categories: S.Array(InstagramCategory).pipe(S.mutable, S.mutableKey),
  totalSourceCount: Counter.pipe(S.mutableKey),
  totalAssetCount: Counter.pipe(S.mutableKey),
});
export const InstagramInventoryJson = S.fromJsonString(InstagramInventory);
export const SocialInventoryJson = S.fromJsonString(SocialMappedProfile);
