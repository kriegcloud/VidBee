import type {
  InstagramProfileCategory,
  InstagramProfileDownloadInput,
  InstagramProfileDownloadResult,
  InstagramProfileInspection
} from '@vidbee/downloader-core'
import type { CookieHealth, InstalledCookieBrowser } from '@vidbee/downloader-core/cookie-setup'
import type { OnlyFansCommand, OnlyFansDownload } from '@vidbee/downloader-core/onlyfans-profile'
import type { SocialMediaDownloadRequest } from '@vidbee/downloader-core/social-media-service'
import type { SubscriptionDownloadPreferences } from '@vidbee/subscriptions-core/types'
import type { TaskCreationMetadata } from '@vidbee/task-queue'
import type {
  AsrTierId,
  ModelPrepStatus,
  ModelStatus,
  PipelineSegment,
  SpeakerCount,
  TranscriptionStage,
  TranscriptPlaybackCue,
  TranscriptRecord,
  TranscriptSourceKind,
  TranscriptSourceOption,
  TranscriptStageTiming
} from '@vidbee/transcription'
import type * as Electron from 'electron'
import type {
  AgentChatInput,
  AgentImageUpload,
  AgentThinkingLevel,
  AgentThread,
  AgentThreadSummary
} from '../agent-chat'
import type {
  AiPrompt,
  AiPromptRunInput,
  AiPromptRunSnapshot,
  AiPromptWriteInput,
  AiProviderPreset,
  AiProviderPresetId,
  AiProviderTestResult,
  AiProviderWriteInput,
  AiSettingsSnapshot
} from '../ai-types'
import type { AppIconMenuState } from '../app-icon-menu'
import type { ExtensionCookieConnection } from '../extension-cookies'
import type { DesktopMcpCapabilityGroup, DesktopMcpStatus } from '../mcp'
import type { GitHubSkillInstallInput, GitHubSkillSource } from '../skill-install'
import type {
  AppSettings,
  DownloadHistoryItem,
  DownloadItem,
  DownloadOptions,
  PlaylistDownloadOptions,
  PlaylistDownloadResult,
  PlaylistInfo,
  SubscriptionResolvedFeed,
  SubscriptionRule,
  SubscriptionUpdatePayload,
  VideoInfo,
  VideoInfoCommandResult,
  YtDlpKernelStatus
} from '../types'
import type {
  DesktopAccountOverview,
  DesktopAiCreditHistory,
  DesktopAiCreditHistoryCursor,
  DesktopAiCreditSnapshot,
  DesktopAiCreditUsage,
  DesktopAiReservation,
  DesktopCloudCacheStats,
  DesktopGiftedCreditRecord,
  DesktopInvitationOverview,
  DesktopInvitedUser,
  DesktopPaginatedResult
} from '../types/auth'
import type { PlayerAttachInput, PlayerAttachResult } from '../types/player'
import type { ShareCardPayload } from './share-card'

interface IpcContext {
  readonly sender: unknown
  readonly event: unknown
}
type VideoSubtitleEncode = 'soft' | 'hard'
type VideoSubtitleExportResult =
  | {
      path: string
      status: 'saved'
    }
  | {
      status: 'canceled'
    }
  | {
      reason: 'missing-source' | 'audio-only'
      status: 'unavailable'
    }
  | {
      message: string
      status: 'failed'
    }
