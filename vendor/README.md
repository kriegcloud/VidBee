# Vendored third-party sources

## yt-dlp

VidBee normally downloads prebuilt yt-dlp binaries into `apps/desktop/resources/`.
For local engine work (extractor fixes, experiments), clone and build from source here.

### One-time clone

```bash
git clone --depth 1 https://github.com/yt-dlp/yt-dlp.git vendor/yt-dlp
# optional: pin a release
# cd vendor/yt-dlp && git fetch --tags && git checkout 2026.07.04
```

The clone is gitignored (large upstream tree + nested `.git`).

### Build & install into desktop resources

```bash
pnpm --filter vidbee run build:ytdlp
# or from repo root:
pnpm run build:ytdlp
```

This runs yt-dlp's `make yt-dlp` (Python zipapp) and installs the result as the
platform resource binary (`yt-dlp_linux` / `yt-dlp_macos` / `yt-dlp.exe`).

A marker file `apps/desktop/resources/.ytdlp-vendored` records the source commit.
While that marker exists, `pnpm setup` will not replace the binary with a stock
GitHub release download.

### Notes

- The local build is a **Python zipapp**, not the official standalone
  `yt-dlp_linux` ELF. It needs a working `python3` on `PATH` (3.9+ recommended).
- Official packaged apps keep using the standalone release binaries for broader
  OS compatibility (see Sentry VIDBEE-397).
- After editing extractors under `vendor/yt-dlp/`, re-run `pnpm run build:ytdlp`.
