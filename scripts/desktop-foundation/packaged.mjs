import { containedLaunch } from './containment.mjs'
import { packagedControls } from './packaged-controls.mjs'
import { packagedEvents } from './packaged-events.mjs'
import os from 'node:os'
import { admitBuild } from './build-admission.mjs'
import assert from 'node:assert/strict'
import { verifyWorker, namespace } from './isolation.mjs'
import { randomUUID, createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { capture } from '../../apps/desktop/scripts/port/golden/capture.mjs'
import { browserCaptureCdp } from '../../apps/desktop/scripts/port/golden/browser-capture-cdp.mjs'

const args = process.argv.slice(2)
const option = (key) => args.includes(key) ? args[args.indexOf(key) + 1] : undefined
const here = path.dirname(fileURLToPath(import.meta.url))
if (args.includes('--worker')) {
  const owned = await verifyWorker({ run: option('--run'), identity: option('--identity') })
  const targets = await (await fetch('http://127.0.0.1:9230/json')).json()
  const pages = targets.filter(target => target.type === 'page')
  assert.equal(pages.length, 1, 'Isolation refused: unexpected renderer targets')
  assert(pages[0].url.split('#')[0] === 'vidbee://renderer/index.html', 'Isolation refused: unexpected renderer URL')
  let secondInstance
  if (args.includes('--second-instance')) {
    assert.equal(path.resolve(option('--build')), owned.build, 'Isolation refused: secondary build mismatch')
    assert.equal(option('--sha256'), owned.asar, 'Isolation refused: secondary hash mismatch')
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
  const control = new WebSocket(pages[0].webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    control.addEventListener('open', resolve, { once: true })
    control.addEventListener('error', reject, { once: true })
  })
  let pauseResolve
  let commandId = 0
  const pending = Object.create(null)
  control.addEventListener('message', event => {
    const response = JSON.parse(event.data)
    if(response.method==='Debugger.paused'){pauseResolve?.(response.params);return}
    const request = pending[response.id]
    if (!request) return
    delete pending[response.id]
    clearTimeout(request.timer)
    if (response.error) request.reject(new Error(JSON.stringify(response.error)))
    else request.resolve(response.result)
  })
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    if(method==='$paused'){pauseResolve=resolve;return}
    const id = ++commandId
    pending[id] = { resolve, reject, timer: setTimeout(() => { delete pending[id]; reject(new Error(`CDP ${method} deadline`)) }, 10000) }
    control.send(JSON.stringify({ id, method, params }))
  })
  const cdp = await browserCaptureCdp()
  const rawPath = path.join(owned.run, args.includes('--portable') ? 'portable/Data/UserData/config.json' : 'userdata/config.json')
  const readRaw = async () => JSON.parse(await fs.readFile(rawPath, 'utf8'))
  const storage = { constructor: await readRaw() }
  if(['portableExternal','portableMarkerFailure'].includes(path.basename(owned.run)))assert.equal(storage.constructor.downloadPath,path.join(owned.run,'home/external-media'),'External-to-portable download path changed')
  for (const [label, expression] of [
    ['single', "window.electron.ipcRenderer.invoke('settings.set', 'cookiesPath', '/synthetic/cookies')"],
    ['batch', "window.electron.ipcRenderer.invoke('settings.setAll', {configPath:'/synthetic/config',preferredAudioLanguage:'fr'})"]
  ]) {
    const result = await cdp.evaluate(expression)
    assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails))
    storage[label] = await readRaw()
  }
  try {
    const result = await cdp.evaluate(`(async () => {
      const invoke = (name, ...args) => window.electron.ipcRenderer.invoke(name, ...args)
      const initial = await invoke('settings.getAll')
      const individual = {}
      for (const key of Object.keys(initial)) individual[key] = await invoke('settings.get', key)
      const preload = { keys: Object.keys(window.api), groups: ['app','settings','window'].map(k => typeof window.api[k]),
        invalidFile: window.api.getPathForFile(new File(['fixture'], 'fixture.txt')) }
      let count = 0
      const eventTrace = []
      const eventReads = []
      const settlement = []
      const observer = window.api.on('settings:changed', (...args) => {
        const entry = { channel: 'settings:changed', args, phase }
        eventTrace.push(entry)
        settlement.push('event:' + phase)
        eventReads.push(invoke('settings.getAll').then(settings => { entry.visible = settings }))
      })
      let phase = 'batch'
      const callback = () => { count++ }
      const wrapper = window.api.on('settings:changed', callback)
      await invoke('settings.setAll', { launchAtLogin: false, hideDockIcon: false, language: 'en' })
      settlement.push('settled:batch')
      await new Promise(r => setTimeout(r, 50))
      const afterBatch = count
      phase = 'single'
      await invoke('settings.set', 'future.nested', { retained: ['synthetic', 7] })
      settlement.push('settled:single')
      await new Promise(r => setTimeout(r, 50))
      const afterSingle = count
      const persisted = await invoke('settings.getAll')
      window.api.removeListener('settings:changed', wrapper)
      phase = 'removed'
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
      const kernelEvents = []
      const kernelWrapper = window.api.on('ytdlp-kernel:status', (...args) => kernelEvents.push(args))
      const retry = await invoke('app.retryYtDlpKernelPreparation')
      window.api.removeListener('ytdlp-kernel:status', kernelWrapper)
      const kernel = kernelStatus
      const os = await invoke('app.getOsVersion')
      let invokeFailure
      try { await invoke('settings.setAll', null) } catch (error) { invokeFailure = error.message }
      const icon = await invoke('app.getSiteIcon', 'fixture.invalid')
      const windowState = { initial: await invoke('window.isMaximized') }
      await invoke('window.maximize')
      windowState.afterToggle = await invoke('window.isMaximized')
      await invoke('window.maximize')
      windowState.afterSecondToggle = await invoke('window.isMaximized')
      phase = 'reset'
      await invoke('settings.reset')
      settlement.push('settled:reset')
      await new Promise(r => setTimeout(r, 50))
      await Promise.all(eventReads)
      window.api.removeListener('settings:changed', observer)
      return { kernelEvents, retry, eventTrace, settlement, os, invokeFailure, icon, initial, individual, preload, persisted, events: { afterBatch, afterSingle, afterRemoval, afterReset: count },
        whatsNew, app, kernel, windowState, share, reset: await invoke('settings.getAll') }
    })()`)
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    const observations = result.result.value
    assert.equal(observations.os, `Linux ${os.release()}`, 'Unexpected OS-label transformation')
    observations.os = 'Linux <host-release>'
    await fs.writeFile(path.join(owned.run,'host-environment.json'),JSON.stringify({platform:os.platform(),release:os.release(),observed:`Linux ${os.release()}`}))
    observations.storage = storage
    if (secondInstance) observations.secondInstance = secondInstance
    if(path.basename(owned.run)==='fresh')observations.packagedEvents=await packagedEvents(owned,cdp,command)
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
          if (${route === '/settings' ? `Boolean(document.querySelector('[role="switch"]'))` : `[...document.querySelectorAll('h2')].some(node => node.textContent === 'VidBeep')`}) break
          await new Promise(r => setTimeout(r, 50))
        }
        return { route: location.hash, hasControls: document.querySelectorAll('button,input,select').length > 0,
          displayedText: document.body.innerText,
          hasExpectedText: document.body.innerText.includes(${JSON.stringify(route === '/settings' ? 'General' : 'VidBeep')}) }
      })()`)
      if (screen.exceptionDetails) throw new Error(JSON.stringify(screen.exceptionDetails))
      observations.screens.push(screen.result.value)
    }
    const controls = await cdp.evaluate(`(async () => {
      location.hash = '/settings'
      const wait = async predicate => { const until = Date.now() + 10000; while (!predicate()) { if (Date.now()>until) throw Error('control deadline'); await new Promise(r=>setTimeout(r,50)) } }
      await wait(() => document.querySelector('[role="switch"]'))
      const switches = [...document.querySelectorAll('[role="switch"]')]
      const target = switches.find(node => node.closest('[data-slot="item"]')?.innerText.includes('One-Click Download'))
      if (!target) throw Error('no enabled settings switch')
      const before = target.getAttribute('aria-checked')
      const context = target.closest('[data-slot="item"]').innerText
      target.click()
      await wait(() => target.getAttribute('aria-checked') !== before)
      const after = target.getAttribute('aria-checked')
      const settings = await window.electron.ipcRenderer.invoke('settings.getAll')
      return { before, after, context, settings }
    })()`)
    assert(!controls.exceptionDetails, JSON.stringify(controls.exceptionDetails))
    observations.controls = controls.result.value
    const reload = await cdp.evaluate('location.reload(); true')
    assert(!reload.exceptionDetails)
    await delay(1500)
    const reloaded = await cdp.evaluate(`(async () => {
      const until = Date.now()+10000
      while (!document.querySelector('[role="switch"]')) { if(Date.now()>until)throw Error('reload deadline');await new Promise(r=>setTimeout(r,50)) }
      const target = [...document.querySelectorAll('[role="switch"]')].find(node=>node.closest('[data-slot="item"]')?.innerText.includes('One-Click Download'))
      return { checked: target.getAttribute('aria-checked'), settings: await window.electron.ipcRenderer.invoke('settings.getAll') }
    })()`)
    assert(!reloaded.exceptionDetails, JSON.stringify(reloaded.exceptionDetails))
    observations.reloaded = reloaded.result.value
    assert.deepEqual(observations.controls.settings, observations.reloaded.settings)
    assert.equal(observations.controls.after, observations.reloaded.checked)
    if(path.basename(owned.run)==='fresh')observations.controlFamilies=await packagedControls(owned,cdp)
    let nativeWindowInspection
    try { nativeWindowInspection = await command('Browser.getWindowForTarget', { targetId: pages[0].id }) }
    catch (error) { nativeWindowInspection = { error: error.message } }
    await command('Page.bringToFront')
    const minimize = await cdp.evaluate(`(async () => {
      const focused = document.hasFocus()
      await window.electron.ipcRenderer.invoke('window.minimize')
      await new Promise(resolve => setTimeout(resolve, 50))
      return { focused, visibility: document.visibilityState, focusedAfter: document.hasFocus() }
    })()`)
    assert(!minimize.exceptionDetails)
    await command('Page.bringToFront')
    const close = await cdp.evaluate(`(async () => {
      window.focus()
      const focused = document.hasFocus()
      await window.electron.ipcRenderer.invoke('window.close')
      await new Promise(resolve => setTimeout(resolve, 50))
      return { focused, visibility: document.visibilityState, focusedAfter: document.hasFocus(), maximized: await window.electron.ipcRenderer.invoke('window.isMaximized') }
    })()`)
    assert(!close.exceptionDetails)
    observations.minimizeClose = { nativeWindowInspection, minimized: minimize.result.value, closed: close.result.value }
    if (args.includes('--quit')) {
      const scheduled = await cdp.evaluate(`setTimeout(() => { void window.electron.ipcRenderer.invoke('app.quit') }, 25); true`)
      assert(!scheduled.exceptionDetails)
      const deadline = Date.now() + 15000
      let exited = false
      while (Date.now() < deadline) {
        try { await fs.access(`/proc/${owned.appPid}`) } catch { exited = true; break }
        await delay(50)
      }
      assert(exited, 'Owned application did not complete controlled quit')
      observations.quit = { scheduled: true, exited }
    }
    await fs.writeFile(option('--output'), JSON.stringify(observations, null, 2))
  } finally { cdp.close(); control.close() }
  process.exit(0)
}

assert(args.includes('--build') && args.includes('--scratch') && args.includes('--sha256'), 'Require disk-backed lane --scratch and explicit --sha256')
const build = path.resolve(option('--build'))
const scratch = path.resolve(option('--scratch'))
const expectedHash = option('--sha256')
assert(!(args.includes('--record')&&option('--only-profile')),'Recording requires every profile')
assert.equal(process.version, `v${(await fs.readFile(path.join(here, '../../.node-version'), 'utf8')).trim()}`, 'Use pinned Node')
const expectedBuild = JSON.parse(await fs.readFile(path.join(here, 'build.expected.json'), 'utf8'))
assert(option('--manifest'), 'Require explicit --manifest for the selected build')
const { selected, verify: verifyManifest } = await admitBuild({ build, manifest: path.resolve(option('--manifest')), baseline: expectedBuild, recording: args.includes('--record'), sha256: expectedHash })
const timezone = process.env.TZ ?? 'UTC'
assert(['UTC', 'Asia/Tokyo'].includes(timezone), 'Use TZ=UTC or TZ=Asia/Tokyo for the packaged fixture')
const expected = path.join(here, timezone === 'Asia/Tokyo' ? 'packaged.tokyo.expected.json' : 'packaged.expected.json')
const verify = async () => {
  await verifyManifest()
  const hash = createHash('sha256').update(await fs.readFile(path.join(build, 'resources/app.asar'))).digest('hex')
  assert.equal(hash, expectedHash, 'Build changed before recording')
  assert.equal(createHash('sha256').update(await fs.readFile(path.join(build, 'vidbee'))).digest('hex'), selected.vidbee)
  return hash
}
await fs.mkdir(scratch, { recursive: true })
const host = Object.fromEntries(await Promise.all(['net', 'user', 'mnt'].map(async kind => [kind, await namespace('self', kind)])))
const work = await fs.mkdtemp(path.join(scratch, 'foundation-'))
let active
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  if (active && active.exitCode === null && active.signalCode === null) {
    const ended = new Promise((resolve) => active.once('close', resolve))
    const ownerPid=Number((await fs.readFile(path.join(active.ownedWork,'containment.pid'),'utf8')).trim())
    process.kill(ownerPid,'SIGTERM'); await ended
  }
  process.exit(1)
})
const observations = {}
const quote = (value) => String.fromCharCode(39) + value.replaceAll(String.fromCharCode(39), String.fromCharCode(39, 92, 39, 39)) + String.fromCharCode(39)
const inspectedBuild=path.join(work,'inspected-build');await fs.mkdir(inspectedBuild);await fs.symlink(path.join(build,'resources'),path.join(inspectedBuild,'resources'));await fs.writeFile(path.join(inspectedBuild,'vidbee'),`#!/bin/sh\nexec ${quote(path.join(build,'vidbee'))} --inspect=127.0.0.1:9231 \"$@\"\n`,{mode:0o755})
const backgroundBuild = path.join(work, 'background-build')
await fs.mkdir(backgroundBuild)
await fs.symlink(path.join(build, 'resources'), path.join(backgroundBuild, 'resources'))
const quotedBinary = quote(path.join(build, 'vidbee'))
await fs.writeFile(path.join(backgroundBuild, 'vidbee'), `#!/bin/sh\nexec ${quotedBinary} --inspect=127.0.0.1:9231 --background "$@"\n`, { mode: 0o755 })
for (const [name, config] of Object.entries({ emptyDocument: {}, invalidEmpty: '', invalidJson: '{', portableFresh: undefined, portableExternal: {downloadPath:'<external-media>'}, portableMarkerFailure: {downloadPath:'<external-media>'}, fresh: undefined, controlledQuit: undefined, singleInstance: undefined, background: undefined, returning: { language: 'fr', lastSeenWhatsNew: 'old',
  future: { keep: 9 }, extensionCookieSources: [{ id: 'fixture', browser: 'test', extra: 'keep' }] },
  restart: 'reuse',
  current: { language: 'en', lastSeenWhatsNew: 'ai-transcripts' },
  portable: { downloadPath: '/portable/old/media', theme: 42, launchAtLogin: true, future: { nested: [7, {keep:true}] }, asrTier: 'paraformer-zh', downloadMirror: 'invalid', transcriptionProvider: 'invalid' },
  malformedFields: { future: { nested: [7, {keep:true}] }, theme: 42, proxy: null, asrTier: 'invalid', agentManagementTools: 'legacy',
    ttsModelId: 'unknown-family-v1', downloadMirror: 'invalid', transcriptionProvider: 'invalid' } })) {
  if(option('--only-profile')&&option('--only-profile')!==name)continue
  await verify()
  const run = path.join(work, name)
  let seed = ''
  if (config === 'reuse') { seed = path.join(work, 'returning', 'userdata') }
  else if (config !== undefined) {
    seed = path.join(work, `${name}-seed`); await fs.mkdir(seed)
    await fs.writeFile(path.join(seed, 'config.json'), typeof config==='string'?config:JSON.stringify(config).replace('<external-media>',path.join(run,'home/external-media')))
  }
  const launchSetup = path.join(work, `${name}-launch.sh`)
  await fs.writeFile(launchSetup, `mount -o remount,bind,ro "$(readlink -f /etc/resolv.conf)"\nmount -o remount,bind,ro /etc/nsswitch.conf\nexport LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8\nunset VIDBEE_LANGUAGE\ncd ${quote(run)}\nexport TZ=${quote(process.env.TZ ?? 'UTC')}\n${name.startsWith('portable') ? `export VIDBEE_PORTABLE_DIR=${quote(path.join(run,'portable'))}\nmkdir -p \"$VIDBEE_PORTABLE_DIR/Data/UserData\"\nprintf '/portable/old' > \"$VIDBEE_PORTABLE_DIR/Data/.portable-root\"\nif [ -f ${quote(path.join(run,'userdata/config.json'))} ]; then cp ${quote(path.join(run,'userdata/config.json'))} \"$VIDBEE_PORTABLE_DIR/Data/UserData/config.json\"; fi\n${name==='portableMarkerFailure'?`rm \"$VIDBEE_PORTABLE_DIR/Data/.portable-root\"\nmkdir \"$VIDBEE_PORTABLE_DIR/Data/.portable-root\"\n`:''}` : ''}${name === 'singleInstance' ? 'unset VIDBEE_ALLOW_MULTIPLE_INSTANCES\n' : ''}`)
  const launcher = spawn('bwrap', containedLaunch(work, ['bash','-c','echo $$ > "$1/containment.pid"; shift; exec "$@"','contained',work,'bash', path.resolve(here, '../../apps/desktop/scripts/port/offline-launch.sh'), name === 'background' ? backgroundBuild : inspectedBuild, run, '180', seed, '', launchSetup]),
    { cwd: scratch, stdio: ['ignore', 'ignore', 'pipe'] })
  launcher.ownedWork=work
  active = launcher
  let stderr = ''; launcher.stderr.on('data', (data) => { stderr += data })
  try {
    if(name.startsWith('invalid')) {
      let log='';const deadline=Date.now()+30000
      while(Date.now()<deadline){try{log=await fs.readFile(path.join(run,'stdout.log'),'utf8')}catch{};if(log.includes('SyntaxError')||log.includes('Unexpected end of JSON')||log.includes('JSON'))break;if(launcher.exitCode!==null)break;await delay(100)}
      assert.match(log,/SyntaxError|JSON/,'Missing malformed startup failure')
      assert.equal(await fs.readFile(path.join(run,'userdata/config.json'),'utf8'),config,'Startup damaged invalid settings bytes')
      const failedBeforeReadiness=await fs.access(path.join(run,'mcp.json')).then(()=>false,()=>true)
      assert(failedBeforeReadiness,'Malformed settings unexpectedly reached MCP readiness')
      observations[name]={failedBeforeReadiness,retainedBytes:config,configExists:true,syntaxFailure:/SyntaxError|JSON/.test(log)}
      await verify();continue
    }
    const deadline = Date.now() + 90_000
    let pid
    while (Date.now() < deadline) {
      if (launcher.exitCode !== null) throw new Error(`Offline launcher exited ${launcher.exitCode}: ${stderr}`)
      try { await fs.access(path.join(run, 'mcp.json')); pid = (await fs.readFile(path.join(run, 'namespace.pid'), 'utf8')).trim(); break }
      catch { await delay(100) }
    }
    assert(pid, `Readiness deadline: ${stderr}`)
    const identity = randomUUID()
    const appPid = (await fs.readFile(path.join(run, 'app.pid'), 'utf8')).trim()
    const owned = Object.fromEntries(await Promise.all(['net', 'user', 'mnt'].map(async kind => [kind, await namespace(pid, kind)])))
    for (const kind of ['net','user','mnt']) assert.notEqual(owned[kind], host[kind], 'Parent failed to create isolated namespace')
    let lane = scratch
    while (true) {
      try { await fs.access(path.join(lane, 'BRIEF.md')); break } catch {}
      const parent = path.dirname(lane)
      assert.notEqual(parent, lane, 'Require scratch under a lane with BRIEF.md')
      lane = parent
    }
    await fs.writeFile(path.join(run, 'identity.json'), JSON.stringify({ identity, run: await fs.realpath(run), lane,
      host, owned, parentPid: process.pid, namespacePid: pid, appPid, build, asar: expectedHash,
      manifest: selected, executable: createHash('sha256').update(await fs.readFile(path.join(build, 'vidbee'))).digest('hex') }), { mode: 0o600 })
    const output = path.join(work, `${name}.json`)
    const result = await capture('nsenter', ['-t', pid, '-U', '-n', '-m', '--preserve-credentials', process.execPath,
      fileURLToPath(import.meta.url), '--worker', '--output', output, '--run', run, '--identity', identity, ...(name.startsWith('portable') ? ['--portable'] : []), ...(name === 'controlledQuit' ? ['--quit'] : []),
      ...(name === 'singleInstance' ? ['--second-instance', '--build', build, '--sha256', expectedHash] : [])], { timeoutMs: 100_000 })
    assert.equal(result.code, 0, result.stderr)
    await verify()
    const raw = JSON.parse(await fs.readFile(output, 'utf8'))
    // Only the exact throwaway HOME/download root varies. No generic string/clock/error filtering.
    let normalized = JSON.stringify(raw).split(path.join(run, 'home')).join('<home>').split(path.join(run, 'portable')).join('<portable>')
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
    await fs.writeFile(path.join(work, `${name}-stored.json`), await fs.readFile(path.join(run, name.startsWith('portable') ? 'portable/Data/UserData/config.json' : 'userdata/config.json')))
  } finally {
    if (launcher.exitCode === null) {
      const ended = new Promise((resolve) => launcher.once('close', resolve))
      const ownerPid=Number((await fs.readFile(path.join(work,'containment.pid'),'utf8')).trim())
      process.kill(ownerPid,'SIGTERM'); await ended
    }
    active = undefined
  }
}
await fs.writeFile(path.join(work, 'build.json'), JSON.stringify({ appAsarSha256: await verify(), build, node: process.version, timezone: process.env.TZ ?? 'UTC' }))
await fs.writeFile(path.join(work, 'actual.json'), JSON.stringify(observations, null, 2))
if (args.includes('--record')) await fs.writeFile(expected, JSON.stringify(observations, null, 2) + '\n')
else {const oracle=JSON.parse(await fs.readFile(expected,'utf8'));assert.deepEqual(observations,option('--only-profile')?{[option('--only-profile')]:oracle[option('--only-profile')]}:oracle)}
process.stdout.write(`Packaged foundation: ${Object.keys(observations).length} profiles passed; evidence ${work}\n`)
