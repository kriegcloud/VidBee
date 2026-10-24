# Third-party notices

## yt-dlp

VidBee builds and bundles a customized yt-dlp executable from the source
snapshot tracked in `vendor/yt-dlp`.

- Project: <https://github.com/yt-dlp/yt-dlp>
- Upstream ref: `2026.10.21`
- Upstream commit: `6ccd977303412151ee23352c6257dd658ffc1987`
- License: The Unlicense (`vendor/yt-dlp/LICENSE`)
- Bundled dependency licenses:
  `vendor/yt-dlp/THIRD_PARTY_LICENSES.txt`

The build copies both license files beside the packaged executable.

## gallery-dl

VidBee bundles a pinned standalone build of gallery-dl for Instagram profile
and gallery downloads.

- Project: <https://codeberg.org/mikf/gallery-dl>
- Bundled build: <https://github.com/gdl-org/builds/releases/tag/2026.10.24>
- Corresponding source:
  <https://codeberg.org/mikf/gallery-dl/commit/3556e92dbf595d9c1d0cef0e98672f2fc0c80df1>
- License: GNU General Public License v2.0
- License text:
  <https://codeberg.org/mikf/gallery-dl/src/commit/3556e92dbf595d9c1d0cef0e98672f2fc0c80df1/LICENSE>

gallery-dl is a separate process. VidBee passes URLs and user-configured cookie
or proxy settings to it and consumes its structured command-line output.