interface VideoSubtitleExportInput {
  defaultFileName: string
  mode: VideoSubtitleEncode
  sourcePath: string
  subtitleText: string
}
type LocalMediaRejectReason = 'missing' | 'not-media'
interface ImportLocalMediaItem {
  path: string
  downloadId: string
  created: boolean
  reused: boolean
  historyItem: DownloadHistoryItem
}
interface ImportLocalMediaRejected {
  path: string
  reason: LocalMediaRejectReason
}
interface ImportLocalMediaResult {
  imported: ImportLocalMediaItem[]
  rejected: ImportLocalMediaRejected[]
}
interface TranscriptSnapshot {
  creation?: TaskCreationMetadata
  downloadTaskId: string
  transcriptionTaskId: string | null
  transcriptId: string | null
  listState: TranscriptListState
  stage: TranscriptionStage | null
  stageHistory: TranscriptStageTiming[]
  error: string | null
  sourceFilePath: string | null
  title: string | null
  updatedAt: number
  record: TranscriptRecord | null
  asrTier: AsrTierId | null
  speakerCount: SpeakerCount
  sourceKind: TranscriptSourceKind | null
  sources: TranscriptSourceOption[]
  /** True while a speaker overlay task is queued or running. Recognition is not re-run. */
  rediarize: boolean
}
interface TranscriptPlaybackCueSnapshot {
  language: string | null
  segments: TranscriptPlaybackCue[]
  sourceKind: TranscriptSourceKind
  snapshotSourceKind: TranscriptSourceKind | null
  transcriptId: string
  updatedAt: number
}
type TranscriptListState =
  | 'none'
  | 'queued'
  | 'running'
  | 'completed'
  | 'no-speech'
  | 'failed'
  | 'cancelled'
  | 'retry-scheduled'
interface TranscriptListRecord {
  asrTier: string | null
  createdAt: number
  id: string
  language: string | null
  modelVersion: string
  resultKind: 'transcript' | 'no-speech'
  sourceKind: TranscriptSourceKind
  updatedAt: number
}
interface TranscriptListSnapshot {
  asrTier: AsrTierId | null
  creation?: TaskCreationMetadata
  downloadTaskId: string
  error: string | null
  listState: TranscriptListState
  record: TranscriptListRecord | null
  rediarize: boolean
  sourceFilePath: string | null
  sourceKind: TranscriptSourceKind | null
  speakerCount: SpeakerCount
  stage: TranscriptionStage | null
  stageHistory: TranscriptStageTiming[]
  title: string | null
  transcriptId: string | null
  transcriptionTaskId: string | null
  updatedAt: number
}
interface LocalPosterRequest {
  /** The task's own saved file, when the renderer managed to resolve one. */
  filePath?: string | null
  /** A collection's output directory, used when there is no single file. */
  directory?: string | null
}
interface CatalogModelOption {
  label: string
  value: string
}
interface CatalogModelCapabilities {
  allowDisableThinking: boolean
  contextWindow: number
  id: string
  maxTokens?: number
  name: string
  reasoning: boolean
  thinkingLevels: AgentThinkingLevel[]
  thinkingOnly: boolean
  vision: boolean
}
interface AiRemoteModelsInput {
  apiKey?: string
  baseUrl?: string
  id?: string
  presetId: AiProviderPresetId
}
interface ExportVideoSource {
  url: string
  label?: string
}
interface CreateSubscriptionOptions extends SubscriptionDownloadPreferences {
  url: string
  keywords?: string[]
  tags?: string[]
  onlyDownloadLatest?: boolean
  autoDownload?: boolean
  downloadDirectory?: string
  namingTemplate?: string
  enabled?: boolean
  /** Profile subscriptions only: followed categories and check interval. */
  categories?: string[]
  checkIntervalMs?: number
}
/** Transitional browser protocol for retained decorator channels. No main implementation enters this graph.
 * @category protocols
 * @since 0.0.0
 */
