const FACEBOOK_HOSTS = new Set([
  'facebook.com',
  'www.facebook.com',
  'm.facebook.com',
  'mbasic.facebook.com',
  'web.facebook.com'
])
const PROFILE_NAME = /^[A-Za-z0-9][A-Za-z0-9.]*$/
const NUMERIC_ID = /^\d+$/
const SET_ID = /^(?:a|oa|pcb|pb)\.[0-9.-]+$/
const RESERVED_PROFILES = new Set([
  'about',
  'ads',
  'business',
  'checkpoint',
  'dialog',
  'events',
  'friends',
  'gaming',
  'groups',
  'help',
  'home.php',
  'login',
  'login.php',
  'logout.php',
  'marketplace',
  'media',
  'messages',
  'notifications',
  'pages',
  'people',
  'permalink.php',
  'photo',
  'photo.php',
  'photos',
  'plugins',
  'policies',
  'privacy',
  'profile.php',
  'recover',
  'reel',
  'reels',
  'reg',
  'saved',
  'settings',
  'share',
  'sharer',
  'sharer.php',
  'stories',
  'story.php',
  'videos',
  'watch'
])
const ROOT = 'https://www.facebook.com'

export interface NormalizedFacebookGalleryUrl {
  url: string
  directorySegments: readonly string[]
}

const profileGallery = (profile: string, section: string): NormalizedFacebookGalleryUrl | null => {
  if (!PROFILE_NAME.test(profile) || RESERVED_PROFILES.has(profile.toLowerCase())) {
    return null
  }
  if (section === 'photos_albums') {
    return {
      url: `${ROOT}/${profile}/photos_albums`,
      directorySegments: ['Facebook', profile, 'Albums']
    }
  }
  if (!['', 'photos', 'photos_by'].includes(section)) {
    return null
  }
  return {
    url: `${ROOT}/${profile}/photos`,
    directorySegments: ['Facebook', profile, 'Photos']
  }
}

/** Recognize photo resources without claiming Facebook video, reel, or share URLs. */
export const normalizeFacebookGalleryUrl = (value: string): NormalizedFacebookGalleryUrl | null => {
  try {
    const parsed = new URL(value)
    if (!(['http:', 'https:'].includes(parsed.protocol) && FACEBOOK_HOSTS.has(parsed.hostname))) {
      return null
    }
    const pathname = parsed.pathname.replace(/\/$/, '')
    const params = parsed.searchParams
    if (pathname === '/profile.php') {
      const id = params.get('id') ?? ''
      return NUMERIC_ID.test(id) ? profileGallery(id, params.get('sk') ?? '') : null
    }
    const set = params.get('set') ?? ''
    if (pathname === '/media/set') {
      return SET_ID.test(set)
        ? { url: `${ROOT}/media/set/?set=${set}`, directorySegments: ['Facebook', 'Albums', set] }
        : null
    }
    if (pathname === '/photo' || pathname === '/photo.php') {
      const id = params.get('fbid') ?? ''
      if (!NUMERIC_ID.test(id)) {
        return null
      }
      if (params.has('setextract') && SET_ID.test(set)) {
        return {
          url: `${ROOT}/photo/?fbid=${id}&set=${set}&setextract`,
          directorySegments: ['Facebook', 'Albums', set]
        }
      }
      return { url: `${ROOT}/photo/?fbid=${id}`, directorySegments: ['Facebook', 'Photos'] }
    }
    const segments = pathname.slice(1).split('/')
    if (segments[0] === 'people' && (segments.length === 3 || segments.length === 4)) {
      return NUMERIC_ID.test(segments[2]) ? profileGallery(segments[2], segments[3] ?? '') : null
    }
    if (segments.length <= 2) {
      return profileGallery(segments[0], segments[1] ?? '')
    }
    // Legacy photo permalinks: /USERNAME/photos/ALBUM_ID/PHOTO_ID/.
    if (segments.length === 4 && segments[1] === 'photos' && NUMERIC_ID.test(segments[3])) {
      return {
        url: `${ROOT}/photo/?fbid=${segments[3]}`,
        directorySegments: ['Facebook', 'Photos']
      }
    }
    return null
  } catch {
    return null
  }
}
