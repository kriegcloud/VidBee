#!/usr/bin/env node

/**
 * Build the tracked yt-dlp source snapshot as a standalone executable and
 * install it into the platform-specific Desktop resources path.
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { YTDLP_PLATFORM_ASSETS } from './ytdlp-assets.js'

const scriptPath = fileURLToPath(import.meta.url)
const scriptDir = path.dirname(scriptPath)
const desktopRoot = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(desktopRoot, '..', '..')
const vendorDir = path.join(repoRoot, 'vendor', 'yt-dlp')
const vendorMetadataPath = path.join(vendorDir, 'VENDOR.json')
const resourcesDir = path.join(desktopRoot, 'resources')
const markerPath = path.join(resourcesDir, '.ytdlp-vendored')
const platform = os.platform()
const platformAsset = YTDLP_PLATFORM_ASSETS[platform]

if (!platformAsset) {
  throw new Error(`Unsupported platform for vendored yt-dlp: ${platform}`)
}

const outputName = platformAsset.output
const outputPath = path.join(resourcesDir, outputName)
const SOURCE_DIRECTORIES = ['bundle', 'devscripts', 'yt_dlp']
const SOURCE_FILES = [
  'LICENSE',
  'Makefile',
  'pyproject.toml',
  'THIRD_PARTY_LICENSES.txt',
  'uv.lock',
  'VENDOR.json'
]
const EXCLUDED_SOURCE_NAMES = new Set(['.venv', '__pycache__', 'build', 'dist', 'zip'])
const EXCLUDED_SOURCE_PATHS = new Set(['yt_dlp/extractor/lazy_extractors.py'])

const log = (message, type = 'info') => {
  const icons = {
    info: '📦',
    success: '✅',
    error: '❌'
  }
  console.log(`${icons[type] ?? 'ℹ️'} ${message}`)
}

const readVendorMetadata = () => {
  if (!fs.existsSync(vendorMetadataPath)) {
    throw new Error(`Missing tracked yt-dlp metadata: ${vendorMetadataPath}`)
  }

  const metadata = JSON.parse(fs.readFileSync(vendorMetadataPath, 'utf8'))
  if (
    metadata.schemaVersion !== 1 ||
    typeof metadata.upstream !== 'string' ||
    typeof metadata.ref !== 'string' ||
    typeof metadata.commit !== 'string'
  ) {
    throw new Error(`${vendorMetadataPath} has an invalid schema`)
  }
  return metadata
}

const collectSourceFiles = (directory, relativeDirectory, files) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (EXCLUDED_SOURCE_NAMES.has(entry.name)) {
      continue
    }

    const absolutePath = path.join(directory, entry.name)
    const relativePath = path.posix.join(relativeDirectory, entry.name)
    if (EXCLUDED_SOURCE_PATHS.has(relativePath)) {
      continue
    }
    if (entry.isDirectory()) {
      collectSourceFiles(absolutePath, relativePath, files)
    } else if (entry.isFile()) {
      files.push(relativePath)
    }
  }
}

const computeVendorSourceDigest = () => {
  readVendorMetadata()
  const files = []
  for (const relativePath of SOURCE_FILES) {
    const absolutePath = path.join(vendorDir, relativePath)
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Vendored yt-dlp source is incomplete: missing ${relativePath}`)
    }
    files.push(relativePath)
  }
  for (const relativeDirectory of SOURCE_DIRECTORIES) {
    const absoluteDirectory = path.join(vendorDir, relativeDirectory)
    if (!fs.existsSync(absoluteDirectory)) {
      throw new Error(`Vendored yt-dlp source is incomplete: missing ${relativeDirectory}`)
    }
    collectSourceFiles(absoluteDirectory, relativeDirectory, files)
  }

  const digest = createHash('sha256')
  for (const relativePath of files.sort()) {
    digest.update(relativePath)
    digest.update('\0')
    digest.update(fs.readFileSync(path.join(vendorDir, relativePath)))
    digest.update('\0')
  }
  return digest.digest('hex')
}

const readBuildMarker = () => {
  if (!fs.existsSync(markerPath)) {
    return null
  }
  try {
    return JSON.parse(fs.readFileSync(markerPath, 'utf8'))
  } catch {
    return null
  }
}

const isVendoredBuildCurrent = () => {
  if (!(fs.existsSync(vendorMetadataPath) && fs.existsSync(outputPath))) {
    return false
  }
  const marker = readBuildMarker()
  return (
    marker?.source === 'vendor' &&
    marker.kind === 'standalone' &&
    marker.output === outputName &&
    marker.platform === platform &&
    marker.arch === os.arch() &&
    marker.sourceDigest === computeVendorSourceDigest()
  )
}

const resolveUv = () => {
  const command = process.env.UV?.trim() || 'uv'
  const result = spawnSync(command, ['--version'], {
    encoding: 'utf8',
    windowsHide: true
  })
  if (result.status !== 0) {
    throw new Error(
      'uv is required to build the vendored standalone yt-dlp executable. Install uv and retry.'
    )
  }
  return command
}

const prepareBuildEnvironment = (uvCommand) => {
  const args = [
    'sync',
    '--locked',
    '--no-default-groups',
    '--extra',
    'default',
    '--extra',
    'curl-cffi',
    '--group',
    'pyinstaller'
  ]
  const python = process.env.PYTHON?.trim()
  if (python) {
    args.push('--python', python)
  }

  log('Syncing yt-dlp build dependencies from vendor/yt-dlp/uv.lock...')
  execFileSync(uvCommand, args, {
    cwd: vendorDir,
    stdio: 'inherit'
  })

  const pythonPath = path.join(
    vendorDir,
    '.venv',
    platform === 'win32' ? 'Scripts' : 'bin',
    platform === 'win32' ? 'python.exe' : 'python'
  )
  if (!fs.existsSync(pythonPath)) {
    throw new Error(`uv completed but the build interpreter is missing at ${pythonPath}`)
  }
  return pythonPath
}

const buildStandalone = (pythonPath) => {
  const buildDir = path.join(vendorDir, 'build')
  const distDir = path.join(vendorDir, 'dist')
  fs.rmSync(buildDir, { force: true, recursive: true })
  fs.rmSync(distDir, { force: true, recursive: true })

  log('Generating yt-dlp lazy extractors...')
  execFileSync(pythonPath, ['devscripts/make_lazy_extractors.py'], {
    cwd: vendorDir,
    stdio: 'inherit'
  })

  log(`Building standalone yt-dlp for ${platform}/${os.arch()}...`)
  execFileSync(pythonPath, ['-m', 'bundle.pyinstaller'], {
    cwd: vendorDir,
    stdio: 'inherit'
  })

  const candidates = fs
    .readdirSync(distDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith('yt-dlp'))
  if (candidates.length !== 1) {
    throw new Error(
      `Expected one standalone yt-dlp artifact in ${distDir}, found ${candidates.length}`
    )
  }
  return path.join(distDir, candidates[0].name)
}

const verifyBinary = () => {
  const result = spawnSync(outputPath, ['--version'], {
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true
  })
  if (result.error || result.status !== 0) {
    const detail =
      result.error?.message ||
      `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim() ||
      `exit ${result.status}`
    throw new Error(`Installed yt-dlp failed --version: ${detail}`)
  }
  return `${result.stdout ?? ''}${result.stderr ?? ''}`.trim().split(/\r?\n/)[0]
}

const installBinary = (builtPath, metadata, sourceDigest) => {
  fs.mkdirSync(resourcesDir, { recursive: true })
  fs.copyFileSync(builtPath, outputPath)
  if (platform !== 'win32') {
    fs.chmodSync(outputPath, 0o755)
  }
  fs.copyFileSync(path.join(vendorDir, 'LICENSE'), path.join(resourcesDir, 'yt-dlp-LICENSE.txt'))
  fs.copyFileSync(
    path.join(vendorDir, 'THIRD_PARTY_LICENSES.txt'),
    path.join(resourcesDir, 'yt-dlp-THIRD_PARTY_LICENSES.txt')
  )

  const version = verifyBinary()
  const marker = {
    source: 'vendor',
    kind: 'standalone',
    commit: metadata.commit,
    describe: metadata.ref,
    sourceDigest,
    version,
    builtAt: new Date().toISOString(),
    platform,
    arch: os.arch(),
    output: outputName
  }
  fs.writeFileSync(markerPath, `${JSON.stringify(marker, null, 2)}\n`, 'utf8')
  log(
    `Installed ${outputName} ${version} from ${metadata.ref} (${metadata.commit.slice(0, 12)})`,
    'success'
  )
}

const buildVendoredYtDlp = () => {
  const metadata = readVendorMetadata()
  const sourceDigest = computeVendorSourceDigest()
  const uvCommand = resolveUv()
  const pythonPath = prepareBuildEnvironment(uvCommand)
  const builtPath = buildStandalone(pythonPath)
  installBinary(builtPath, metadata, sourceDigest)
  log('VidBee will now use the vendored standalone yt-dlp build.', 'success')
}

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(scriptPath)

if (isDirectExecution) {
  try {
    buildVendoredYtDlp()
  } catch (error) {
    log(error instanceof Error ? error.message : String(error), 'error')
    process.exitCode = 1
  }
}

export {
  buildVendoredYtDlp,
  computeVendorSourceDigest,
  isVendoredBuildCurrent,
  markerPath,
  outputPath,
  readVendorMetadata,
  vendorMetadataPath
}
