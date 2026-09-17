#!/usr/bin/env node
/**
 * Bundle the API process and the isolated transcription worker.
 *
 * sherpa-onnx native addons stay external so esbuild does not try to load
 * `.node` files, matching the desktop Electron build.
 */
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const requireBanner =
  "import { createRequire as __vidbeeCreateRequire } from 'node:module'; const require = __vidbeeCreateRequire(import.meta.url);"

const shared = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  absWorkingDir: root,
  external: ['better-sqlite3', 'sherpa-onnx-node', 'sherpa-onnx-*', 'playwright-core'],
  banner: { js: requireBanner }
}

rmSync(dist, { recursive: true, force: true })
mkdirSync(dist, { recursive: true })

await build({
  ...shared,
  entryPoints: ['src/index.ts', 'scripts/migrate-history.ts'],
  outdir: dist,
  entryNames: '[name]'
})

await build({
  ...shared,
  entryPoints: [join(root, '../../packages/transcription/src/worker/entry.ts')],
  outfile: join(dist, 'transcription-worker.js')
})

await build({
  ...shared,
  entryPoints: [join(root, '../../packages/browser-capture/src/sidecar.ts')],
  outfile: join(dist, 'browser-capture-sidecar.js')
})

cpSync(
  join(root, '../desktop/resources/gallery-dl-extractors'),
  join(dist, 'resources/gallery-dl-extractors'),
  { recursive: true, filter: (source) => basename(source) !== '__pycache__' }
)
