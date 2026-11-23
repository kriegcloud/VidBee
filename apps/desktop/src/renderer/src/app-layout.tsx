import { CookiesSetupDialog } from '@renderer/components/download/CookiesSetupDialog'
import { TranscriptModelsBanner } from '@renderer/components/transcript/TranscriptModelsBanner'
import { TranscriptPlaybackBar } from '@renderer/components/transcript/TranscriptPlaybackBar'
import { TranscriptPlaybackHost } from '@renderer/components/transcript/TranscriptPlaybackHost'
import { Sidebar } from '@renderer/components/ui/sidebar'
import { Toaster } from '@renderer/components/ui/sonner'
import { TitleBar } from '@renderer/components/ui/title-bar'
import { WhatsNewHost } from '@renderer/components/whats-new/WhatsNewDialog'
import { AGENT_WORKSPACE_ID } from '@shared/agent-chat'
import { AGENT_NOTIFICATION_OPEN_CHANNEL } from '@shared/agent-notifications'
import { APP_ICON_SHOW_HOME_CHANNEL } from '@shared/app-icon-menu'
import type { SubscriptionRule } from '@shared/types'
import { Outlet, useNavigate, useRouteContext, useRouterState } from '@tanstack/react-router'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useTheme } from 'next-themes'
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { DesktopChromeContext } from './desktop-chrome'
import { useAgentTaskEvents } from './hooks/use-agent-task-events'
import { useAppIconPlaybackMenu } from './hooks/use-app-icon-playback-menu'
import { useDownloadEvents } from './hooks/use-download-events'
import { useHistorySync } from './hooks/use-history-sync'
import { useImportLocalMedia } from './hooks/use-import-local-media'
import { foundationClients, foundationEvents } from './lib/foundation'
import { ipcEvents, ipcServices } from './lib/ipc'
import { logger } from './lib/logger'
import { continueDesktopSignIn, openSettingsTab } from './lib/settings-navigation'
import { isInProgressTranscript } from './lib/transcript-library'
import {
  isTranscriptDetailPathname,
  PLAYBACK_BAR_HEIGHT_VAR,
  playbackBarReservedHeightPx,
  shouldCollapsePlaybackBar,
  shouldShowPlaybackBar
} from './lib/transcript-playback'
import { withDesktopUtm } from './lib/url'
import { loadSettingsAtom, settingsAtom } from './store/settings'
import { loadSubscriptionsAtom, setSubscriptionsAtom } from './store/subscriptions'
import { playbackSessionAtom } from './store/transcript-playback'
import { playbackPlaylistAtom } from './store/transcript-playlist'
import {
  loadTranscriptMapAtom,
  type TranscriptSnapshotView,
  transcriptMapAtom,
  upsertTranscriptAtom
} from './store/transcripts'

type Page = 'about' | 'chat' | 'home' | 'settings' | 'subscriptions'

const pageToPath: Record<Page, string> = {
  about: '/about',
  chat: '/chat',
  home: '/',
  settings: '/settings',
  subscriptions: '/subscriptions'
}

/**
 * Normalize a pathname so `/` and trailing slashes compare the same.
 *
 * @param pathname Raw router pathname.
 * @returns A pathname with no trailing slash, except for root.
 */
