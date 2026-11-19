import { SocialCollectionSummary } from "@vidbee/task-queue/Task.model";
import * as S from "effect/Schema";
import * as Model from "./Download.model.js";
import { InstagramCategory, InstagramInventory } from "./ProfilePersistence.model.js";
import { ProfileUrl } from "./ProfileUrl.model.js";
import { MAX_SUBTITLE_LANGUAGES } from "./subtitle-languages.js";

// Public validation boundaries preserve the original zod constraints. Native
// in-process data models keep their existing types and construction behavior.
const Counter = S.Finite.check(S.isInt(), S.isGreaterThanOrEqualTo(0));
const PositiveInteger = S.Finite.check(S.isInt(), S.isGreaterThan(0));
const NonEmpty = S.String.check(S.isNonEmpty());

export {
  DirectoryEntry as DirectoryEntrySchema,
  DirectoryListInput as DirectoryListInputSchema,
  DownloadProgress as DownloadProgressSchema,
  DownloadStatus as DownloadStatusSchema,
  DownloadType as DownloadTypeSchema,
  FileExistsOutput as FileExistsOutputSchema,
  FileOperationOutput as FileOperationOutputSchema,
  InstagramCategoryState as InstagramCategoryStateSchema,
  InstagramInspectionErrorCode as InstagramInspectionErrorCodeSchema,
  InstagramProfileCategory as InstagramProfileCategorySchema,
  InstagramProfileItem as InstagramProfileItemSchema,
  ListDirectoriesOutput as ListDirectoriesOutputSchema,
  PlaylistMediaKind as PlaylistMediaKindSchema,
  TaskQueueErrorCategory as TaskQueueErrorCategorySchema,
  TaskQueueInternalStatus as TaskQueueInternalStatusSchema,
  TaskQueueSubStatus as TaskQueueSubStatusSchema,
  UploadSettingsFileKind as UploadSettingsFileKindSchema,
  UploadSettingsFileOutput as UploadSettingsFileOutputSchema,
  VideoFormat as VideoFormatSchema,
  VideoInfo as VideoInfoSchema,
} from "./Download.model.js";
export {
  OneClickContainerOption as OneClickContainerOptionSchema,
  OneClickQualityPreset as OneClickQualityPresetSchema,
} from "./format-preferences.js";

const { cookieSource: _cookieSource, ...publicRuntimeFields } = Model.DownloadRuntimeSettings.fields;
export const DownloadRuntimeSettingsSchema = S.Struct({
  ...publicRuntimeFields,
  subtitleLanguages: S.Array(S.String)
    .check(S.isMaxLength(MAX_SUBTITLE_LANGUAGES))
    .pipe(S.mutable, S.optional, S.mutableKey),
});

