# Third-party notices

## yt-dlp

VidBee builds and bundles a customized yt-dlp executable from the source
snapshot tracked in `vendor/yt-dlp`.

- Project: <https://github.com/yt-dlp/yt-dlp>
- Upstream ref: `2026.07.04`
- Upstream commit: `fdec00e0bf530dc6c3cc7b1dd780e95d9ae460e9`
- License: The Unlicense (`vendor/yt-dlp/LICENSE`)
- Bundled dependency licenses:
  `vendor/yt-dlp/THIRD_PARTY_LICENSES.txt`

The build copies both license files beside the packaged executable.

## gallery-dl

VidBee bundles a pinned standalone build of gallery-dl for Instagram profile
and gallery downloads.

- Project: <https://codeberg.org/mikf/gallery-dl>
- Bundled build: <https://github.com/gdl-org/builds/releases/tag/2026.07.27>
- Corresponding source:
  <https://codeberg.org/mikf/gallery-dl/commit/736fee34a438d4f48b8874e5b7e6be5441b4e746>
- License: GNU General Public License v2.0
- License text:
  <https://codeberg.org/mikf/gallery-dl/src/commit/736fee34a438d4f48b8874e5b7e6be5441b4e746/LICENSE>

gallery-dl is a separate process. VidBee passes URLs and user-configured cookie
or proxy settings to it and consumes its structured command-line output.
