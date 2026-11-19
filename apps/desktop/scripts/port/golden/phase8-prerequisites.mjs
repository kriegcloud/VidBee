import { access, constants } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export async function phase8Prerequisites(
  build,
  cli = fileURLToPath(new URL('../../../../cli/dist/index.mjs', import.meta.url))
) {
  const required = [
    [cli, constants.R_OK],
    [path.join(build, 'vidbee'), constants.X_OK],
    [path.join(build, 'resources/resources/yt-dlp_linux'), constants.X_OK],
    [path.join(build, 'resources/resources/ffmpeg/ffmpeg'), constants.X_OK]
  ]
  const require = createRequire(new URL('../../../../cli/package.json', import.meta.url))
  for (const [file, mode] of required) {
    try {
      await access(file, mode)
    } catch {
      return `SKIP phase 8 goldens: missing prerequisite ${path.basename(file)}`
    }
  }
  for (const dependency of ['better-sqlite3', 'tsx']) {
    try {
      require.resolve(dependency)
    } catch {
      return `SKIP phase 8 goldens: missing prerequisite ${dependency}`
    }
  }
}
