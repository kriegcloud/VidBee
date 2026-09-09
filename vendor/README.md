# Vendored third-party sources

## yt-dlp

VidBee tracks the complete yt-dlp source snapshot in `vendor/yt-dlp`. The
upstream ref and commit are recorded in `vendor/yt-dlp/VENDOR.json`; the
upstream license and bundled-component notices remain beside the source as
`LICENSE` and `THIRD_PARTY_LICENSES.txt`.

### Customize and build

Make yt-dlp changes directly under `vendor/yt-dlp` (extractors live in
`vendor/yt-dlp/yt_dlp/extractor`), then run:

```bash
pnpm run build:ytdlp
pnpm run verify:ytdlp
```

The build uses yt-dlp's locked Python environment, including its `curl_cffi`
browser-impersonation support, and official PyInstaller entrypoint to create a
standalone executable for the current OS and CPU. It installs that executable
using VidBee's existing resource name:

- Windows: `apps/desktop/resources/yt-dlp.exe`
- macOS: `apps/desktop/resources/yt-dlp_macos`
- Linux: `apps/desktop/resources/yt-dlp_linux`

`uv` and Python 3.10 or newer are required. Set `PYTHON` to choose a specific
interpreter. The generated environment and build outputs are ignored by the
vendored source's `.gitignore`.

The marker at `apps/desktop/resources/.ytdlp-vendored` records the upstream
commit plus a digest of the effective source. `pnpm setup`, `pnpm dev`, and the
Desktop packaging scripts rebuild when that digest changes, so a stock release
download cannot silently replace a customized build.

At runtime, the same marker makes Desktop use the packaged yt-dlp directly,
even if a cached official kernel has an equal or newer version. Vendored builds
disable app and kernel auto-updates; update this checkout and rebuild the app to
preserve its customizations. Existing cached kernels and user data are retained.

The standalone executable is native to the build machine. VidBee's release CI
therefore builds Windows, Linux, macOS arm64, and macOS x64 artifacts on their
matching runners.

### Update the snapshot

Import a reviewed upstream tag as a plain source snapshot (without a nested
`.git` directory), then update `VENDOR.json`. Keep VidBee-specific changes as
ordinary repository commits so they remain visible and reviewable when the
next snapshot is imported.