const normalizePathname = (pathname: string): string => {
  const trimmed = pathname.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

/**
 * Map the current hash path to the sidebar page id.
 *
 * @param pathname Current router pathname.
 * @returns The matching sidebar page.
 */
const pathToPage = (pathname: string): Page => {
  const normalized = normalizePathname(pathname)
  if (normalized === '/transcripts' || isTranscriptDetailPathname(normalized)) {
    return 'home'
  }
  switch (normalized) {
    case '/chat':
      return 'chat'
    case '/about':
      return 'about'
    case '/settings':
      return 'settings'
    case '/subscriptions':
      return 'subscriptions'
    default:
      return 'home'
  }
}

/**
 * Render the desktop chrome and the active page outlet.
 */
export function AppLayout() {
  const { platform } = useRouteContext({ from: '__root__' })
  const [appVersion, setAppVersion] = useState<string>('')
  const [titleBarContent, setTitleBarContent] = useState<ReactNode>(null)
  const loadSubscriptions = useSetAtom(loadSubscriptionsAtom)
  const setSubscriptions = useSetAtom(setSubscriptionsAtom)
  const [settings] = useAtom(settingsAtom)
  const loadSettings = useSetAtom(loadSettingsAtom)
  const { setTheme } = useTheme()
  const loadTranscripts = useSetAtom(loadTranscriptMapAtom)
  const upsertTranscript = useSetAtom(upsertTranscriptAtom)
  const transcriptMap = useAtomValue(transcriptMapAtom)
  const hasActiveTranscripts = useMemo(
    () =>
      Object.values(transcriptMap).some((snapshot) => isInProgressTranscript(snapshot.listState)),
    [transcriptMap]
  )
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname
  const playbackSession = useAtomValue(playbackSessionAtom)
  const playbackPlaylist = useAtomValue(playbackPlaylistAtom)
  const playbackBarVisible = shouldShowPlaybackBar({
    downloadId: playbackSession?.downloadId ?? null,
    pathname,
    playlistCount: playbackPlaylist.length,
    started: Boolean(playbackSession?.started)
  })
  const playbackBarHeight = playbackBarReservedHeightPx({
    collapsed: playbackBarVisible && shouldCollapsePlaybackBar(pathname),
    visible: playbackBarVisible
  })
  const currentPage = pathToPage(pathname)
  const supportedSitesUrl = withDesktopUtm('https://vidbee.org/supported-sites/')
  const toolsUrl = withDesktopUtm('https://vidbee.org/tools/')

  useDownloadEvents()
  useAgentTaskEvents()
  useAppIconPlaybackMenu()
  useHistorySync()
  const { applyImportResult } = useImportLocalMedia()

  const handlePageChange = useCallback(
    (page: Page) => {
      const targetPath = pageToPath[page] ?? '/'
      if (normalizePathname(pathname) !== targetPath) {
        void navigate({ to: targetPath })
      }
    },
    [navigate, pathname]
  )

  const handleOpenCookiesSettings = useCallback(() => {
    void navigate({ search: { tab: 'cookies' }, to: '/settings' })
  }, [navigate])

  useEffect(() => {
    const unsubscribe = foundationEvents.on(APP_ICON_SHOW_HOME_CHANNEL, () => {
      if (normalizePathname(pathnameRef.current) === '/') {
        return
      }
      void navigate({ to: '/' })
    })
    return () => {
      foundationEvents.removeListener(APP_ICON_SHOW_HOME_CHANNEL, unsubscribe)
    }
  }, [navigate])

  const handleOpenSupportedSites = useCallback(() => {
    window.open(supportedSitesUrl, '_blank')
  }, [supportedSitesUrl])

  useEffect(() => {
    /** Consume pending clicks after mounting so window recreation cannot lose navigation. */
    const openNotification = async (): Promise<void> => {
      const target = await ipcServices.ai.takeAgentNotificationTarget()
      if (!target) {
        return
      }
      if (target.downloadId === AGENT_WORKSPACE_ID) {
        await navigate({ to: '/chat', search: { thread: target.threadId } })
        return
      }
      await navigate({
        to: '/downloads/$downloadId/transcript',
        params: { downloadId: target.downloadId },
        search: { tab: target.promptId, thread: target.threadId }
      })
    }
    /** Keep a failed navigation from breaking the global notification listener. */
    const handleNotification = (): void => {
      void openNotification().catch((error: unknown) => {
        logger.error('Failed to open Agent notification:', error)
      })
    }
    const unsubscribe = ipcEvents.on(AGENT_NOTIFICATION_OPEN_CHANNEL, handleNotification)
    handleNotification()
    return () => {
      ipcEvents.removeListener(AGENT_NOTIFICATION_OPEN_CHANNEL, unsubscribe)
    }
  }, [navigate])

  const handleOpenTools = useCallback(() => {
    window.open(toolsUrl, '_blank')
  }, [toolsUrl])

  useEffect(() => {
    setTheme(settings.theme)
  }, [settings.theme, setTheme])

  useEffect(() => {
    loadSettings()
    const listener = foundationEvents.on('settings:changed', () => {
      void loadSettings()
    })
    return () => foundationEvents.removeListener('settings:changed', listener)
  }, [loadSettings])

  useEffect(() => {
    void loadTranscripts()
    const off = ipcEvents.on('transcript:updated', (...args: unknown[]) => {
      const snapshot = args[0] as TranscriptSnapshotView
      if (snapshot?.downloadTaskId) {
        upsertTranscript(snapshot)
      }
    })
    return () => {
      ipcEvents.removeListener('transcript:updated', off as (...args: unknown[]) => void)
    }
  }, [loadTranscripts, upsertTranscript])

  useEffect(() => {
    const handleDeepLink = (rawUrl: unknown) => {
      const url = typeof rawUrl === 'string' ? rawUrl.trim() : ''
      if (!url) {
        return
      }
      handlePageChange('home')
    }

    ipcEvents.on('download:deeplink', handleDeepLink)
    return () => {
      ipcEvents.removeListener('download:deeplink', handleDeepLink)
    }
  }, [handlePageChange])

  useEffect(() => {
    /** Show the account balance when the browser returns from a credit purchase. */
    const handleCreditReturn = (): void => {
      openSettingsTab('account')
    }
    const subscription = ipcEvents.on('account:credits-updated', handleCreditReturn)
    return () => {
      ipcEvents.removeListener('account:credits-updated', subscription)
    }
  }, [])

  useEffect(() => {
    /** Finish a browser signup by opening Settings and signing in when needed. */
    const handleAuthContinue = (): void => {
      void continueDesktopSignIn()
    }
    ipcEvents.on('auth:continue', handleAuthContinue)
    return () => {
      ipcEvents.removeListener('auth:continue', handleAuthContinue)
    }
  }, [])

  useEffect(() => {
    const handleMediaImported = (...args: unknown[]) => {
      const result = args[0] as Parameters<typeof applyImportResult>[0] | undefined
      if (!result) {
        return
      }
      void applyImportResult(result)
    }
    const subscription = ipcEvents.on('media:imported', handleMediaImported)
    return () => {
      ipcEvents.removeListener('media:imported', subscription)
    }
  }, [applyImportResult])

  useEffect(() => {
    loadSubscriptions()

    const handleSubscriptions = (...args: unknown[]) => {
      const list = args[0]
      if (Array.isArray(list)) {
        setSubscriptions(list as SubscriptionRule[])
      }
    }

    ipcEvents.on('subscriptions:updated', handleSubscriptions)

    return () => {
      ipcEvents.removeListener('subscriptions:updated', handleSubscriptions)
    }
  }, [loadSubscriptions, setSubscriptions])

  useEffect(() => {
    const getRuntimeInfo = async () => {
      try {
        const version = await foundationClients.app.getVersion()
        setAppVersion(version)
      } catch (error) {
        logger.error('Failed to get runtime info:', error)
        setAppVersion('')
      }
    }

    void getRuntimeInfo()
  }, [])

  const chrome = useMemo(
    () => ({
      appVersion,
      onOpenAbout: () => handlePageChange('about'),
      onOpenCookiesSettings: handleOpenCookiesSettings,
      onOpenSettings: () => handlePageChange('settings'),
      onOpenSupportedSites: handleOpenSupportedSites,
      setTitleBar: setTitleBarContent
    }),
    [appVersion, handleOpenCookiesSettings, handleOpenSupportedSites, handlePageChange]
  )

  return (
    <DesktopChromeContext.Provider value={chrome}>
      <div
        className="flex h-screen flex-row"
        style={
          {
            [PLAYBACK_BAR_HEIGHT_VAR]: `${playbackBarHeight}px`
          } as CSSProperties
        }
      >
        <Sidebar
          currentPage={currentPage}
          onOpenTools={handleOpenTools}
          onPageChange={handlePageChange}
          transcriptsActive={hasActiveTranscripts}
        />

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden" data-vt="main">
            {currentPage === 'settings' ? null : (
              <TitleBar
                className={
                  currentPage === 'chat'
                    ? 'absolute inset-x-0 top-0 z-40 h-10 bg-transparent pt-0'
                    : undefined
                }
                platform={platform}
              >
                {currentPage === 'chat' ? null : titleBarContent}
              </TitleBar>
            )}

            <div
              className={
                currentPage === 'chat' || currentPage === 'settings'
                  ? 'min-h-0 flex-1 overflow-hidden'
                  : 'min-h-0 flex-1 overflow-y-auto overflow-x-hidden'
              }
              style={
                currentPage === 'chat'
                  ? ({
                      '--agent-toolbar-top': platform === 'darwin' ? '1rem' : '3.5rem'
                    } as CSSProperties)
                  : undefined
              }
            >
              <Outlet />
            </div>
            <TranscriptModelsBanner />
          </div>
          <TranscriptPlaybackBar />
        </main>

        <TranscriptPlaybackHost />
        <Toaster
          offset={playbackBarHeight > 0 ? playbackBarHeight + 16 : undefined}
          richColors={true}
        />
        <WhatsNewHost />
        <CookiesSetupDialog />
      </div>
    </DesktopChromeContext.Provider>
  )
}
