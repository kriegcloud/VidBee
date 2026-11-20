#!/usr/bin/env node
/**
 * Bundles the CLI as a single ESM file (`dist/index.mjs`) plus the
 * npm-bin shim (`dist/bin/vidbee.mjs`).
 *
 * The published artifact is the standalone npm tarball — Desktop no
 * longer bundles the CLI (NEX-148). `--vidbee-local` requires the bundled
 * `@vidbee/task-queue` and `@vidbee/downloader-core`; the bundler inlines
 * them. `better-sqlite3` is left external so the npm consumer installs it
 * as an `optionalDependency` only when crash-recovery is wanted.
 */
import { build } from 'esbuild'
import { mkdirSync, chmodSync, rmSync, realpathSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const dist = join(root, 'dist')

// Wipe `dist/` on every build so a previous build's artifacts (e.g. the
// pre-NEX-148 `dist/shim/` directory) can never sneak into the published
// tarball.
rmSync(dist, { recursive: true, force: true })
mkdirSync(dist, { recursive: true })
mkdirSync(join(dist, 'bin'), { recursive: true })

const sourceRoot = realpathSync(join(root, 'src'))
const compiler = spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.resolve('tsrs/package.json'))), 'bin', 'tsrs'), '-p', join(dirname(sourceRoot), 'tsconfig.json'), '--emitDeclarationOnly', '--outDir', join(dist, 'library'), '--tsBuildInfoFile', join(dist, 'library', 'tsconfig.tsbuildinfo')], { cwd: root, stdio: 'inherit' })
if (compiler.status !== 0) process.exit(compiler.status ?? 1)

// Keep shared service identities across all three public entries.
const metadata = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
await build({
  entryPoints: ['index', 'parser/index', 'envelope/index'].map(name => join(sourceRoot, name + '.ts')),
  outbase: sourceRoot,
  outdir: join(dist, 'library'),
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  external: Object.keys(metadata.dependencies).filter(name => !name.startsWith('@vidbee/')),
})

// Copy private declaration closures, preserving each package's relative layout.
// Resolve through package metadata rather than relying on a node_modules layout.
const workspace = resolve(sourceRoot, '../../..')
const pending = [join(dist, 'library')]
const copied = []
function rewriteDeclarations(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name)
    if (entry.isDirectory()) { rewriteDeclarations(file); continue }
    if (!entry.name.endsWith('.d.ts')) continue
    const text = readFileSync(file, 'utf8').replace(/(from\s*|import\()(["'])@vidbee\/([^/"']+)([^"']*)\2/g, (_match, prefix, quote, name, subpath) => {
      const packageRoot = name === 'cli' ? dirname(sourceRoot) : join(workspace, 'packages', name)
      const info = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
      const exported = info.exports['.' + subpath]
      const target = (typeof exported === 'string' ? exported : exported?.types) ?? (existsSync(join(packageRoot, 'src', subpath.slice(1) + '.ts')) ? './src' + subpath + '.ts' : undefined)
      if (!target?.startsWith('./src/')) throw Error('No declaration export for @vidbee/' + name + subpath)
      const internal = name === 'cli' ? join(dist, 'library') : join(dist, 'library/internal', name)
      if (name !== 'cli' && !copied.includes(name)) {
        copied.push(name)
        const emitted = join(dist, '.declarations', name)
        const declarations = spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.resolve('tsrs/package.json'))), 'bin', 'tsrs'), '-p', join(packageRoot, 'tsconfig.json'), '--emitDeclarationOnly', '--outDir', emitted, '--tsBuildInfoFile', join(emitted, 'tsconfig.tsbuildinfo')], { cwd: root, stdio: 'inherit' })
        if (declarations.status !== 0) process.exit(declarations.status ?? 1)
        copyDeclarations(emitted, internal)
        pending.push(internal)
      }
      let specifier = relative(dirname(file), join(internal, target.slice(6).replace(/\.ts$/, '.js'))).replaceAll('\\', '/')
      if (!specifier.startsWith('.')) specifier = './' + specifier
      return prefix + quote + specifier + quote
    })
    writeFileSync(file, text)
  }
}
function copyDeclarations(source, target) {
  mkdirSync(target, { recursive: true })
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (entry.isDirectory()) copyDeclarations(join(source, entry.name), join(target, entry.name))
    else if (entry.name.endsWith('.d.ts')) writeFileSync(join(target, entry.name), readFileSync(join(source, entry.name)))
  }
}
while (pending.length) rewriteDeclarations(pending.shift())
rmSync(join(dist, '.declarations'), { recursive: true, force: true })

await build({
  entryPoints: [join(dirname(sourceRoot), '..', 'cli-legacy', 'src', 'entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outfile: join(dist, 'index.mjs'),
  external: ['better-sqlite3', 'electron', 'yt-dlp-wrap-plus', '@opentelemetry/api'],
  legalComments: 'inline',
  banner: {
    js: '#!/usr/bin/env node\n// @vidbee/cli — standalone build (NEX-148). Built by scripts/build.mjs.'
  }
})

// npm bin shim: thin wrapper that runs the bundled index.mjs.
const npmBin = `#!/usr/bin/env node
import('../index.mjs').catch((e) => {
  process.stderr.write(JSON.stringify({ ok: false, code: 'UNKNOWN_ERROR', message: String(e?.message ?? e) }) + '\\n')
  process.exit(2)
})
`
const npmBinPath = join(dist, 'bin', 'vidbee.mjs')
mkdirSync(dirname(npmBinPath), { recursive: true })
const fs = await import('node:fs/promises')
await fs.writeFile(npmBinPath, npmBin, 'utf-8')
chmodSync(npmBinPath, 0o755)

process.stdout.write(`built ${dist}\n`)