export const CreateDownloadInputSchema = S.Struct({
  ...Model.CreateDownloadInput.fields,
  settings: DownloadRuntimeSettingsSchema.pipe(S.optional, S.mutableKey),
  url: ProfileUrl.pipe(S.mutableKey),
});
export const VideoInfoInputSchema = S.Struct({
  ...Model.VideoInfoInput.fields,
  settings: DownloadRuntimeSettingsSchema.pipe(S.optional, S.mutableKey),
  url: ProfileUrl.pipe(S.mutableKey),
});
export const PlaylistInfoInputSchema = S.Struct({
  ...Model.PlaylistInfoInput.fields,
  settings: DownloadRuntimeSettingsSchema.pipe(S.optional, S.mutableKey),
  url: ProfileUrl.pipe(S.mutableKey),
});
export const PlaylistEntrySchema = S.Struct({ ...Model.PlaylistEntry.fields, url: ProfileUrl.pipe(S.mutableKey) });
export const PlaylistInfoSchema = S.Struct({
  ...Model.PlaylistInfo.fields,
  entries: S.Array(PlaylistEntrySchema).pipe(S.mutable, S.mutableKey),
});
export const PlaylistDownloadInputSchema = S.Struct({
  ...Model.PlaylistDownloadInput.fields,
  settings: DownloadRuntimeSettingsSchema.pipe(S.optional, S.mutableKey),
  url: ProfileUrl.pipe(S.mutableKey),
  startIndex: PositiveInteger.pipe(S.optional, S.mutableKey),
  endIndex: PositiveInteger.pipe(S.optional, S.mutableKey),
});
export const PlaylistDownloadEntrySchema = S.Struct({
  ...Model.PlaylistDownloadEntry.fields,
  url: ProfileUrl.pipe(S.mutableKey),
});
export const PlaylistDownloadResultSchema = S.Struct({
  ...Model.PlaylistDownloadResult.fields,
  entries: S.Array(PlaylistDownloadEntrySchema).pipe(S.mutable, S.mutableKey),
});
export const InstagramProfileInspectInputSchema = S.Struct({
  ...Model.InstagramProfileInspectInput.fields,
  settings: DownloadRuntimeSettingsSchema.pipe(S.optional, S.mutableKey),
  url: ProfileUrl.pipe(S.mutableKey),
});
export const InstagramProfileDownloadInputSchema = S.Struct({
  ...Model.InstagramProfileDownloadInput.fields,
  settings: DownloadRuntimeSettingsSchema.pipe(S.optional, S.mutableKey),
  inspectionId: NonEmpty.pipe(S.mutableKey),
  categories: S.Array(Model.InstagramProfileCategory).check(S.isMinLength(1)).pipe(S.mutable, S.mutableKey),
});
export const InstagramCategorySummarySchema = InstagramCategory;
export const InstagramProfileInspectionSchema = InstagramInventory;
export const InstagramProfileDownloadTaskSchema = S.Struct({
  ...Model.InstagramProfileDownloadTask.fields,
  sourceCount: Counter.pipe(S.mutableKey),
  assetCount: Counter.pipe(S.mutableKey),
});
export const InstagramProfileDownloadResultSchema = S.Struct({
  ...Model.InstagramProfileDownloadResult.fields,
  totalSourceCount: Counter.pipe(S.mutableKey),
  totalAssetCount: Counter.pipe(S.mutableKey),
  tasks: S.Array(InstagramProfileDownloadTaskSchema).pipe(S.mutable, S.mutableKey),
});
export const FilePathInputSchema = S.Struct({ path: NonEmpty.pipe(S.mutableKey) });
export const UploadSettingsFileInputSchema = S.Struct({
  ...Model.UploadSettingsFileInput.fields,
  fileName: S.Trim.check(S.isMinLength(1), S.isMaxLength(255)).pipe(S.mutableKey),
  content: S.String.check(S.isMinLength(1), S.isMaxLength(1_000_000)).pipe(S.mutableKey),
});
export const CollectionSummary = S.Struct({
  ...SocialCollectionSummary.fields,
  posts: Counter.pipe(S.mutableKey),
  images: Counter.pipe(S.mutableKey),
  videos: Counter.pipe(S.mutableKey),
  downloaded: Counter.pipe(S.mutableKey),
  existing: Counter.pipe(S.mutableKey),
  failed: Counter.pipe(S.mutableKey),
  totalSize: Counter.pipe(S.mutableKey),
});
export const DownloadTaskSchema = S.Struct({
  ...Model.DownloadTask.fields,
  url: ProfileUrl.pipe(S.mutableKey),
  batchOrder: Counter.pipe(S.optional, S.mutableKey),
  batchSourceCount: Counter.pipe(S.optional, S.mutableKey),
  batchAssetCount: Counter.pipe(S.optional, S.mutableKey),
  fileCount: Counter.pipe(S.optional, S.mutableKey),
  downloadedCount: Counter.pipe(S.optional, S.mutableKey),
  skippedCount: Counter.pipe(S.optional, S.mutableKey),
  failedCount: Counter.pipe(S.optional, S.mutableKey),
  totalSize: Counter.pipe(S.optional, S.mutableKey),
  attempt: Counter.pipe(S.optional, S.mutableKey),
  maxAttempts: Counter.pipe(S.optional, S.mutableKey),
  collectionSummary: CollectionSummary.pipe(S.optional, S.mutableKey),
});
