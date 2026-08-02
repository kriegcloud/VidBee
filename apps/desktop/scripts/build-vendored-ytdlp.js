#!/usr/bin/env node

/**
 * Build yt-dlp from vendor/yt-dlp and install it into apps/desktop/resources.
 *
 * Produces the platform resource name VidBee expects (yt-dlp_linux / yt-dlp_macos
 * / yt-dlp.exe). The artifact is yt-dlp's Python zipapp, which requires python3
 * on PATH at runtime — suitable for local engine development, not a drop-in for
 * the official standalone ELF used in production packages.
 */

import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { YTDLP_PLATFORM_ASSETS } from './ytdlp-assets.js'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(desktopRoot, '..', '..')
const vendorDir = path.join(repoRoot, 'vendor', 'yt-dlp')
const resourcesDir = path.join(desktopRoot, 'resources')
const markerPath = path.join(resourcesDir, '.ytdlp-vendored')

const platform = os.platform()
const platformAsset = YTDLP_PLATFORM_ASSETS[platform]

if (!platformAsset) {
  console.error(`Unsupported platform for vendored yt-dlp: ${platform}`)
  process.exit(1)
}

const outputName = platformAsset.output
const outputPath = path.join(resourcesDir, outputName)

function log(message, type = 'info') {
  const icons = {
    info: '📦',
    success: '✅',
    error: '❌',
    warn: '⚠️'
  }
  console.log(`${icons[type] || 'ℹ️'} ${message}`)
}

function ensureVendorSource() {
  if (!fs.existsSync(path.join(vendorDir, 'Makefile'))) {
    log(
      'Missing vendor/yt-dlp source. Clone it first:\n' +
        '  git clone --depth 1 https://github.com/yt-dlp/yt-dlp.git vendor/yt-dlp',
      'error'
    )
    process.exit(1)
  }
}

function gitRev() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: vendorDir,
      encoding: 'utf8'
    }).trim()
  } catch {
    return 'unknown'
  }
}

function gitDescribe() {
  try {
    return execFileSync('git', ['describe', '--tags', '--always'], {
      cwd: vendorDir,
      encoding: 'utf8'
    }).trim()
  } catch {
    return 'unknown'
  }
}

function resolvePython() {
  const candidates = process.env.PYTHON
    ? [process.env.PYTHON]
    : platform === 'win32'
      ? ['python', 'python3']
      : ['python3', 'python']

  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['--version'], {
      encoding: 'utf8',
      windowsHide: true
    })
    if (probe.status === 0) {
      return candidate
    }
  }

  log('python3 not found on PATH (required to build vendored yt-dlp)', 'error')
  process.exit(1)
}

function buildZipapp(pythonCmd) {
  // Portable shebang so the installed resource can run via env lookup.
  // Pass via env (not CLI) so values with spaces like `/usr/bin/env python3` work.
  const makePython = platform === 'win32' ? pythonCmd : `/usr/bin/env ${path.basename(pythonCmd)}`

  log(`Building yt-dlp zipapp in ${vendorDir} (PYTHON=${makePython})...`)
  if (platform === 'win32') {
    // Windows often lacks make; require make or WSL/MSYS2 for now.
    const makeProbe = spawnSync('make', ['--version'], {
      encoding: 'utf8',
      windowsHide: true
    })
    if (makeProbe.status !== 0) {
      log(
        'make is required to build vendored yt-dlp on this platform. ' +
          'Install make (or use Git Bash/MSYS2) and retry.',
        'error'
      )
      process.exit(1)
    }
  }

  execFileSync('make', ['yt-dlp'], {
    cwd: vendorDir,
    stdio: 'inherit',
    env: { ...process.env, PYTHON: makePython }
  })

  const builtPath = path.join(vendorDir, 'yt-dlp')
  if (!fs.existsSync(builtPath)) {
    log(`Build finished but ${builtPath} is missing`, 'error')
    process.exit(1)
  }
  return builtPath
}

function installBinary(builtPath) {
  fs.mkdirSync(resourcesDir, { recursive: true })
  fs.copyFileSync(builtPath, outputPath)
  if (platform !== 'win32') {
    fs.chmodSync(outputPath, 0o755)
  }

  const rev = gitRev()
  const describe = gitDescribe()
  const marker = {
    source: 'vendor',
    kind: 'zipapp',
    commit: rev,
    describe,
    installedAt: new Date().toISOString(),
    output: outputName,
    note: 'Python zipapp built from vendor/yt-dlp. Requires python3 on PATH.'
  }
  fs.writeFileSync(markerPath, `${JSON.stringify(marker, null, 2)}\n`, 'utf8')
  log(`Installed ${outputName} from vendor commit ${describe} (${rev.slice(0, 12)})`, 'success')
}

function verifyBinary() {
  const result = spawnSync(outputPath, ['--version'], {
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true
  })
  if (result.error || result.status !== 0) {
    const detail =
      result.error?.message ||
      `${result.stdout || ''}\n${result.stderr || ''}`.trim() ||
      `exit ${result.status}`
    log(`Installed binary failed --version: ${detail}`, 'error')
    process.exit(1)
  }
  const version = `${result.stdout || ''}${result.stderr || ''}`.trim().split(/\r?\n/)[0]
  log(`yt-dlp --version => ${version}`, 'success')
  return version
}

function main() {
  ensureVendorSource()
  const pythonCmd = resolvePython()
  log(`Using Python: ${pythonCmd}`)
  const builtPath = buildZipapp(pythonCmd)
  installBinary(builtPath)
  verifyBinary()
  log(
    'Vendored yt-dlp is ready. Run VidBee with pnpm dev (setup will keep this binary while .ytdlp-vendored exists).',
    'success'
  )
}

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))

if (isDirectExecution) {
  main()
}

export { main as buildVendoredYtDlp, markerPath, outputPath }
