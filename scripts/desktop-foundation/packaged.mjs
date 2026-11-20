import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { capture } from '../../apps/desktop/scripts/port/golden/capture.mjs'
import { browserCaptureCdp } from '../../apps/desktop/scripts/port/golden/browser-capture-cdp.mjs'

const args = process.argv.slice(2)
const option = (key) => args[args.indexOf(key) + 1]
const here = path.dirname(fileURLToPath(import.meta.url))
if (args.includes('--worker')) {
  let secondInstance
  if (args.includes('--second-instance')) {
    const run = option('--run')
    assert.equal(createHash('sha256').update(await fs.readFile(path.join(option('--build'), 'resources/app.asar'))).digest('hex'), option('--sha256'))
    const result = await capture(path.join(option('--build'), 'vidbee'), ['--no-sandbox', '--ozone-platform=headless',
      '--disable-gpu', `--user-data-dir=${path.join(run, 'userdata')}`, '--background'], {
      timeoutMs: 20000, env: { PATH: '/usr/bin:/bin', HOME: path.join(run, 'home'), TMPDIR: (await fs.readFile(path.join(run, 'tmp-root'), 'utf8')).trim(),
        XDG_CONFIG_HOME: path.join(run, 'home/.config'), XDG_CACHE_HOME: path.join(run, 'home/.cache'),
        XDG_DATA_HOME: path.join(run, 'home/.local/share'), VIDBEE_AUTOMATION_DESCRIPTOR: path.join(run, 'second-automation.json'),
        VIDBEE_MCP_CONFIG: path.join(run, 'second-mcp.json'), LANG: 'en_US.UTF-8', TZ: process.env.TZ ?? 'UTC' } })
    await fs.writeFile(path.join(run, 'second-instance.json'), JSON.stringify(result, null, 2))
    assert.equal(result.code, 0, result.stderr)
    secondInstance = { code: result.code, signal: result.signal,
      importLogger: result.stdout.includes('Log file location:'), readyApi: result.stdout.includes('Extension API listening on') }
  }
  const cdp = await browserCaptureCdp()
  try {
    const result = await cdp.evaluate(`(async () => {
      const invoke = (name, ...args) => window.electron.ipcRenderer.invoke(name, ...args)
      const initial = await invoke('settings.getAll')
      const individual = {}
      for (const key of Object.keys(initial)) individual[key] = await invoke('settings.get', key)
      const preload = { keys: Object.keys(window.api), groups: ['app','settings','window'].map(k => typeof window.api[k]),
        invalidFile: window.api.getPathForFile(new File(['fixture'], 'fixture.txt')) }
      let count = 0
      const callback = () => { count++ }
      const wrapper = window.api.on('settings:changed', callback)
      await invoke('settings.setAll', { launchAtLogin: false, hideDockIcon: false, language: 'en' })
      await new Promise(r => setTimeout(r, 50))
      const afterBatch = count
      await invoke('settings.set', 'future.nested', { retained: ['synthetic', 7] })
      await new Promise(r => setTimeout(r, 50))
      const afterSingle = count
      const persisted = await invoke('settings.getAll')
      window.api.removeListener('settings:changed', wrapper)
      await invoke('settings.set', 'theme', 'dark')
      await new Promise(r => setTimeout(r, 50))
      const afterRemoval = count
      const whatsNew = { before: await invoke('settings.shouldPromptWhatsNew') }
      await invoke('settings.markWhatsNewSeen')
      whatsNew.after = await invoke('settings.shouldPromptWhatsNew')
      const app = { version: await invoke('app.getVersion'), platform: await invoke('app.getPlatform'),
        downloader: await invoke('app.getDownloaderStatus') }
      let share
      try {
        const bytes = await invoke('window.captureShareCard', { kind: 'caption',
          quote: { before: '', after: '', quote: 'Synthetic foundation quote.', startMs: 0, endMs: 1000 },
          tagline: 'Synthetic fixture', sourceTitle: 'Foundation' })
        const png = new Uint8Array(bytes)
        const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
        await invoke('window.writeShareImage', bytes)
        share = { signature: Array.from(png.slice(0, 8)), width: view.getUint32(16), height: view.getUint32(20), copied: true }
      } catch (error) { share = { error: error.message } }
      const kernelStatus = await invoke('app.getYtDlpKernelStatus')
      const kernel = { ready: kernelStatus.ready, state: kernelStatus.state, source: kernelStatus.source }
      const windowState = { initial: await invoke('window.isMaximized') }
      await invoke('window.maximize')
      windowState.afterToggle = await invoke('window.isMaximized')
      await invoke('window.maximize')
      windowState.afterSecondToggle = await invoke('window.isMaximized')
      await invoke('settings.reset')
      await new Promise(r => setTimeout(r, 50))
      return { initial, individual, preload, persisted, events: { afterBatch, afterSingle, afterRemoval, afterReset: count },
        whatsNew, app, kernel, windowState, share, reset: await invoke('settings.getAll') }
    })()`)
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    const observations = result.result.value
    if (secondInstance) observations.secondInstance = secondInstance
    const restartWrite = await cdp.evaluate(`(async () => {
      await window.electron.ipcRenderer.invoke('settings.setAll', { theme: 'dark',
        foundationRestart: { retained: ['synthetic', 7] } })
      return true
    })()`)
    if (restartWrite.exceptionDetails) throw new Error(JSON.stringify(restartWrite.exceptionDetails))
    observations.screens = []
    for (const route of ['/settings', '/about']) {
      const screen = await cdp.evaluate(`(async () => {
        location.hash = ${JSON.stringify(route)}
        const deadline = Date.now() + 10000
        while (Date.now() < deadline) {
          if (document.body.innerText.includes(${JSON.stringify(route === '/settings' ? 'General' : 'VidBeep')})) break
          await new Promise(r => setTimeout(r, 50))
        }
        return { route: location.hash, hasControls: document.querySelectorAll('button,input,select').length > 0,
          hasExpectedText: document.body.innerText.includes(${JSON.stringify(route === '/settings' ? 'General' : 'VidBeep')}) }
      })()`)
      if (screen.exceptionDetails) throw new Error(JSON.stringify(screen.exceptionDetails))
      observations.screens.push(screen.result.value)
    }
    await fs.writeFile(option('--output'), JSON.stringify(observations, null, 2))
  } finally { cdp.close() }
  process.exit(0)
}

