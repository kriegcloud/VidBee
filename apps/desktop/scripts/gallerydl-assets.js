/**
 * Pinned gallery-dl standalone builds used by desktop packaging.
 *
 * Asset digests come from the GitHub release API for gdl-org/builds.
 */
export const GALLERY_DL_RELEASE = '2026.07.27'

export const GALLERY_DL_PLATFORM_ASSETS = {
  win32: {
    asset: 'gallery-dl_windows.exe',
    output: 'gallery-dl.exe',
    sha256: '6cdab276ada6bf6ee7f3fe76a67133656f1d609469059056758998972232f4dc'
  },
  darwin: {
    asset: 'gallery-dl_macos',
    output: 'gallery-dl_macos',
    sha256: '2100c1f4c3a7e162fa7489e7f220e06678f3f9fb74e6b27af96222d17b871a5d'
  },
  linux: {
    asset: 'gallery-dl_linux',
    output: 'gallery-dl_linux',
    sha256: 'df98329055ef39002e5666e11cb9c147de35f78e5ec02aef570e71813af7b86d'
  }
}
