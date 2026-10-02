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
