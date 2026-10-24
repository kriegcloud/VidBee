import type { OnlyFansProfile } from '@vidbee/downloader-core/onlyfans-profile'

export interface SavedSocialProfileGroup {
  id: string
  title: string
}

interface SavedSocialProfile {
  platform: string
  owner: string
  categories: Record<string, { items: { url: string }[] }>
}

/** Match persisted post tasks to their saved profile, including tasks queued before batch IDs existed. */
export const indexSavedSocialProfileGroups = (
  profiles: readonly SavedSocialProfile[]
): Map<string, SavedSocialProfileGroup> => {
  const groups = new Map<string, SavedSocialProfileGroup>()
  for (const profile of profiles) {
    const group = {
      id: `saved-social-profile:${profile.platform}:${profile.owner.toLocaleLowerCase()}`,
      title: `@${profile.owner}`
    }
    for (const category of Object.values(profile.categories)) {
      for (const item of category.items) {
        groups.set(item.url, group)
      }
    }
  }
  return groups
}

/** Resolve chat task groups through the creator linked to each saved chat map. */
export const indexOnlyFansChatOwners = (
  profiles: readonly OnlyFansProfile[]
): Map<string, string> => {
  const owners = new Map<string, string>()
  for (const profile of profiles) {
    if (profile.chatId && profile.creatorUsername) {
      owners.set(profile.chatId, profile.creatorUsername)
    } else if (profile.linkedChatId) {
      owners.set(profile.linkedChatId, profile.username)
    }
  }
  return owners
}

/** Leading `@handle` of a queued profile task title, e.g. `@creator · photos · 42`. */
const titleHandle = (title: string | undefined): string | null => {
  const handle = title?.split('·')[0]?.trim()
  return handle?.startsWith('@') ? handle : null
}

/**
 * Group creator-site posts that are queued one task per media item.
 * OnlyFans and Fansly enqueue without a batch id, so the profile is read back
 * from the queued URL and the saved tasks still collapse under one profile.
 */
export const resolveCreatorProfileGroup = (
  record: { url: string; title?: string },
  chatOwners?: ReadonlyMap<string, string>
): SavedSocialProfileGroup | null => {
  let parsed: URL
  try {
    parsed = new URL(record.url)
  } catch {
    return null
  }
  const host = parsed.hostname.toLocaleLowerCase().replace(/^www\./, '')
  const segments = parsed.pathname.split('/').filter(Boolean)
  if (host === 'onlyfans.com') {
    if (segments[0] === 'my' && segments[1] === 'chats' && segments[2] === 'chat' && segments[3]) {
      const owner = chatOwners?.get(segments[3])
      return {
        id: owner
          ? `creator-profile:onlyfans:${owner.toLocaleLowerCase()}`
          : `creator-profile:onlyfans:chat:${segments[3]}`,
        title: owner ? `@${owner}` : (titleHandle(record.title) ?? `@${segments[3]}`)
      }
    }
    // Post permalinks are `/<postId>/<username>`.
    const username = segments.length === 2 && /^\d+$/.test(segments[0]) ? segments[1] : null
    if (username) {
      return {
        id: `creator-profile:onlyfans:${username.toLocaleLowerCase()}`,
        title: `@${username}`
      }
    }
    return null
  }
  if (host === 'fansly.com' && segments[0] && segments[0] !== 'post') {
    return {
      id: `creator-profile:fansly:${segments[0].toLocaleLowerCase()}`,
      title: `@${segments[0]}`
    }
  }
  return null
}