assert(args.includes('--build') && args.includes('--scratch') && args.includes('--sha256'), 'Require disk-backed lane --scratch and explicit --sha256')
const build = path.resolve(option('--build'))
const scratch = path.resolve(option('--scratch'))
const expectedHash = option('--sha256')
const timezone = process.env.TZ ?? 'UTC'
assert(['UTC', 'Asia/Tokyo'].includes(timezone), 'Use TZ=UTC or TZ=Asia/Tokyo for the packaged fixture')
const expected = path.join(here, timezone === 'Asia/Tokyo' ? 'packaged.tokyo.expected.json' : 'packaged.expected.json')
const verify = async () => {
  const hash = createHash('sha256').update(await fs.readFile(path.join(build, 'resources/app.asar'))).digest('hex')
  assert.equal(hash, expectedHash, 'Build changed before recording')
  return hash
}
await fs.mkdir(scratch, { recursive: true })
const work = await fs.mkdtemp(path.join(scratch, 'foundation-'))
let active
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  if (active && active.exitCode === null && active.signalCode === null) {
    const ended = new Promise((resolve) => active.once('close', resolve))
    active.kill('SIGTERM'); await ended
  }
  process.exit(1)
})
const observations = {}
const quote = (value) => String.fromCharCode(39) + value.replaceAll(String.fromCharCode(39), String.fromCharCode(39, 92, 39, 39)) + String.fromCharCode(39)
const backgroundBuild = path.join(work, 'background-build')
await fs.mkdir(backgroundBuild)
await fs.symlink(path.join(build, 'resources'), path.join(backgroundBuild, 'resources'))
const quotedBinary = quote(path.join(build, 'vidbee'))
await fs.writeFile(path.join(backgroundBuild, 'vidbee'), `#!/bin/sh\nexec ${quotedBinary} --background "$@"\n`, { mode: 0o755 })
for (const [name, config] of Object.entries({ fresh: undefined, singleInstance: undefined, background: undefined, returning: { language: 'fr', lastSeenWhatsNew: 'old',
  future: { keep: 9 }, extensionCookieSources: [{ id: 'fixture', browser: 'test', extra: 'keep' }] },
  restart: 'reuse',
  current: { language: 'en', lastSeenWhatsNew: 'ai-transcripts' },
  malformedFields: { theme: 42, proxy: null, asrTier: 'invalid', agentManagementTools: 'legacy',
    ttsModelId: 'unknown-family-v1', downloadMirror: 'invalid', transcriptionProvider: 'invalid' } })) {
  await verify()
  const run = path.join(work, name)
  let seed = ''
  if (config === 'reuse') { seed = path.join(work, 'returning', 'userdata') }
  else if (config) {
    seed = path.join(work, `${name}-seed`); await fs.mkdir(seed)
    await fs.writeFile(path.join(seed, 'config.json'), JSON.stringify(config))
  }
  const launchSetup = path.join(work, `${name}-launch.sh`)
  await fs.writeFile(launchSetup, `export TZ=${quote(process.env.TZ ?? 'UTC')}\n${name === 'singleInstance' ? 'unset VIDBEE_ALLOW_MULTIPLE_INSTANCES\n' : ''}`)
  const launcher = spawn('bash', [path.resolve(here, '../../apps/desktop/scripts/port/offline-launch.sh'), name === 'background' ? backgroundBuild : build, run, '180', seed, '', launchSetup],
    { stdio: ['ignore', 'ignore', 'pipe'] })
  active = launcher
  let stderr = ''; launcher.stderr.on('data', (data) => { stderr += data })
  try {
    const deadline = Date.now() + 90_000
    let pid
    while (Date.now() < deadline) {
      if (launcher.exitCode !== null) throw new Error(`Offline launcher exited ${launcher.exitCode}: ${stderr}`)
      try { await fs.access(path.join(run, 'mcp.json')); pid = (await fs.readFile(path.join(run, 'namespace.pid'), 'utf8')).trim(); break }
      catch { await delay(100) }
    }
    assert(pid, `Readiness deadline: ${stderr}`)
    const output = path.join(work, `${name}.json`)
    const result = await capture('nsenter', ['-t', pid, '-U', '-n', '--preserve-credentials', process.execPath,
      fileURLToPath(import.meta.url), '--worker', '--output', output,
      ...(name === 'singleInstance' ? ['--second-instance', '--build', build, '--run', run, '--sha256', expectedHash] : [])], { timeoutMs: 100_000 })
    assert.equal(result.code, 0, result.stderr)
    const raw = JSON.parse(await fs.readFile(output, 'utf8'))
    // Only the exact throwaway HOME/download root varies. No generic string/clock/error filtering.
    let normalized = JSON.stringify(raw).split(path.join(run, 'home')).join('<home>')
    if (name === 'restart') normalized = normalized.split(path.join(work, 'returning/home')).join('<previous-home>')
    assert(!normalized.includes(work), 'An unclassified scratch path entered the fixture')
    observations[name] = JSON.parse(normalized)
    const log = await fs.readFile(path.join(run, 'stdout.log'), 'utf8')
    const milestones = ['Log file location:', 'database initialized at', 'Fresh install locale',
      'ffmpeg initialized successfully', 'Extension API listening on', 'Automation descriptor written at',
      'Desktop MCP available at', 'Desktop launched with --background; main window will stay hidden']
    observations[name].boot = milestones.map((label) => ({ label, index: log.indexOf(label) }))
      .filter((entry) => entry.index >= 0).sort((a, b) => a.index - b.index).map((entry) => entry.label)
    assert(observations[name].boot.includes('Desktop MCP available at'), 'Missing packaged boot milestone')
    await fs.writeFile(path.join(work, `${name}-stored.json`), await fs.readFile(path.join(run, 'userdata/config.json')))
  } finally {
    if (launcher.exitCode === null) {
      const ended = new Promise((resolve) => launcher.once('close', resolve))
      launcher.kill('SIGTERM'); await ended
    }
    active = undefined
  }
}
await fs.writeFile(path.join(work, 'build.json'), JSON.stringify({ appAsarSha256: await verify(), build, node: process.version, timezone: process.env.TZ ?? 'UTC' }))
await fs.writeFile(path.join(work, 'actual.json'), JSON.stringify(observations, null, 2))
if (args.includes('--record')) await fs.writeFile(expected, JSON.stringify(observations, null, 2) + '\n')
else assert.deepEqual(observations, JSON.parse(await fs.readFile(expected, 'utf8')))
process.stdout.write(`Packaged foundation: 7 profiles passed; evidence ${work}\n`)
