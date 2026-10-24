/**
 * Pinned gallery-dl standalone builds used by desktop packaging.
 *
 * Asset digests come from the GitHub release API for gdl-org/builds.
 */
// 1.33.0-dev: Instagram highlights, stories, and tagged posts moved to Relay
// GraphQL queries (mikf/gallery-dl#9765, #9777); the REST endpoints now
// return 500 or redirect to the home page.
export const GALLERY_DL_RELEASE = '2026.10.22'

export const GALLERY_DL_PLATFORM_ASSETS = {
  win32: {
    asset: 'gallery-dl_windows.exe',
    output: 'gallery-dl.exe',
    sha256: '15e5594b75791862689dcee14e49dd233790f150c263c322b4de780582113b6f'
  },
  darwin: {
    asset: 'gallery-dl_macos',
    output: 'gallery-dl_macos',
    sha256: 'f07ce45aabc3cc46a51f10d50863020284c701facdcd6b84ad5765da00e53626'
  },
  linux: {
    asset: 'gallery-dl_linux',
    output: 'gallery-dl_linux',
    sha256: '883ad543109bbf19547a8eddc4217255a0a44993fb75c9c113003765a10e5b45'
  }
}