interface LegacyServices {
  account: {
    getOverview(_context: IpcContext): Promise<DesktopAccountOverview>
    getAiCreditSnapshot(_context: IpcContext): Promise<DesktopAiCreditSnapshot>
    getAiCreditHistory(
      _context: IpcContext,
      cursor?: DesktopAiCreditHistoryCursor
    ): Promise<DesktopAiCreditHistory>
    getCacheStats(_context: IpcContext): Promise<DesktopCloudCacheStats>
    getAiCredits(_context: IpcContext): Promise<DesktopAiCreditUsage>
    getAiReservations(_context: IpcContext): Promise<DesktopAiReservation[]>
    cancelAiReservation(_context: IpcContext, requestId: string): Promise<void>
    getInvitationOverview(_context: IpcContext): Promise<DesktopInvitationOverview>
    getInvitedUsers(
      _context: IpcContext,
      cursor?: string
    ): Promise<DesktopPaginatedResult<DesktopInvitedUser>>
    getGiftedCreditRecords(
      _context: IpcContext,
      cursor?: string
    ): Promise<DesktopPaginatedResult<DesktopGiftedCreditRecord>>
  }
  ai: {
    getAgentUiTasks(_context: IpcContext, ids: string[]): import('../agent-ui').AgentUiTask[]
    takeAgentNotificationTarget(): {
      threadId: string
      downloadId: string
      promptId: string
    } | null
    getAgentComposerOptions(): Promise<import('../extension-chat').AgentComposerOptions>
    selectAgentComposerModel(_context: IpcContext, value: string): Promise<void>
    setAgentThinkingLevel(
      _context: IpcContext,
      input: {
        threadId: string
        level: AgentThinkingLevel
      }
    ): AgentThread
    getAgentThinkingOptions(): Promise<import('../agent-chat').AgentThinkingOptions>
    getAgentThread(
      _context: IpcContext,
      input: {
        downloadId: string
        promptId: string
        threadId?: string
      }
    ): AgentThread
    createAgentThread(
      _context: IpcContext,
      input: {
        downloadId: string
      }
    ): AgentThread
    sendAgentMessage(_context: IpcContext, input: AgentChatInput): AgentThread
    decideAgentTool(
      _context: IpcContext,
      input: {
        threadId: string
        toolCallId: string
        approved: boolean
        remember: boolean
      }
    ): void
    selectAgentImages(
      _context: IpcContext,
      threadId: string,
      files?: AgentImageUpload[]
    ): Promise<AgentThread>
    removeAgentImage(
      _context: IpcContext,
      input: {
        threadId: string
        imageId: string
      }
    ): Promise<AgentThread>
    stopAgentRun(_context: IpcContext, threadId: string): Promise<AgentThread | null>
    selectAgentBranch(
      _context: IpcContext,
      input: {
        threadId: string
        messageId: string
      }
    ): AgentThread
    getAgentEvents(
      _context: IpcContext,
      input: {
        threadId: string
        after: number
      }
    ): {
      events: import('../agent-chat').AgentRunEvent[]
      snapshot: AgentThread | null
    }
    listAgentHistory(_context: IpcContext): AgentThreadSummary[]
    listAgentThreads(
      _context: IpcContext,
      input: {
        downloadId: string
      }
    ): AgentThreadSummary[]
    renameAgentThread(
      _context: IpcContext,
      input: {
        threadId: string
        title: string
      }
    ): AgentThreadSummary[]
    deleteAgentThread(_context: IpcContext, threadId: string): Promise<AgentThreadSummary[]>
    saveAgentArtifact(
      _context: IpcContext,
      input: {
        threadId: string
        artifactId: string
      }
    ): Promise<boolean>
    getSnapshot(_context: IpcContext): AiSettingsSnapshot
    listPresets(_context: IpcContext): AiProviderPreset[]
    lookupCatalogModel(
      _context: IpcContext,
      input: {
        presetId: AiProviderPresetId
        modelId: string
      }
    ): CatalogModelCapabilities | null
    listCatalogModels(_context: IpcContext, presetId: AiProviderPresetId): CatalogModelOption[]
    listRemoteModels(
      _context: IpcContext,
      input: AiRemoteModelsInput
    ): Promise<CatalogModelOption[]>
    upsertProvider(_context: IpcContext, input: AiProviderWriteInput): AiSettingsSnapshot
    deleteProvider(_context: IpcContext, id: string): AiSettingsSnapshot
    setActiveProvider(_context: IpcContext, id: string | null): AiSettingsSnapshot
    getCloudModels(_context: IpcContext): Promise<{
      models: import('../ai-types').CloudModelOption[]
      defaultModelId: string
    }>
    setCloudModel(_context: IpcContext, id: string): Promise<AiSettingsSnapshot>
    upsertPrompt(_context: IpcContext, input: AiPromptWriteInput): AiPrompt
    customizeSkill(_context: IpcContext, name: string): AiPrompt
    importSkillDocument(_context: IpcContext, document: string): AiPrompt
    importSkillUpload(
      _context: IpcContext,
      input: {
        name: string
        bytes: Uint8Array
      }
    ): AiPrompt
    inspectGitHubSkills(_context: IpcContext, url: string): Promise<GitHubSkillSource>
    importGitHubSkill(_context: IpcContext, input: GitHubSkillInstallInput): Promise<AiPrompt>
    setSkillAutoRun(
      _context: IpcContext,
      input: {
        name: string
        autoRun: boolean
      }
    ): AiSettingsSnapshot
    setSkillTranscriptVisibility(
      _context: IpcContext,
      input: {
        name: string
        showInTranscript: boolean
      }
    ): AiSettingsSnapshot
    exportSkillDocument(_context: IpcContext, id: string): string
    openSkillDirectory(_context: IpcContext, id?: string): Promise<void>
    deletePrompt(_context: IpcContext, id: string): AiSettingsSnapshot
    restoreDefaultPrompts(_context: IpcContext): AiSettingsSnapshot
    dislikePrompt(_context: IpcContext, resultId: string): Promise<void>
    startPrompt(_context: IpcContext, input: AiPromptRunInput): AiPromptRunSnapshot
    stopPrompt(
      _context: IpcContext,
      input: {
        downloadId: string
        promptId: string
      }
    ): AiPromptRunSnapshot
    getPromptRun(
      _context: IpcContext,
      input: {
        downloadId: string
        promptId: string
      }
    ): AiPromptRunSnapshot
    testProvider(_context: IpcContext, input: AiProviderWriteInput): Promise<AiProviderTestResult>
  }
  app: {
    getVersion(_context: IpcContext): string
    getPlatform(_context: IpcContext): string
    getDownloaderStatus(_context: IpcContext): Promise<{
      ytdlpReady: boolean
      ffmpegReady: boolean
    }>
    getYtDlpKernelStatus(_context: IpcContext): YtDlpKernelStatus
    retryYtDlpKernelPreparation(_context: IpcContext): Promise<YtDlpKernelStatus>
    getOsVersion(_context: IpcContext): string
    quit(_context: IpcContext): void
    showMessageBox(
      _context: IpcContext,
      options: Electron.MessageBoxOptions
    ): Promise<Electron.MessageBoxReturnValue>
    getSiteIcon(_context: IpcContext, domain: string): Promise<string | null>
  }
  browserCookies: {
    listInstalledBrowsers(_context: IpcContext): InstalledCookieBrowser[]
    getExtensionConnection(_context: IpcContext): ExtensionCookieConnection
    setExtensionSourceOrder(_context: IpcContext, sourceIds: string[]): ExtensionCookieConnection
    removeExtensionSource(_context: IpcContext, sourceId: string): ExtensionCookieConnection
    inspectCookieHealth(
      _context: IpcContext,
      input: {
        browser: string
        profile: string
        cookiesPath: string
      }
    ): Promise<CookieHealth>
    getBrowserProfilePath(_context: IpcContext, browser: string): string
    validateBrowserProfilePath(
      _context: IpcContext,
      browser: string,
      profilePath: string
    ): {
      valid: boolean
      reason?: string
    }
  }
  download: {
    fanslyProfileCommand(
      _context: IpcContext,
      input: OnlyFansCommand
    ): Promise<{
      username: string
      profileUrl: string
      chatId?: string | undefined
      chatRoute?: 'gallery' | 'messages' | 'opened' | 'photos' | 'purchased' | 'videos' | undefined
      purchasedUserId?: string | undefined
      purchasedRoute?: 'all' | 'messages' | 'photos' | 'posts' | 'videos' | undefined
      creatorUsername?: string | undefined
      linkedChatId?: string | undefined
      state: 'auth-required' | 'complete' | 'error' | 'idle' | 'mapping' | 'partial'
      category?: 'media' | 'photos' | 'posts' | 'videos' | undefined
      updatedAt: number
      pages: number
      items: {
        id: string
        postId: string
        category: 'photos' | 'videos'
        state: 'available' | 'drm' | 'locked' | 'unsupported'
        downloaded: boolean
      }[]
      error?: string | undefined
    }>
    listFanslyProfiles(_context: IpcContext): {
      username: string
      profileUrl: string
      chatId?: string | undefined
      chatRoute?: 'gallery' | 'messages' | 'opened' | 'photos' | 'purchased' | 'videos' | undefined
      purchasedUserId?: string | undefined
      purchasedRoute?: 'all' | 'messages' | 'photos' | 'posts' | 'videos' | undefined
      creatorUsername?: string | undefined
      linkedChatId?: string | undefined
      state: 'auth-required' | 'complete' | 'error' | 'idle' | 'mapping' | 'partial'
      category?: 'media' | 'photos' | 'posts' | 'videos' | undefined
      updatedAt: number
      pages: number
      items: {
        id: string
        postId: string
        category: 'photos' | 'videos'
        state: 'available' | 'drm' | 'locked' | 'unsupported'
        downloaded: boolean
      }[]
      error?: string | undefined
    }[]
    downloadFanslyProfile(
      _context: IpcContext,
      input: OnlyFansDownload
    ): Promise<{
      count: number
    }>
    onlyFansProfileCommand(
      _context: IpcContext,
      input: OnlyFansCommand
    ): Promise<{
      username: string
      profileUrl: string
      chatId?: string | undefined
      chatRoute?: 'gallery' | 'messages' | 'opened' | 'photos' | 'purchased' | 'videos' | undefined
      purchasedUserId?: string | undefined
      purchasedRoute?: 'all' | 'messages' | 'photos' | 'posts' | 'videos' | undefined
      creatorUsername?: string | undefined
      linkedChatId?: string | undefined
      state: 'auth-required' | 'complete' | 'error' | 'idle' | 'mapping' | 'partial'
      category?: 'media' | 'photos' | 'posts' | 'videos' | undefined
      updatedAt: number
      pages: number
      items: {
        id: string
        postId: string
        category: 'photos' | 'videos'
        state: 'available' | 'drm' | 'locked' | 'unsupported'
        downloaded: boolean
      }[]
      error?: string | undefined
    }>
    listOnlyFansProfiles(_context: IpcContext): {
      username: string
      profileUrl: string
      chatId?: string | undefined
      chatRoute?: 'gallery' | 'messages' | 'opened' | 'photos' | 'purchased' | 'videos' | undefined
      purchasedUserId?: string | undefined
      purchasedRoute?: 'all' | 'messages' | 'photos' | 'posts' | 'videos' | undefined
      creatorUsername?: string | undefined
      linkedChatId?: string | undefined
      state: 'auth-required' | 'complete' | 'error' | 'idle' | 'mapping' | 'partial'
      category?: 'media' | 'photos' | 'posts' | 'videos' | undefined
      updatedAt: number
      pages: number
      items: {
        id: string
        postId: string
        category: 'photos' | 'videos'
        state: 'available' | 'drm' | 'locked' | 'unsupported'
        downloaded: boolean
      }[]
      error?: string | undefined
    }[]
    downloadOnlyFansProfile(
      _context: IpcContext,
      input: OnlyFansDownload
    ): Promise<{
      count: number
    }>
    inspectSocialMedia(
      _context: IpcContext,
      url: string
    ): Promise<{
      source: {
        platform: 'instagram' | 'reddit' | 'tiktok' | 'x'
        url: string
        kind: 'feed' | 'image' | 'post' | 'profile' | 'unsupported'
        category: string
        owner: string
        supportsThread: boolean
        requiresAuth: boolean
        categories: {
          key: string
          url: string
          requiresAuth: boolean
        }[]
      }
      preview: {
        posts: number
        images: number
        videos: number
        limited: boolean
      }
    }>
    openSocialProfileLogin(_context: IpcContext, url: string): Promise<void>
    getSocialProfile(
      _context: IpcContext,
      url: string
    ): import('@vidbee/downloader-core/social-media-service').SocialMappedProfile
    listSocialProfiles(
      _context: IpcContext
    ): import('@vidbee/downloader-core/social-media-service').SocialMappedProfile[]
    mapSocialProfile(
      _context: IpcContext,
      url: string,
      category: string
    ): import('@vidbee/downloader-core/social-media-service').SocialMappedProfile
    stopSocialProfile(
      _context: IpcContext,
      url: string
    ): Promise<import('@vidbee/downloader-core/social-media-service').SocialMappedProfile>
    downloadSocialProfileItems(
      _context: IpcContext,
      url: string,
      category: string,
      ids: string[],
      destination?: string
    ): Promise<{
      count: number
    }>
    downloadSocialMedia(
      _context: IpcContext,
      request: SocialMediaDownloadRequest
    ): Promise<{
      groupId: string
      ids: string[]
    }>
    getVideoInfo(_context: IpcContext, url: string): Promise<VideoInfo>
    resolveUrl(_context: IpcContext, url: string): Promise<string>
    getVideoInfoWithCommand(_context: IpcContext, url: string): Promise<VideoInfoCommandResult>
    getPlaylistInfo(_context: IpcContext, url: string): Promise<PlaylistInfo>
    listInstagramProfiles(
      _context: IpcContext
    ): import('@vidbee/downloader-core/instagram-profile').InstagramInspectionListEntry[]
    cancelInstagramProfileMapping(_context: IpcContext, url: string): boolean
    inspectInstagramProfile(
      _context: IpcContext,
      url: string,
      categories?: InstagramProfileCategory[]
    ): Promise<InstagramProfileInspection>
    startDownload(_context: IpcContext, id: string, options: DownloadOptions): boolean
    cancelDownload(_context: IpcContext, id: string): Promise<boolean>
    cancelAllDownloads(_context: IpcContext): Promise<{
      cancelled: number
      failed: number
    }>
    pauseDownload(_context: IpcContext, id: string): boolean
    resumeDownload(_context: IpcContext, id: string): boolean
    retryDownload(_context: IpcContext, id: string): Promise<boolean>
    getQueueStatus(_context: IpcContext): {
      active: number
      pending: number
    }
    getActiveDownloads(_context: IpcContext): DownloadItem[]
    updateDownloadInfo(_context: IpcContext, id: string, updates: Partial<DownloadItem>): void
    startPlaylistDownload(
      _context: IpcContext,
      options: PlaylistDownloadOptions
    ): Promise<PlaylistDownloadResult>
    startInstagramProfileDownload(
      _context: IpcContext,
      input: InstagramProfileDownloadInput
    ): Promise<InstagramProfileDownloadResult>
  }
  fs: {
    readClipboardFilePaths(_context: IpcContext): string[]
    selectDirectory(_context: IpcContext): Promise<string | null>
    selectFile(_context: IpcContext): Promise<string | null>
    selectMediaFiles(_context: IpcContext): Promise<string[]>
    saveTextFile(
      _context: IpcContext,
      options: {
        content: string
        defaultFileName: string
        threadId?: string
        thinkingLabel?: string
        source?: ExportVideoSource
      }
    ): Promise<{
      path: string
    } | null>
    saveMarkdownPdf(
      _context: IpcContext,
      options: {
        markdown: string
        defaultFileName: string
        title?: string
        threadId?: string
        thinkingLabel?: string
        source?: ExportVideoSource
      }
    ): Promise<{
      path: string
    } | null>
    saveBinaryFile(
      _context: IpcContext,
      options: {
        data: ArrayBuffer
        defaultFileName: string
      }
    ): Promise<{
      path: string
    } | null>
    saveSplitShareImage(
      _context: IpcContext,
      options: {
        payload: ShareCardPayload
        defaultFileName: string
        imageCount?: number
      }
    ): Promise<{
      path: string
      count: number
    } | null>
    shareFile(
      _context: IpcContext,
      options: {
        data: ArrayBuffer
        fileName: string
      }
    ): Promise<boolean>
    validateCookiesFile(
      _context: IpcContext,
      filePath: string
    ): Promise<{
      valid: boolean
      reason?: 'not-found' | 'sqlite' | 'binary' | 'not-netscape'
    }>
    getDefaultDownloadPath(_context: IpcContext): string
    openFileLocation(_context: IpcContext, filePath: string): Promise<boolean>
    openFile(_context: IpcContext, filePath: string): Promise<boolean>
    copyFileToClipboard(_context: IpcContext, filePath: string): Promise<boolean>
    openExternal(_context: IpcContext, url: string): Promise<boolean>
    openMacFilesAndFoldersSettings(_context: IpcContext): Promise<boolean>
    showDownloadCompletedNotification(
      _context: IpcContext,
      title: string,
      body: string,
      filePaths: string[],
      downloadPath: string
    ): boolean
    fileExists(_context: IpcContext, filePath: string): Promise<boolean>
    deleteFile(_context: IpcContext, filePath: string, allowMissing?: boolean): Promise<boolean>
  }
  history: {
    getHistory(_context: IpcContext): DownloadHistoryItem[]
    getHistoryById(_context: IpcContext, id: string): Promise<DownloadHistoryItem | undefined>
    addHistoryItem(_context: IpcContext, item: DownloadHistoryItem): void
    removeHistoryItem(_context: IpcContext, id: string): Promise<boolean>
    removeHistoryItems(_context: IpcContext, ids: string[]): Promise<number>
    removeHistoryByPlaylistId(_context: IpcContext, playlistId: string): Promise<number>
    clearHistory(_context: IpcContext): Promise<void>
    getHistoryCount(_context: IpcContext): {
      active: number
      completed: number
      error: number
      cancelled: number
      total: number
    }
  }
  mcp: {
    getStatus(_context: IpcContext): DesktopMcpStatus
    getCapabilities(_context: IpcContext): DesktopMcpCapabilityGroup[]
    setEnabled(_context: IpcContext, enabled: boolean): Promise<DesktopMcpStatus>
    rotateToken(_context: IpcContext): Promise<DesktopMcpStatus>
  }
  player: {
    attach(_context: IpcContext, input: PlayerAttachInput): Promise<PlayerAttachResult>
    detach(_context: IpcContext): Promise<void>
    syncIconMenu(_context: IpcContext, state: AppIconMenuState): void
  }
  settings: {
    get<K extends keyof AppSettings>(_context: IpcContext, key: K): AppSettings[K]
    set<K extends keyof AppSettings>(_context: IpcContext, key: K, value: AppSettings[K]): void
    getAll(_context: IpcContext): AppSettings
    setAll(_context: IpcContext, settings: Partial<AppSettings>): void
    reset(_context: IpcContext): void
    shouldPromptWhatsNew(_context: IpcContext): boolean
    markWhatsNewSeen(_context: IpcContext): void
  }
  subscriptions: {
    list(_context: IpcContext): Promise<SubscriptionRule[]>
    resolve(_context: IpcContext, url: string): SubscriptionResolvedFeed
    create(_context: IpcContext, options: CreateSubscriptionOptions): Promise<SubscriptionRule>
    update(
      _context: IpcContext,
      id: string,
      updates: SubscriptionUpdatePayload
    ): Promise<SubscriptionRule | undefined>
    remove(_context: IpcContext, id: string): Promise<boolean>
    refresh(_context: IpcContext, id?: string): Promise<void>
    queueItem(_context: IpcContext, id: string, itemId: string): Promise<boolean>
  }
  thumbnail: {
    getThumbnailPath(_context: IpcContext, url: string | null | undefined): Promise<string | null>
    getLocalPoster(
      _context: IpcContext,
      request: LocalPosterRequest | null | undefined
    ): Promise<string | null>
  }
  transcript: {
    getCloudModels(_context: IpcContext): Promise<{
      defaultModelId: string
      models: {
        id: string
        name: string
        creditsPerSecond: number
      }[]
      maxAudioBytes: number
      maxAudioSeconds: number
    }>
    getForDownload(_context: IpcContext, downloadId: string): Promise<TranscriptSnapshot>
    getDetail(_context: IpcContext, downloadId: string): TranscriptSnapshot
    getPlaybackCues(_context: IpcContext, downloadId: string): TranscriptPlaybackCueSnapshot | null
    getSourceCues(
      _context: IpcContext,
      input: {
        downloadId: string
        key: string
      }
    ): {
      startMs: number
      endMs: number
      text: string
    }[]
    getStatusMap(_context: IpcContext): Promise<Record<string, TranscriptListSnapshot>>
    importLocal(
      _context: IpcContext,
      input: {
        paths: string[]
      }
    ): Promise<ImportLocalMediaResult>
    start(
      _context: IpcContext,
      input: {
        downloadId: string
        force?: boolean
        speakerCount?: SpeakerCount
      }
    ): Promise<TranscriptSnapshot>
    rediarize(
      _context: IpcContext,
      input: {
        downloadId: string
        speakerCount: SpeakerCount
      }
    ): Promise<TranscriptSnapshot>
    selectSource(
      _context: IpcContext,
      input: {
        downloadId: string
        key: string
      }
    ): Promise<TranscriptSnapshot>
    retry(_context: IpcContext, downloadId: string): Promise<TranscriptSnapshot>
    cancel(_context: IpcContext, downloadId: string): Promise<TranscriptSnapshot>
    getModelStatus(_context: IpcContext): Promise<ModelStatus>
    getModelPrepStatus(_context: IpcContext): ModelPrepStatus
    redownloadModels(_context: IpcContext): Promise<ModelStatus>
    getPartials(_context: IpcContext, downloadId: string): PipelineSegment[]
    ensureTier(_context: IpcContext, tier: AsrTierId): Promise<ModelStatus>
    setTier(_context: IpcContext, tier: AsrTierId): Promise<ModelStatus>
    deleteTier(_context: IpcContext, tier: AsrTierId): Promise<ModelStatus>
    cancelTier(_context: IpcContext, tier: AsrTierId): Promise<ModelStatus>
    upgrade(
      _context: IpcContext,
      input: {
        downloadId: string
        tier: AsrTierId
      }
    ): Promise<TranscriptSnapshot>
    updateSegment(
      _context: IpcContext,
      input: {
        downloadId: string
        endMs?: number
        segmentId: string
        speakerId?: string | null
        startMs?: number
        text?: string
      }
    ): TranscriptSnapshot
    deleteSegments(
      _context: IpcContext,
      input: {
        downloadId: string
        segmentIds: string[]
      }
    ): TranscriptSnapshot
    insertSegment(
      _context: IpcContext,
      input: {
        afterId?: string | null
        atMs?: number
        beforeId?: string | null
        downloadId: string
        speakerId?: string | null
        text?: string
      }
    ): {
      segmentId: string
      snapshot: TranscriptSnapshot
    }
    exportVideo(
      _context: IpcContext,
      input: VideoSubtitleExportInput
    ): Promise<VideoSubtitleExportResult>
    cancelVideoExport(_context: IpcContext): void
  }
  window: {
    captureShareCard(_context: IpcContext, payload: ShareCardPayload): Promise<ArrayBuffer>
    writeShareImage(_context: IpcContext, data: ArrayBuffer): void
    minimize(_context: IpcContext): void
    maximize(_context: IpcContext): void
    close(_context: IpcContext): void
    isMaximized(_context: IpcContext): boolean
  }
}

/** Legacy service proxy contract with the original decorator type transformation.
 * @category protocols
 * @since 0.0.0
 *
 * **Example** (Import the IpcServices contract)
 *
 * ```ts
 * export type { IpcServices } from './ipc.js'
 * ```
 *
 */
export type IpcServices = {
  [G in keyof LegacyServices]: {
    [M in keyof LegacyServices[G]]: LegacyServices[G][M] extends (
      context: IpcContext,
      ...args: infer Args
    ) => infer Output
      ? (...args: Args) => Promise<Awaited<Output>>
      : never
  }
}
