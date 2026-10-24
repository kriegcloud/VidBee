/**
 * Pinned gallery-dl standalone builds used by desktop packaging.
 *
 * Asset digests come from the GitHub release API for gdl-org/builds.
 */
// 1.33.0-dev: Instagram highlights, stories, and tagged posts moved to Relay
// GraphQL queries (mikf/gallery-dl#9765, #9777); the REST endpoints now
// return 500 or redirect to the home page. 2026.10.23 collects the Relay
// provided variables dynamically (codeberg c0e3747a44) and routes the reels and
// tagged tab doc_id lookups through their own profile tab pages.
export const GALLERY_DL_RELEASE = '2026.10.24'

export const GALLERY_DL_PLATFORM_ASSETS = {
  win32: {
    asset: 'gallery-dl_windows.exe',
    output: 'gallery-dl.exe',
    sha256: 'ac70bf4c769e90b4f291d0307c252e263c22fb393b1ceaaa4ec80094356ee87b'
  },
  darwin: {
    asset: 'gallery-dl_macos',
    output: 'gallery-dl_macos',
    sha256: 'c1cc491d529621f87576e251d21a2b6310a80ae488fe01ddc04a662ca12c8d6a'
  },
  linux: {
    asset: 'gallery-dl_linux',
    output: 'gallery-dl_linux',
    sha256: '103700b63a0a7595712b417ed432eb6826b85b820afad925d6ec465d549741cb'
  }
}
