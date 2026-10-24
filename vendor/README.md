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

The practical recipe (used for 2026.08.19 -> 2026.10.21):

1. Clone upstream (`git clone --filter=blob:none --no-checkout`) and extract the
   current `VENDOR.json` ref and the target tag with `git archive` into two
   scratch directories (`base/` and `new/`).
2. `diff -rq base vendor/yt-dlp` (ignoring `.venv`, `build`, `dist`,
   `__pycache__`, `VENDOR.json`, `lazy_extractors.py`) lists VidBee's local
   patches. Copy `new/` to `merged/`, overlay the files that exist only locally
   or that upstream did not touch, and run
   `git merge-file -p vendor/yt-dlp/<f> base/<f> new/<f>` for files changed on
   both sides (typically `yt_dlp/extractor/_extractors.py`, `yt_dlp/YoutubeDL.py`
   and `yt_dlp/version.py`, which keeps `VARIANT = 'vidbee'`).
3. `rsync -a --delete` `merged/` into `vendor/yt-dlp/` with the same excludes,
   update `VENDOR.json` (`ref`, `commit`, `importedAt`, `localPatches`) and
   `apps/desktop/resources/THIRD_PARTY_NOTICES.md`, then run
   `pnpm run build:ytdlp` and `pnpm run verify:ytdlp`.
4. Run upstream's tests for the patched areas from `vendor/yt-dlp`:
   `uv run --locked --no-default-groups --extra default --extra curl-cffi --group test python -m pytest test/test_YoutubeDL.py test/test_facebook_reels.py test/test_all_urls.py`.
   Upstream's test harness runs with `verbose` on, so local patches must not
   write to the screen inside `YoutubeDL.__init__`.
