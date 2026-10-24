import {
  createHashHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect
} from '@tanstack/react-router'
import { useContext } from 'react'
import { AppLayout } from './app-layout'
import { DesktopChromeContext } from './desktop-chrome'
import { validateTranscriptTabSearch } from './lib/transcript-tab-search'
import { transcriptRouteTransitionTypes } from './lib/transcript-view-transition'
import { Home } from './pages/Home'

// Only the home page ships in the entry chunk. The transcript and settings
// pages pull in the markdown, math, and diagram renderers, so they load on
// first navigation instead of at every launch.
const About = lazyRouteComponent(() => import('./pages/About'), 'About')
const Settings = lazyRouteComponent(() => import('./pages/Settings'), 'Settings')
const Subscriptions = lazyRouteComponent(() => import('./pages/Subscriptions'), 'Subscriptions')
const TranscriptPage = lazyRouteComponent(() => import('./pages/Transcript'), 'TranscriptPage')

export type SettingsTab =
  | 'account'
  | 'advanced'
  | 'cookies'
  | 'general'
  | 'metadata'
  | 'prompts'
  | 'providers'
  | 'transcribe'
  | 'mcp'

export interface DesktopRouterContext {
  platform: string
}

/**
 * Parse the Settings `tab` search param and ignore unknown values.
 *
 * @param search Raw search params from the URL hash.
 * @returns A typed Settings tab when present.
 */
const validateSettingsSearch = (search: Record<string, unknown>): { tab?: SettingsTab } => {
  const tab = search.tab
  if (
    tab === 'account' ||
    tab === 'advanced' ||
    tab === 'cookies' ||
    tab === 'general' ||
    tab === 'metadata' ||
    tab === 'prompts' ||
    tab === 'providers' ||
    tab === 'transcribe' ||
    tab === 'mcp'
  ) {
    return { tab }
  }
  return {}
}

/**
 * Render the download home page with chrome callbacks from the app shell.
 */
const HomeRoute = () => {
  const chrome = useContext(DesktopChromeContext)
  if (!chrome) {
    return null
  }
  return (
    <Home
      appVersion={chrome.appVersion}
      onOpenAbout={chrome.onOpenAbout}
      onOpenCookiesSettings={chrome.onOpenCookiesSettings}
      onOpenSettings={chrome.onOpenSettings}
      onOpenSupportedSites={chrome.onOpenSupportedSites}
    />
  )
}

const rootRoute = createRootRouteWithContext<DesktopRouterContext>()({
  component: AppLayout
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomeRoute
})

const subscriptionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/subscriptions',
  component: Subscriptions
})

export const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  validateSearch: validateSettingsSearch,
  component: Settings
})

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/about',
  component: About
})

const transcriptsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/transcripts',
  beforeLoad: () => {
    throw redirect({ to: '/' })
  }
})

const transcriptRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/downloads/$downloadId/transcript',
  validateSearch: validateTranscriptTabSearch,
  component: TranscriptPage
})

const notFoundRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/$',
  beforeLoad: () => {
    throw redirect({ to: '/' })
  }
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  subscriptionsRoute,
  settingsRoute,
  aboutRoute,
  transcriptsRoute,
  transcriptRoute,
  notFoundRoute
])

export const desktopRouter = createRouter({
  routeTree,
  history: createHashHistory(),
  context: {
    platform: ''
  },
  defaultPreload: 'intent',
  defaultViewTransition: {
    types: (info) =>
      transcriptRouteTransitionTypes({
        fromPath: info.fromLocation?.pathname,
        pathChanged: info.pathChanged,
        toPath: info.toLocation.pathname
      })
  },
  scrollRestoration: true
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof desktopRouter
  }
}
