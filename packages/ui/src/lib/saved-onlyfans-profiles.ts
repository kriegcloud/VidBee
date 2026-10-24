import type { OnlyFansProfile } from '@vidbee/downloader-core/onlyfans-profile'
import type { SavedProfile } from '../components/ui/saved-instagram-profiles'
import { indexOnlyFansChatOwners } from './saved-social-profile-groups'

/** Show a creator's posts and linked chat as one saved profile. */
export function savedOnlyFansProfiles(
  profiles: OnlyFansProfile[],
  chatLabel: (id: string) => string
): SavedProfile[] {
  const groups = new Map<string, { entry: SavedProfile; mediaIds: Set<string> }>()
  const chatOwners = indexOnlyFansChatOwners(profiles)
  for (const profile of profiles) {
    const owner = profile.chatId
      ? (chatOwners.get(profile.chatId) ?? profile.username)
      : profile.username
    const key = profile.chatId && !chatOwners.has(profile.chatId) ? `chat:${profile.chatId}` : owner
    let group = groups.get(key)
    if (!group) {
      group = {
        entry: {
          inspectionId: profile.profileUrl,
          platform: 'onlyfans',
          platformLabel: 'OnlyFans',
          profile: {
            username:
              profile.chatId && !chatOwners.has(profile.chatId) ? chatLabel(profile.chatId) : owner,
            profileUrl: profile.profileUrl
          },
          totalAssetCount: 0
        },
        mediaIds: new Set()
      }
      groups.set(key, group)
    }
    if (!profile.chatId) {
      group.entry.profile.profileUrl = profile.profileUrl
      group.entry.inspectionId = profile.profileUrl
    }
    if (profile.state === 'mapping') {
      group.entry.mapping = { state: 'running' }
    }
    for (const item of profile.items) {
      group.mediaIds.add(item.id)
    }
  }
  return [...groups.values()].map(({ entry, mediaIds }) => ({
    ...entry,
    totalAssetCount: mediaIds.size
  }))
}
