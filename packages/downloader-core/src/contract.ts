import { oc } from '@orpc/contract'
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
  InstagramProfileDownloadInputSchema,
  InstagramProfileDownloadOutputSchema,
  InstagramProfileInspectInputSchema,
  InstagramProfileInspectOutputSchema,
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

export const downloaderContract = {
  socialMedia: {
    inspect: oc.input(SocialMediaInspectInputSchema).output(SocialMediaInspectOutputSchema),
    download: oc.input(SocialMediaDownloadInputSchema).output(SocialMediaDownloadOutputSchema)
  },
  status: oc.output(StatusOutputSchema),
  videoInfo: oc.input(VideoInfoInputSchema).output(VideoInfoOutputSchema),
  resolveUrl: oc.input(ResolveUrlInputSchema).output(ResolveUrlOutputSchema),
  playlist: {
    info: oc.input(PlaylistInfoInputSchema).output(PlaylistInfoOutputSchema),
    download: oc.input(PlaylistDownloadInputSchema).output(PlaylistDownloadOutputSchema)
  },
  instagramProfile: {
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
