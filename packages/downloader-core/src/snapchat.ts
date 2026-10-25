const SNAPCHAT_HOSTS = new Set(['snapchat.com', 'www.snapchat.com', 'story.snapchat.com'])
const SNAPCHAT_USERNAME = /^[A-Za-z][A-Za-z0-9._-]{1,31}$/
/** Spotlight snap ids are URL-safe base64; snap file ids are CDN path tokens. */
const SNAP_ID = /^[A-Za-z0-9_-]{20,120}$/
const SNAP_FILE_ID = /^[A-Za-z0-9_.-]{8,120}$/

/** Query key that scopes a story URL to one snap for the VidBee gallery-dl module. */
export const SNAPCHAT_SNAP_PARAM = 'vidbee_snap'

export type SnapchatCategory = 'stories' | 'spotlight'

export interface NormalizedSnapchatUrl {
  /**
   * `profile` is an account page; `stories`/`spotlights` are its category
   * pages (mapped through VidBee's gallery-dl module); `story-snap` is one
   * story or saved-highlight snap; `spotlight` is one Spotlight post.
   */
  kind: 'profile' | 'stories' | 'spotlights' | 'story-snap' | 'spotlight'
  url: string
  username: string
  /** Snap file id (`story-snap`) or Spotlight id (`spotlight`). */
  id?: string
  directorySegments: readonly string[]
}

export const snapchatProfileUrl = (username: string): string =>
  `https://www.snapchat.com/@${username.toLowerCase()}`

/** Category page the VidBee gallery-dl module maps. */
export const snapchatCategoryUrl = (username: string, category: SnapchatCategory): string =>
  `${snapchatProfileUrl(username)}/${category === 'stories' ? 'stories' : 'spotlights'}`

export const snapchatStorySnapUrl = (username: string, fileId: string): string =>
  `${snapchatCategoryUrl(username, 'stories')}?${SNAPCHAT_SNAP_PARAM}=${encodeURIComponent(fileId)}`

export const snapchatSpotlightUrl = (username: string, id: string): string =>
  `${snapchatProfileUrl(username)}/spotlight/${id}`

const result = (
  kind: NormalizedSnapchatUrl['kind'],
  username: string,
  id?: string
): NormalizedSnapchatUrl => {
  const user = username.toLowerCase()
  switch (kind) {
    case 'story-snap':
      return {
        kind,
        username: user,
        id,
        url: snapchatStorySnapUrl(user, id as string),
        directorySegments: ['Snapchat', user, 'Stories']
      }
    case 'spotlight':
      return {
        kind,
        username: user,
        id,
        url: snapchatSpotlightUrl(user, id as string),
        directorySegments: ['Snapchat', user, 'Spotlight']
      }
    case 'stories':
      return {
        kind,
        username: user,
        url: snapchatCategoryUrl(user, 'stories'),
        directorySegments: ['Snapchat', user, 'Stories']
      }
    case 'spotlights':
      return {
        kind,
        username: user,
        url: snapchatCategoryUrl(user, 'spotlight'),
        directorySegments: ['Snapchat', user, 'Spotlight']
      }
    default:
      return {
        kind,
        username: user,
        url: snapchatProfileUrl(user),
        directorySegments: ['Snapchat', user]
      }
  }
}

/**
 * Normalize Snapchat public-profile URLs: `snapchat.com/@user`, `/add/user`,
 * `story.snapchat.com/@user`, their `/stories` and `/spotlights` tabs, one
 * Spotlight post, and VidBee's story-snap URL (`/stories?vidbee_snap=<id>`).
 */
export const normalizeSnapchatUrl = (value: string): NormalizedSnapchatUrl | null => {
  try {
    const parsed = new URL(value.trim())
    if (
      !(
        ['http:', 'https:'].includes(parsed.protocol) &&
        SNAPCHAT_HOSTS.has(parsed.hostname.toLowerCase())
      ) ||
      parsed.username ||
      parsed.password ||
      parsed.port
    ) {
      return null
    }
    const parts = parsed.pathname.split('/').filter(Boolean)
    const userPart = parts[0] === 'add' ? parts[1] : parts[0]?.startsWith('@') ? parts[0] : null
    const rest = parts[0] === 'add' ? parts.slice(2) : parts.slice(1)
    const username = userPart?.replace(/^@/, '') ?? ''
    if (!SNAPCHAT_USERNAME.test(username)) {
      return null
    }
    if (rest.length === 0) {
      return result('profile', username)
    }
    if (rest.length === 1 && (rest[0] === 'stories' || rest[0] === 'highlights')) {
      const snap = parsed.searchParams.get(SNAPCHAT_SNAP_PARAM)
      if (snap !== null) {
        return SNAP_FILE_ID.test(snap) ? result('story-snap', username, snap) : null
      }
      return result('stories', username)
    }
    if (rest.length === 1 && rest[0] === 'spotlights') {
      return result('spotlights', username)
    }
    const spotlightId = rest.length === 2 && rest[0] === 'spotlight' ? rest[1] : undefined
    if (spotlightId && SNAP_ID.test(spotlightId)) {
      return result('spotlight', username, spotlightId)
    }
    return null
  } catch {
    return null
  }
}
