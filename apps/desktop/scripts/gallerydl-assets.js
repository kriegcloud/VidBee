/**
 * Pinned gallery-dl standalone builds used by desktop packaging.
 *
 * Asset digests come from the GitHub release API for gdl-org/builds.
 */
export const GALLERY_DL_RELEASE = '2026.09.10'

export const GALLERY_DL_PLATFORM_ASSETS = {
  win32: {
    asset: 'gallery-dl_windows.exe',
    output: 'gallery-dl.exe',
    sha256: '1c4a7f897f6cb0d75639a5905d2a0a1f1ee2fc6d881c2af97f289d7bba367ac2'
  },
  darwin: {
    asset: 'gallery-dl_macos',
    output: 'gallery-dl_macos',
    sha256: '35cbadf6f5c1594d866e3e4f1b6b84dcbdce1a1ed64430c5745b54d5aa55d07b'
  },
  linux: {
    asset: 'gallery-dl_linux',
    output: 'gallery-dl_linux',
    sha256: '527a85325e41679d414517b7bbf50f2f9ba39940b0d28c99b3b4dbfd09b48507'
  }
}
