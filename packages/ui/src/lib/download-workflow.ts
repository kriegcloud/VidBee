import { fanslyProfile } from '@vidbee/downloader-core/fansly-profile'
import {
  onlyFansChatRoutes,
  onlyFansChatUrl,
  onlyFansProfile
} from '@vidbee/downloader-core/onlyfans-profile'
import { isInstagramProfileUrl, isPlaylistLikeUrl } from './url-kind'

export interface DownloadWorkflow {
  provider: 'onlyfans' | 'fansly' | 'instagram' | 'general'
  surface: 'browser-profile' | 'native-profile' | 'playlist' | 'single'
  access: 'dedicated-browser' | 'native-session' | 'automatic'
}

export interface ProfileMappingSource {
  key: string
  labelKey: string
  url: string
  category: 'posts' | 'media'
}

export interface ProfileMappingSources {
  selectedKey: string
  options: ProfileMappingSource[]
}

type ProfileWorkflow = Omit<DownloadWorkflow, 'surface'> & {
  surface: 'browser-profile' | 'native-profile'
}

const profileWorkflows: readonly {
  match: (url: string) => boolean
  workflow: ProfileWorkflow
}[] = [
  {
    match: (url) => onlyFansProfile(url) !== null,
    workflow: { provider: 'onlyfans', surface: 'browser-profile', access: 'dedicated-browser' }
  },
  {
    match: (url) => fanslyProfile(url) !== null,
    workflow: { provider: 'fansly', surface: 'browser-profile', access: 'dedicated-browser' }
  },
  {
    match: isInstagramProfileUrl,
    workflow: { provider: 'instagram', surface: 'native-profile', access: 'native-session' }
  }
]

/** Resolve a URL's mapping surface before the general downloader chooses its site adapter. */
export const resolveDownloadWorkflow = (url: string): DownloadWorkflow => {
  for (const entry of profileWorkflows) {
    if (entry.match(url)) {
      return entry.workflow
    }
  }
  return {
    provider: 'general',
    surface: isPlaylistLikeUrl(url) ? 'playlist' : 'single',
    access: 'automatic'
  }
}

/** Site source tabs select either a distinct URL or a category on the shared mapper. */
export const resolveProfileMappingSources = (url: string): ProfileMappingSources => {
  const onlyFans = onlyFansProfile(url)
  if (onlyFans?.chatId) {
    const chatId = onlyFans.chatId
    return {
      selectedKey: onlyFans.chatRoute ?? 'messages',
      options: onlyFansChatRoutes.map((route) => ({
        key: route,
        labelKey: `onlyFans.routes.${route}`,
        url: onlyFansChatUrl(chatId, route),
        category: 'media'
      }))
    }
  }
  const fansly = fanslyProfile(url)
  if (fansly) {
    return {
      selectedKey: new URL(url).pathname.endsWith('/posts') ? 'posts' : 'media',
      options: (['posts', 'media'] as const).map((category) => ({
        key: category,
        labelKey: `fansly.${category}`,
        url: `${fansly.profileUrl}/${category}`,
        category
      }))
    }
  }
  return { selectedKey: '', options: [] }
}
