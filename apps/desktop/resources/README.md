# Resources Directory

This directory contains bundled resources for the application.

## gallery-dl Binary

VidBee uses `gallery-dl` for Instagram profile and gallery downloads. Running
`pnpm --filter vidbee setup` downloads the pinned standalone build for the
current platform, verifies its SHA-256 digest, and stores it as:

1. **Windows**: `gallery-dl.exe`
2. **macOS**: `gallery-dl_macos`
3. **Linux**: `gallery-dl_linux`

Set `GALLERY_DL_PATH` to use a compatible system installation during
development. See `THIRD_PARTY_NOTICES.md` for source and license information.

## yt-dlp Binaries

To bundle yt-dlp with the application, place the appropriate binaries in this directory:

### Required Files

1. **Windows**: `yt-dlp.exe`
2. **macOS**: `yt-dlp_macos`
3. **Linux**: `yt-dlp_linux`

### Vendored source build

VidBee tracks yt-dlp under `vendor/yt-dlp`. Customize that source and build the
standalone executable for the current platform with:

```bash
pnpm run build:ytdlp
pnpm run verify:ytdlp
```

That writes the platform binary plus `.ytdlp-vendored`. `pnpm setup` checks the
effective source digest and rebuilds changed source instead of downloading a
stock release. See `vendor/README.md` for build prerequisites and update notes.

### Stock fallback

The setup script can still download official binaries if the vendored source is
intentionally removed. Normal VidBee development and release builds use the
tracked source snapshot.

**Option 1: Manual Download**

- Visit: <https://github.com/yt-dlp/yt-dlp/releases/latest>
- Download the appropriate version for each platform:
  - Windows: `yt-dlp.exe`
  - macOS: `yt-dlp_macos`
  - Linux: `yt-dlp` (rename to `yt-dlp_linux`)

**Option 2: Using curl/wget (Linux/macOS)**

```bash
# For Windows binary
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe -o resources/yt-dlp.exe

# For macOS binary
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos -o resources/yt-dlp_macos
chmod +x resources/yt-dlp_macos

# For Linux binary
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o resources/yt-dlp_linux
chmod +x resources/yt-dlp_linux
```

**Option 3: Using PowerShell (Windows)**

```powershell
# Download all three binaries
Invoke-WebRequest -Uri "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" -OutFile "resources/yt-dlp.exe"
Invoke-WebRequest -Uri "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos" -OutFile "resources/yt-dlp_macos"
Invoke-WebRequest -Uri "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" -OutFile "resources/yt-dlp_linux"
```

## ffmpeg/ffprobe Binaries

ffmpeg is required for merging audio/video streams and audio extraction. ffprobe is required for post-processing metadata. Bundle both binaries under `resources/ffmpeg/`.

### Required Files

1. **Windows**: `resources/ffmpeg/ffmpeg.exe` and `resources/ffmpeg/ffprobe.exe`
2. **macOS**: `resources/ffmpeg/ffmpeg` and `resources/ffmpeg/ffprobe`
3. **Linux**: `resources/ffmpeg/ffmpeg` and `resources/ffmpeg/ffprobe`

### How to Download

- **Windows / Linux**: Grab static builds from <https://ffmpeg.org/download.html> (or <https://github.com/yt-dlp/FFmpeg-Builds/releases>) and copy `ffmpeg` and `ffprobe` into `resources/ffmpeg/`.
- **macOS**: Download the `ffmpeg-*.zip` asset from <https://github.com/eko5624/mpv-mac/releases/latest>, then copy `ffmpeg` and `ffprobe` from the archive into `resources/ffmpeg/`.
- On macOS/Linux ensure both binaries are executable: `chmod +x resources/ffmpeg/ffmpeg resources/ffmpeg/ffprobe`.

### Note

- Bundled binaries are required for Windows builds. On macOS/Linux the app can also use ffmpeg/ffprobe from the system PATH.
- You can override the lookup path via `FFMPEG_PATH`. It must point to a directory containing both `ffmpeg` and `ffprobe`.
- File sizes: ~40-80 MB per ffmpeg build (ffmpeg + ffprobe)

## JS Runtime (Node)

yt-dlp EJS uses an external JavaScript runtime. VidBee reuses the bundled official Node LTS at `resources/node/` (also used by the transcription worker). Do not bundle a separate Deno binary.

At runtime, Desktop copies yt-dlp into a writable `userData` kernel so the signed app bundle is not mutated, then silently checks the official Stable channel. Only the active managed copy is kept; older kernels are deleted after a newer one is activated. Node stays on the packaged LTS lock.

You can override the EJS runtime path via `YTDLP_JS_RUNTIME_PATH` if needed.
