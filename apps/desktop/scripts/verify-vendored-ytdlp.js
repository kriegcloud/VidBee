#!/usr/bin/env node

/**
 * Verify that the desktop resource yt-dlp binary is the vendored build and
 * that VidBee's resolution + a real metadata probe still work.
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { YTDLP_PLATFORM_ASSETS } from './ytdlp-assets.js'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const resourcesDir = path.join(scriptDir, '..', 'resources')
const platform = os.platform()
const platformAsset = YTDLP_PLATFORM_ASSETS[platform]

if (!platformAsset) {
  console.error(`Unsupported platform: ${platform}`)
  process.exit(1)
}

const outputName = platformAsset.output
const binaryPath = path.join(resourcesDir, outputName)
const markerPath = path.join(resourcesDir, '.ytdlp-vendored')

// Public, stable short clip used only for --skip-download metadata probe.
const PROBE_URL =
  process.env.VIDBEE_YTDLP_PROBE_URL || 'https://www.youtube.com/watch?v=jNQXAC9IVRw'
const skipNetwork = process.env.VIDBEE_YTDLP_SKIP_NETWORK === '1'

function fail(message) {
  console.error(`❌ ${message}`)
  process.exit(1)
}

function ok(message) {
  console.log(`✅ ${message}`)
}

function run(bin, args, options = {}) {
  return spawnSync(bin, args, {
    encoding: 'utf8',
    timeout: options.timeoutMs ?? 60_000,
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024
  })
}

function checkMarker() {
  if (!fs.existsSync(markerPath)) {
    fail(
      `Missing ${markerPath}. Run: pnpm run build:ytdlp\n` +
        '  (or set VIDBEE_YTDLP_ALLOW_STOCK=1 to verify a stock binary instead)'
    )
  }
  if (process.env.VIDBEE_YTDLP_ALLOW_STOCK === '1') {
    ok('VIDBEE_YTDLP_ALLOW_STOCK=1 — skipping vendor marker requirement')
    return null
  }
  const raw = fs.readFileSync(markerPath, 'utf8')
  let marker
  try {
    marker = JSON.parse(raw)
  } catch {
    fail('.ytdlp-vendored is not valid JSON')
  }
  if (marker.source !== 'vendor') {
    fail(`.ytdlp-vendored source is ${marker.source}, expected vendor`)
  }
  ok(
    `Vendor marker: commit ${marker.describe || marker.commit} kind=${marker.kind} output=${marker.output}`
  )
  return marker
}

function checkBinaryExists() {
  if (!fs.existsSync(binaryPath)) {
    fail(`Missing resource binary: ${binaryPath}`)
  }
  ok(`Resource binary present: ${binaryPath}`)
}

function checkVersion() {
  const result = run(binaryPath, ['--version'], { timeoutMs: 30_000 })
  if (result.error || result.status !== 0) {
    fail(
      `--version failed: ${result.error?.message || result.stderr || result.stdout || result.status}`
    )
  }
  const version = `${result.stdout || ''}${result.stderr || ''}`.trim().split(/\r?\n/)[0]
  ok(`yt-dlp --version => ${version}`)
  return version
}

/**
 * Mirror desktop YtDlpManager.resolveBundledYtDlp naming + resources layout.
 */
function checkDesktopResourceLayout() {
  const expectedName =
    platform === 'win32' ? 'yt-dlp.exe' : platform === 'darwin' ? 'yt-dlp_macos' : 'yt-dlp_linux'
  if (outputName !== expectedName) {
    fail(`Platform asset name mismatch: ${outputName} vs ${expectedName}`)
  }
  const resolved = path.join(resourcesDir, expectedName)
  if (!fs.existsSync(resolved)) {
    fail(`Desktop would not resolve bundled yt-dlp at ${resolved}`)
  }
  ok(`Desktop resource layout matches YtDlpManager (${expectedName})`)
}

function checkMetadataProbe() {
  if (skipNetwork) {
    ok('Skipping network metadata probe (VIDBEE_YTDLP_SKIP_NETWORK=1)')
    return
  }

  console.log(`📡 Probing metadata: ${PROBE_URL}`)
  const result = run(
    binaryPath,
    ['--ignore-config', '--no-playlist', '--skip-download', '-J', '--no-warnings', PROBE_URL],
    { timeoutMs: 120_000 }
  )

  if (result.error) {
    fail(`Metadata probe spawn error: ${result.error.message}`)
  }
  if (result.status !== 0) {
    const err = `${result.stderr || ''}\n${result.stdout || ''}`.trim()
    fail(`Metadata probe failed (exit ${result.status}): ${err.slice(0, 800)}`)
  }

  let info
  try {
    info = JSON.parse(result.stdout)
  } catch (error) {
    fail(`Metadata probe did not return JSON: ${error.message}`)
  }

  const title = info.title || info.id || '(no title)'
  const extractor = info.extractor || info.extractor_key || 'unknown'
  ok(`Metadata probe ok — extractor=${extractor} title=${JSON.stringify(title)}`)
}

function checkSetupRespectsVendor() {
  // Smoke: re-import download path logic by running setup and ensuring binary mtime
  // does not change when marker is present.
  const before = fs.statSync(binaryPath)
  const setupScript = path.join(scriptDir, 'setup-dev-binaries.js')
  const result = run(process.execPath, [setupScript], { timeoutMs: 180_000 })
  if (result.status !== 0) {
    fail(`pnpm setup path failed while vendored:\n${result.stderr || result.stdout}`)
  }
  const after = fs.statSync(binaryPath)
  if (before.mtimeMs !== after.mtimeMs || before.size !== after.size) {
    fail('setup-dev-binaries.js modified the vendored yt-dlp binary (marker should protect it)')
  }
  if (
    `${result.stdout || ''}`.includes('vendored') ||
    `${result.stdout || ''}`.includes('already exists')
  ) {
    ok('setup-dev-binaries.js kept the vendored binary')
  } else {
    // Soft check — message text may evolve
    console.warn('⚠️  setup ran ok but did not print an explicit vendored skip message')
  }
}

function main() {
  console.log('Verifying vendored yt-dlp for VidBee...\n')
  checkMarker()
  checkBinaryExists()
  checkVersion()
  checkDesktopResourceLayout()
  checkSetupRespectsVendor()
  checkMetadataProbe()
  console.log('\n✅ Vendored yt-dlp verification passed')
}

main()
