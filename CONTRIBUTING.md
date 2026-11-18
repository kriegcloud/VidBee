# Contributing to VidBee

Thank you for taking the time to improve VidBee. These notes keep the project maintainable and easy to review.

## Getting Ready
- Use Node.js (version in `.node-version`) and Bun (version in `.bun-version`); `mise install` sets up both.
- Install dependencies with `bun install`.
- Run `bun run dev` to test changes locally.

## Tech Stack
- Runtime: Electron 38, electron-vite, electron-builder.
- Frontend: React 19, React Router, Jotai, React Hook Form, Tailwind CSS 4, shadcn/ui, Lucide icons.
- Tooling: TypeScript, Bun, Biome, dayjs, electron-log, electron-store, electron-updater, i18next, next-themes.

## Local Development
- Use `bun install` to pull dependencies after cloning.
- Start the Electron and Vite development environment with `bun run dev`; hot module replacement is already configured.
- Preview the production build locally with `bun run start`.

## Useful Scripts

| Command | Purpose |
| --- | --- |
| `bun run typecheck` | Type-check the main and renderer projects. |
| `bun run build` | Run type checks and produce production bundles. |
| `bun run build:win` / `bun run build:mac` / `bun run build:linux` | Create platform-specific distributables. |
| `bun run build:unpack` | Produce unpacked output directories for inspection. |
| `bun run check` | Format and lint the codebase with Biome. |
| `bun run deps:check` | Verify every manifest follows the dependency catalog rules (syncpack). |
| `bun run deps:fix` | Rewrite manifests to follow those rules. |
| `bun run deps:update` | Bump catalog versions to the latest releases. |

## Dependencies
- Every third-party version is declared once, in the `catalog` of the root `package.json`.
- Workspace manifests reference it with `"name": "catalog:"` and reference each other with `"@vidbee/name": "workspace:^"`.
- To add a dependency, add its range to the root catalog, then add `"name": "catalog:"` to the package that uses it and run `bun install`.
- Exceptions, enforced by `syncpack.config.ts`: `electron-updater` and `electron` stay literal in `apps/desktop/package.json`, because electron-builder reads them from that file, and `electron` must match the exact catalog pin.
- Peer dependency ranges are not catalogued.

## Project Structure

```text
apps/desktop/src/
|-- main/            # Electron main process, IPC services, configuration
|-- preload/         # Context bridge and preload helpers
`-- renderer/
    |-- src/
    |   |-- pages/      # Application routes (Home, Settings, Playlist, etc.)
    |   |-- components/ # UI components, download views, shared controls
    |   |-- data/       # Static datasets such as popularSites.ts
    |   |-- hooks/      # Custom hooks and global atoms
    |   |-- lib/        # Utilities shared across the renderer
    |   `-- assets/     # Global styles and icons
    `-- index.html
```

## Internationalization
- i18next drives localization with English (`en`) and Simplified Chinese (`zh-CN`) namespaces.
- Only update strings in `apps/desktop/src/renderer/src/locales/en.json`; maintainers handle the other locales.
- Keep copy edits focused and avoid removing translation keys without discussion.

## Configuration and Storage
- Persistent settings are stored with `electron-store` and exposed through IPC helpers.
- User-facing preferences such as download paths and themes live in `apps/desktop/src/main/settings.ts` and related services.
- Logs are recorded with `electron-log` to simplify troubleshooting.

## Packaging
- Build production bundles with `bun run build`.
- Create platform-specific artifacts with `bun run build:win`, `bun run build:mac`, or `bun run build:linux`.
- Use `bun run build:unpack` to generate unpacked directories under `apps/desktop/dist/` for manual inspection.
- Bundle `yt-dlp` under `apps/desktop/resources/` and `ffmpeg/ffprobe` under `apps/desktop/resources/ffmpeg/` before packaging so merges and audio extraction work out of the box.

## Releasing

VidBee publishes stable releases with `bun run release` and `vX.Y.Z` tags. Installed apps
automatically follow the stable `latest` channel through the GitHub provider configured in
`apps/desktop/electron-builder.yml`, which emits `latest*.yml` update metadata.

- The release command runs `bun run check` and then `bumpp`, which bumps
  `apps/desktop/package.json`, commits, tags, and pushes. The tag push triggers
  `.github/workflows/release.yml`, which builds every platform, publishes the GitHub release,
  and notifies Cloudflare Pages. Tags containing a prerelease suffix do not trigger this workflow.
- Before building, CI runs `apps/desktop/scripts/stamp-release.mjs` (see `build.yml`) to stamp
  the tag's version into `package.json`.
- A manual `workflow_dispatch` run of the release workflow is a build-only smoke test: it
  produces artifacts but does **not** publish a release (no tag).

## Working on Changes
- Keep each pull request focused on a single problem or feature.
- Run `bun run check` before committing to ensure formatting and linting stay consistent.
- Write comments and console messages in English only.
- When updating copy in the app, adjust strings in `apps/desktop/src/renderer/src/locales/en.json`; other locale files are handled by maintainers.

## Opening Issues
- Search existing issues to avoid duplicates.
- Describe the problem clearly with steps to reproduce, expected behaviour, and screenshots or logs when useful.

## Submitting Pull Requests
- Explain the motivation and impact of the change in the description.
- Mention any user facing updates or migrations.
- Confirm that `bun run check` passes and note any follow-up work that is out of scope.

We appreciate every contribution that keeps VidBee simple and reliable.
