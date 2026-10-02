import { oc } from '@orpc/contract'
import { z } from 'zod'
import { FanslyCommandSchema, FanslyDownloadSchema, FanslyProfileSchema } from './fansly-profile'
import {
  OnlyFansCommandSchema,
  OnlyFansDownloadSchema,
  OnlyFansProfileSchema
} from './onlyfans-profile'
import {
  CancelDownloadInputSchema,
  CancelDownloadOutputSchema,
  CreateDownloadInputSchema,
  CreateDownloadOutputSchema,
  DirectoryListInputSchema,
  EngineStatusSchema,
  FileExistsOutputSchema,
  FileOperationOutputSchema,
  FilePathInputSchema,
  GetWebSettingsOutputSchema,
  InstagramProfileCancelInputSchema,
  InstagramProfileCancelOutputSchema,
  InstagramProfileDownloadInputSchema,
  InstagramProfileDownloadOutputSchema,
  InstagramProfileInspectInputSchema,
  InstagramProfileInspectOutputSchema,
  InstagramProfileListOutputSchema,
  ListDirectoriesOutputSchema,
  ListDownloadsOutputSchema,
  ListHistoryOutputSchema,
  PauseDownloadInputSchema,
  PauseDownloadOutputSchema,
  PlaylistDownloadInputSchema,
  PlaylistDownloadOutputSchema,
  PlaylistInfoInputSchema,
  PlaylistInfoOutputSchema,
  RemoveHistoryByPlaylistInputSchema,
  RemoveHistoryItemsInputSchema,
  RemoveHistoryOutputSchema,
  ResolveUrlInputSchema,
  ResolveUrlOutputSchema,
  ResumeDownloadInputSchema,
  ResumeDownloadOutputSchema,
  RetryDownloadInputSchema,
  RetryDownloadOutputSchema,
  SetWebSettingsInputSchema,
  SocialMediaDownloadInputSchema,
  SocialMediaDownloadOutputSchema,
  SocialMediaInspectInputSchema,
  SocialMediaInspectOutputSchema,
  StatusOutputSchema,
  UploadSettingsFileInputSchema,
  UploadSettingsFileOutputSchema,
  VideoInfoInputSchema,
  VideoInfoOutputSchema
} from './schemas'
import { SocialMappedProfileSchema } from './social-media-service'

export const downloaderContract = {
  fanslyProfile: {
    command: oc.input(FanslyCommandSchema).output(FanslyProfileSchema),
    list: oc.output(z.array(FanslyProfileSchema)),
    download: oc.input(FanslyDownloadSchema).output(z.object({ count: z.number() }))
  },
  onlyFansProfile: {
    command: oc.input(OnlyFansCommandSchema).output(OnlyFansProfileSchema),
    list: oc.output(z.array(OnlyFansProfileSchema)),
    download: oc.input(OnlyFansDownloadSchema).output(z.object({ count: z.number() }))
  },
  socialMedia: {
    inspect: oc.input(SocialMediaInspectInputSchema).output(SocialMediaInspectOutputSchema),
    download: oc.input(SocialMediaDownloadInputSchema).output(SocialMediaDownloadOutputSchema)
  },
  socialProfile: {
    get: oc.input(z.object({ url: z.url() })).output(SocialMappedProfileSchema),
    list: oc.output(z.array(SocialMappedProfileSchema)),
    map: oc
      .input(z.object({ url: z.url(), category: z.string().min(1) }))
      .output(SocialMappedProfileSchema),
    stop: oc.input(z.object({ url: z.url() })).output(SocialMappedProfileSchema),
    download: oc
      .input(
        z.object({
          url: z.url(),
          category: z.string().min(1),
          ids: z.array(z.string()).min(1),
          destination: z.string().optional()
        })
      )
      .output(z.object({ count: z.number().int().nonnegative() }))
  },
  status: oc.output(StatusOutputSchema),
  videoInfo: oc.input(VideoInfoInputSchema).output(VideoInfoOutputSchema),
  resolveUrl: oc.input(ResolveUrlInputSchema).output(ResolveUrlOutputSchema),
  playlist: {
    info: oc.input(PlaylistInfoInputSchema).output(PlaylistInfoOutputSchema),
    download: oc.input(PlaylistDownloadInputSchema).output(PlaylistDownloadOutputSchema)
  },
  instagramProfile: {
    list: oc.output(InstagramProfileListOutputSchema),
    cancel: oc.input(InstagramProfileCancelInputSchema).output(InstagramProfileCancelOutputSchema),
    inspect: oc
      .input(InstagramProfileInspectInputSchema)
      .output(InstagramProfileInspectOutputSchema),
    download: oc
      .input(InstagramProfileDownloadInputSchema)
      .output(InstagramProfileDownloadOutputSchema)
  },
  downloads: {
    create: oc.input(CreateDownloadInputSchema).output(CreateDownloadOutputSchema),
    list: oc.output(ListDownloadsOutputSchema),
    cancel: oc.input(CancelDownloadInputSchema).output(CancelDownloadOutputSchema),
    pause: oc.input(PauseDownloadInputSchema).output(PauseDownloadOutputSchema),
    resume: oc.input(ResumeDownloadInputSchema).output(ResumeDownloadOutputSchema),
    retry: oc.input(RetryDownloadInputSchema).output(RetryDownloadOutputSchema)
  },
  history: {
    list: oc.output(ListHistoryOutputSchema),
    removeItems: oc.input(RemoveHistoryItemsInputSchema).output(RemoveHistoryOutputSchema),
    removeByPlaylist: oc.input(RemoveHistoryByPlaylistInputSchema).output(RemoveHistoryOutputSchema)
  },
  files: {
    exists: oc.input(FilePathInputSchema).output(FileExistsOutputSchema),
    listDirectories: oc.input(DirectoryListInputSchema).output(ListDirectoriesOutputSchema),
    openFile: oc.input(FilePathInputSchema).output(FileOperationOutputSchema),
    openFileLocation: oc.input(FilePathInputSchema).output(FileOperationOutputSchema),
    copyFileToClipboard: oc.input(FilePathInputSchema).output(FileOperationOutputSchema),
    deleteFile: oc.input(FilePathInputSchema).output(FileOperationOutputSchema),
    uploadSettingsFile: oc
      .input(UploadSettingsFileInputSchema)
      .output(UploadSettingsFileOutputSchema)
  },
  settings: {
    get: oc.output(GetWebSettingsOutputSchema),
    set: oc.input(SetWebSettingsInputSchema).output(GetWebSettingsOutputSchema)
  },
  engines: {
    status: oc.output(EngineStatusSchema),
    check: oc.output(EngineStatusSchema),
    update: oc.output(EngineStatusSchema)
  }
}
