import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { capture } from './capture.mjs'
import { connectCdp, countsExpression, instrument, until } from './extension-browser-cdp.mjs'
import { normalizeBrowserObservation } from './extension-browser-recordings.mjs'
import { startLoopback } from './loopback.mjs'

export const SKIP_LOAD =
  'SKIP extension browser proof: no available Chromium loads the unpacked extension'
export const SKIP_POPUP =
  'SKIP extension browser proof: available Chromium cannot open the extension action popup'
export const extensionIdentity = (key) =>
  [...createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32)]
    .map((char) => String.fromCharCode(97 + Number.parseInt(char, 16)))
    .join('')

const json = async (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`)
export async function runExtensionBrowser({
  runDir,
  extension,
  label = 'new',
  scenarios = true,
  fixtureServer,
  normalizationRoots = []
}) {
  // Defense in depth: this worker must never run against the host's desktop ports.
  const interfaces = await capture('/usr/bin/ip', ['-j', 'address'])
  const network = JSON.parse(interfaces.stdout)
  assert.ok(
    network.length > 0 && network.every((value) => value.ifname === 'lo'),
    'Requires offline loopback-only namespace'
  )
  const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8'))
  const identity = extensionIdentity(manifest.key)
  assert.equal(identity, 'kpelcaehdkgleenlldpipjpoopnacehk')
  const directory = path.join(runDir, 'extension-browser', label)
  await mkdir(directory, { recursive: true })
  const server = fixtureServer ?? (await startLoopback(runDir, { phase8: true }))
  const candidates = process.env.VIDBEE_EXTENSION_CHROMIUM
    ? [process.env.VIDBEE_EXTENSION_CHROMIUM]
    : ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']
  const attempts = []
  let loaded = false
  try {
    for (const executable of candidates) {
      try {
        await access(executable, 1)
      } catch {
        continue
      }
      const owned = path.join(directory, `candidate-${attempts.length}`)
      const home = path.join(owned, 'home')
      const profile = path.join(owned, 'profile')
      await mkdir(home, { recursive: true })
      const env = {
        PATH: '/usr/bin:/bin',
        HOME: home,
        TMPDIR: (await readFile(path.join(runDir, 'tmp-root'), 'utf8')).trim(),
        XDG_CONFIG_HOME: path.join(home, 'config'),
        XDG_DATA_HOME: path.join(home, 'data'),
        XDG_CACHE_HOME: path.join(home, 'cache'),
        XDG_DATA_DIRS: path.join(home, 'system-data'),
        XDG_CONFIG_DIRS: path.join(home, 'system-config'),
        XDG_RUNTIME_DIR: path.join(home, 'runtime'),
        LANG: 'en_US.UTF-8'
      }
      // Handler discovery is a read-only query in isolated directories. Never invoke it.
      const handler = await capture(
        '/usr/bin/xdg-mime',
        ['query', 'default', 'x-scheme-handler/vidbee'],
        { env }
      )
      assert.equal(handler.code, 0, 'Handler-discovery query failed')
      assert.equal(handler.stdout.trim(), '', 'Isolated environment discovers a vidbee handler')
      const version = await capture(executable, ['--version'], { env })
      let display
      try {
        await access('/usr/bin/Xvfb', 1)
        display = spawn(
          '/usr/bin/Xvfb',
          ['-displayfd', '1', '-screen', '0', '1280x800x24', '-ac', '-nolisten', 'tcp'],
          { env, stdio: ['ignore', 'pipe', 'pipe'] }
        )
        let number = ''
        display.stdout.on('data', (value) => {
          number += value
        })
        display.stderr.resume()
        env.DISPLAY = `:${(await until(() => number.includes('\n') && number.trim(), 'owned Xvfb')).trim()}`
      } catch (error) {
        if (display) {
          display.kill()
          throw error
        }
      }
      const flags = [
        '--no-sandbox',
        ...(env.DISPLAY ? ['--ozone-platform=x11'] : ['--headless=new']),
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-sync',
        '--disable-default-apps',
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
        `--user-data-dir=${profile}`,
        '--remote-debugging-port=0',
        'about:blank'
      ]
      const child = spawn(executable, flags, {
        env,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })
      const output = []
      const requests = []
      const errors = []
      const trace = []
      child.stdout.on('data', (chunk) => output.push(chunk))
      child.stderr.on('data', (chunk) => output.push(chunk))
      let cdp
      let capabilityPassed = false
      const receipt = {
        executable,
        version: version.stdout.trim(),
        identity,
        unpackedLoad: false,
        openPopup: false,
        api: 'chrome.action.openPopup({ windowId })',
        handler,
        flags,
        network
      }
      attempts.push(receipt)
      try {
        const endpoint = await until(
          async () => {
            if (child.exitCode !== null || child.signalCode !== null) {
              throw new Error('Chromium exited before CDP ready')
            }
            try {
              const [port, route] = (
                await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')
              )
                .trim()
                .split('\n')
              return `ws://127.0.0.1:${port}${route}`
            } catch {
              return false
            }
          },
          'Chromium CDP',
          20_000
        )
        receipt.stage = 'CDP connected'
        await json(path.join(directory, 'capability.json'), attempts)
        cdp = await connectCdp(endpoint, (event) => trace.push(event))
        const sessions = new Map()
        const wireExtras = new Map()
        const pending = new Set()
        const attach = async ({ sessionId, targetInfo }) => {
          sessions.set(targetInfo.targetId, { sessionId, ...targetInfo })
          if (targetInfo.url.startsWith(`chrome-extension://${identity}/`)) {
            await cdp.send('Runtime.enable', {}, sessionId)
            await cdp.send('Network.enable', {}, sessionId)
          }
          if (targetInfo.type === 'page' || targetInfo.type === 'other') {
            // New page targets initially have an empty URL. Install before any extension JS.
            await cdp.send('Page.enable', {}, sessionId)
            await cdp.send(
              'Page.addScriptToEvaluateOnNewDocument',
              { source: instrument },
              sessionId
            )
            await cdp.send('Network.enable', {}, sessionId)
          }
          await cdp.send('Runtime.runIfWaitingForDebugger', {}, sessionId)
        }
        const observe = cdp.on((message) => {
          const params = message.params ?? {}
          if (message.method === 'Target.attachedToTarget') {
            const work = attach(params)
              .catch(async (error) => {
                errors.push(String(error))
                try {
                  await cdp.send('Runtime.runIfWaitingForDebugger', {}, params.sessionId)
                } catch (resumeError) {
                  errors.push(String(resumeError))
                }
              })
              .finally(() => pending.delete(work))
            pending.add(work)
          }
          if (message.method === 'Target.detachedFromTarget') {
            for (const [id, target] of sessions) {
              if (target.sessionId === params.sessionId) {
                sessions.delete(id)
              }
            }
          }
          if (
            message.method === 'Network.requestWillBeSent' &&
            params.request.url.startsWith('http://127.0.0.1:27')
          ) {
            requests.push({
              session: message.sessionId,
              requestId: params.requestId,
              request: params.request,
              initiator: params.initiator,
              wireHeaders: wireExtras.get(`${message.sessionId}:${params.requestId}`)
            })
          }
          if (message.method === 'Network.requestWillBeSentExtraInfo') {
            wireExtras.set(`${message.sessionId}:${params.requestId}`, params.headers)
            const request = requests.findLast(
              (value) => value.requestId === params.requestId && value.session === message.sessionId
            )
            if (request) {
              request.wireHeaders = params.headers
            }
          }
          if (message.method === 'Network.responseReceived') {
            const request = requests.findLast(
              (value) => value.requestId === params.requestId && value.session === message.sessionId
            )
            if (request) {
              request.response = params.response
            }
          }
          if (message.method === 'Network.loadingFinished') {
            const request = requests.findLast(
              (value) => value.requestId === params.requestId && value.session === message.sessionId
            )
            if (request) {
              const work = cdp
                .send('Network.getResponseBody', { requestId: params.requestId }, message.sessionId)
                .then((body) => {
                  request.body = body
                })
                .catch((error) => {
                  request.bodyError = String(error)
                })
                .finally(() => pending.delete(work))
              pending.add(work)
            }
          }
          if (message.method === 'Runtime.exceptionThrown') {
            errors.push(params.exceptionDetails)
          }
        })
        await cdp.send('Target.setDiscoverTargets', { discover: true })
        await cdp.send('Target.setAutoAttach', {
          autoAttach: true,
          waitForDebuggerOnStart: true,
          flatten: true,
          filter: [{ type: 'page' }, { type: 'other' }, { exclude: true }]
        })
        receipt.stage = 'finding worker'
        await json(path.join(directory, 'capability.json'), attempts)
        let worker = await until(
          async () => {
            const targets = (await cdp.send('Target.getTargets')).targetInfos
            const target = targets.find(
              (value) =>
                value.type === 'service_worker' &&
                value.url.startsWith(`chrome-extension://${identity}/`)
            )
            if (!target) {
              return false
            }
            await Promise.all([...pending])
            if (!sessions.has(target.targetId)) {
              await cdp.send('Target.attachToTarget', {
                targetId: target.targetId,
                flatten: true
              })
              await Promise.all([...pending])
            }
            return sessions.get(target.targetId)
          },
          'unpacked extension worker',
          12_000
        )
        const sid = () => sessions.get(worker.targetId)?.sessionId ?? worker.sessionId
        receipt.stage = 'worker context'
        await json(path.join(directory, 'capability.json'), attempts)
        await until(
          () => cdp.evaluate(sid(), "typeof chrome !== 'undefined' && chrome.runtime?.id"),
          'worker extension bindings',
          5000
        )
        assert.equal(await cdp.evaluate(sid(), 'chrome.runtime.id'), identity)
        await cdp.evaluate(sid(), instrument)
        receipt.unpackedLoad = true
        loaded = true
        receipt.browser = await cdp.send('Browser.getVersion')
        let fixture = `${server.url}/phase8/page.html`
        const window = await cdp.evaluate(
          sid(),
          `chrome.windows.create({url:${JSON.stringify(fixture)}, focused:true, type:'normal'})`
        )
        receipt.windowId = window.id
        const open = async () => {
          await cdp.evaluate(sid(), `chrome.windows.update(${window.id},{focused:true})`)
          await cdp.evaluate(sid(), `chrome.action.openPopup({windowId:${window.id}})`)
          return until(
            async () => {
              const targets = (await cdp.send('Target.getTargets')).targetInfos
              const popup = targets.find(
                (value) =>
                  value.url === `chrome-extension://${identity}/${manifest.action.default_popup}`
              )
              return popup && sessions.get(popup.targetId)
            },
            'actual action popup',
            10_000
          )
        }
        receipt.stage = 'opening action popup'
        await json(path.join(directory, 'capability.json'), attempts)
        let popup = await open()
        receipt.popupTarget = popup
        receipt.openPopup = true
        capabilityPassed = true
        await json(path.join(directory, 'capability.json'), attempts)
        if (!scenarios) {
          return { status: 'capable', attempts }
        }
        const recordings = []
        const closePopup = async () => {
          if (popup) {
            const closed = popup.targetId
            await cdp.send('Target.closeTarget', { targetId: closed })
            await until(
              async () =>
                !(await cdp.send('Target.getTargets')).targetInfos.some(
                  (value) => value.targetId === closed
                ),
              'popup target destruction'
            )
          }
          popup = undefined
        }
        const storage = () => cdp.evaluate(sid(), 'chrome.storage.local.get(null)')
        const query = async () => {
          const queries = await until(
            () =>
              cdp.evaluate(
                popup.sessionId,
                'globalThis.__extensionProof?.queries.length ? __extensionProof.queries : null'
              ),
            'popup own tabs.query'
          )
          assert.deepEqual(queries[0].input, { active: true, currentWindow: true })
          assert.equal(queries[0].result[0]?.url, fixture, 'Popup must select actual fixture tab')
          return queries
        }
        const snapshot = async (name) => {
          const screenshot = await cdp.send(
            'Page.captureScreenshot',
            { format: 'png' },
            popup.sessionId
          )
          await writeFile(
            path.join(directory, `${name}.png`),
            Buffer.from(screenshot.data, 'base64')
          )
          const value = {
            name,
            screenshotSha256: createHash('sha256')
              .update(Buffer.from(screenshot.data, 'base64'))
              .digest('hex'),
            storage: await storage(),
            queries: await query(),
            dom: await cdp.evaluate(popup.sessionId, 'document.body.outerHTML'),
            layout: await cdp.evaluate(
              popup.sessionId,
              '({width:innerWidth, scrollWidth:document.documentElement.scrollWidth, color:matchMedia("(prefers-color-scheme: dark)").matches, reducedMotion:matchMedia("(prefers-reduced-motion: reduce)").matches})'
            ),
            accessibility: await cdp.send('Accessibility.getFullAXTree', {}, popup.sessionId),
            workerCounts: await cdp.evaluate(sid(), countsExpression),
            popupCounts: await cdp.evaluate(popup.sessionId, countsExpression),
            icons: await cdp.evaluate(sid(), '__extensionProof.icons'),
            requests: structuredClone(requests),
            errors: structuredClone(errors)
          }
          recordings.push(value)
          await json(path.join(directory, 'recordings.json'), recordings)
          await json(
            path.join(directory, 'normalized.json'),
            recordings.map((value) =>
              normalizeBrowserObservation(value, [
                [runDir, '<run>'],
                [extension, '<extension>'],
                ...normalizationRoots
              ])
            )
          )
          return value
        }
        const ready = async (status) =>
          until(
            async () => {
              const data = await storage()
              return data.videoInfoCacheByUrl?.[fixture]?.status === status
            },
            `stored ${status}`,
            90_000
          )
        // The capability popup may already have started work. Start the observed scenario afresh.
        await ready('ready')
        await closePopup()
        await cdp.evaluate(sid(), 'chrome.storage.local.clear()')
        popup = await open()
        await query()
        await ready('ready')
        await until(
          () =>
            cdp.evaluate(
              popup.sessionId,
              'document.body.innerText.includes("Download with VidBeep")'
            ),
          'rendered ready formats'
        )
        await until(
          () =>
            cdp.evaluate(
              popup.sessionId,
              'document.querySelectorAll(".format-table tbody tr").length > 0 && document.body.innerText.includes("180p")'
            ),
          'actual rendered format rows'
        )
        await Promise.all([...pending])
        const tokenRequest = requests.findLast(
          (value) => new URL(value.request.url).pathname === '/token'
        )
        assert.ok(tokenRequest, 'Missing real token exchange')
        assert.equal(tokenRequest.request.method, 'POST')
        assert.equal(tokenRequest.request.postData, undefined, 'Token request must be bodyless')
        const wire = Object.fromEntries(
          Object.entries(tokenRequest.wireHeaders ?? {}).map(([key, value]) => [
            key.toLowerCase(),
            value
          ])
        )
        assert.equal(wire.origin, `chrome-extension://${identity}`)
        assert.equal(wire['x-vidbee-extension'], `chrome-extension://${identity}`)
        await snapshot('metadata-success')
        const requestCount = requests.length
        await closePopup()
        popup = await open()
        await query()
        await until(
          () =>
            cdp.evaluate(
              popup.sessionId,
              'document.body.innerText.includes("Download with VidBeep")'
            ),
          'cache reopen'
        )
        assert.equal(requests.length, requestCount, 'Cache reopen made API requests')
        await snapshot('cache-reopen')
        for (const color of ['light', 'dark']) {
          await cdp.send(
            'Emulation.setEmulatedMedia',
            {
              features: [
                { name: 'prefers-color-scheme', value: color },
                { name: 'prefers-reduced-motion', value: 'reduce' }
              ]
            },
            popup.sessionId
          )
          const value = await snapshot(`layout-${color}`)
          assert.equal(value.layout.width, 360)
          assert.ok(value.layout.scrollWidth <= 360, 'Popup overflows 360px')
        }
        const focus = []
        for (let step = 0; step < 8; step++) {
          await cdp.send(
            'Input.dispatchKeyEvent',
            { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
            popup.sessionId
          )
          await cdp.send(
            'Input.dispatchKeyEvent',
            { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
            popup.sessionId
          )
          focus.push(
            await cdp.evaluate(
              popup.sessionId,
              '({tag:document.activeElement.tagName,text:document.activeElement.textContent,href:document.activeElement.getAttribute("href")})'
            )
          )
        }
        await json(path.join(directory, 'keyboard.json'), focus)
        // Real deterministic failure returned by the packaged desktop's metadata route.
        await closePopup()
        fixture = `${server.url}/404-phase8.mp4`
        await cdp.evaluate(
          sid(),
          `chrome.tabs.update(${window.tabs[0].id},{url:${JSON.stringify(fixture)}})`
        )
        await cdp.evaluate(sid(), 'chrome.storage.local.clear()')
        popup = await open()
        await query()
        await ready('error')
        await snapshot('metadata-failure')
        assert.ok(
          requests.some((value) => value.response?.status === 500),
          'Missing packaged metadata failure response'
        )
        await closePopup()
        fixture = `${server.url}/phase8/page.html`
        await cdp.evaluate(
          sid(),
          `chrome.tabs.update(${window.tabs[0].id},{url:${JSON.stringify(fixture)}})`
        )
        await cdp.evaluate(sid(), 'chrome.storage.local.clear()')
        await cdp.send('Network.setBlockedURLs', { urls: ['http://127.0.0.1:27*/*'] }, sid())
        try {
          popup = await open()
          await query()
          await ready('error')
          await snapshot('connection-failure')
        } finally {
          await cdp.send('Network.setBlockedURLs', { urls: [] }, sid())
        }
        // Error/retry is seeded using the real worker storage API, and Retry is the only clicked control.
        await closePopup()
        await cdp.evaluate(
          sid(),
          `chrome.storage.local.set({videoInfoCacheByUrl:{[${JSON.stringify(fixture)}]:{url:${JSON.stringify(fixture)},status:'error',fetchedAt:Date.now(),error:'Synthetic recoverable error'}}})`
        )
        popup = await open()
        await until(
          () =>
            cdp.evaluate(
              popup.sessionId,
              'document.body.innerText.includes("Synthetic recoverable error")'
            ),
          'stored error rendered'
        )
        await snapshot('stored-error')
        await cdp.evaluate(
          popup.sessionId,
          `(() => { const button = [...document.querySelectorAll('button')].find(value => value.textContent.trim() === 'Retry'); if (!button) throw Error('Retry absent'); button.click(); })()`
        )
        await ready('ready')
        await until(
          () =>
            cdp.evaluate(
              popup.sessionId,
              'document.body.innerText.includes("Download with VidBeep")'
            ),
          'retry recovered render'
        )
        await snapshot('retry-recovery')
        for (const [rootName, root] of [
          ['null', null],
          ['false', false],
          ['zero', 0],
          ['empty-string', ''],
          ['number', 1],
          ['true', true],
          ['string', 'x'],
          ['array', []],
          ['null-array', [null]]
        ]) {
          await closePopup()
          await cdp.evaluate(
            sid(),
            `chrome.storage.local.set({videoInfoCacheByUrl:${JSON.stringify(root)}})`
          )
          const serialized = await storage()
          popup = await open()
          await query()
          // Bounded observation window; malformed roots deliberately need not settle to ready.
          await new Promise((resolve) => setTimeout(resolve, 500))
          const value = await snapshot(`root-${rootName}`)
          value.seed = root
          value.serializedBeforePopup = serialized
          await json(path.join(directory, 'recordings.json'), recordings)
        }
        await closePopup()
        await cdp.evaluate(sid(), 'chrome.storage.local.clear()')
        popup = await open()
        await ready('ready')
        const before = await cdp.evaluate(sid(), countsExpression)
        await closePopup()
        const after = await cdp.evaluate(sid(), countsExpression)
        await json(path.join(directory, 'cleanup.json'), {
          before,
          after,
          targets: (await cdp.send('Target.getTargets')).targetInfos
        })
        recordings.push({ name: 'keyboard', focus })
        recordings.push({ name: 'document-worker-cleanup', before, after })
        const fixtureTarget = [...sessions.values()].find(
          (value) => value.type === 'page' && value.url === fixture
        )
        const pageTarget = (await cdp.send('Target.getTargets')).targetInfos.find(
          (value) => value.type === 'page' && value.url === fixture
        )
        const pageSession =
          fixtureTarget?.sessionId ??
          (
            await cdp.send('Target.attachToTarget', {
              targetId: pageTarget.targetId,
              flatten: true
            })
          ).sessionId
        await cdp.send('ServiceWorker.enable', {}, pageSession)
        await cdp.evaluate(sid(), 'globalThis.__extensionProofBeforeRestart = true')
        const closedWorker = await cdp.send('Target.closeTarget', { targetId: worker.targetId })
        assert.equal(closedWorker.success, true, 'Worker termination must succeed')
        await cdp.send(
          'ServiceWorker.startWorker',
          { scopeURL: `chrome-extension://${identity}/` },
          pageSession
        )
        const restarted = await until(async () => {
          const targets = (await cdp.send('Target.getTargets')).targetInfos
          return targets.find(
            (value) =>
              value.type === 'service_worker' &&
              value.url.startsWith(`chrome-extension://${identity}/`)
          )
        }, 'worker restart')
        await Promise.all([...pending])
        if (!sessions.has(restarted.targetId)) {
          await cdp.send('Target.attachToTarget', {
            targetId: restarted.targetId,
            flatten: true
          })
          await Promise.all([...pending])
        }
        worker = sessions.get(restarted.targetId)
        assert.ok(worker, 'Restarted worker session missing')
        assert.equal(await cdp.evaluate(sid(), 'chrome.runtime.id'), identity)
        assert.equal(
          await cdp.evaluate(sid(), 'globalThis.__extensionProofBeforeRestart === undefined'),
          true,
          'Worker global must be recreated'
        )
        await cdp.evaluate(sid(), instrument)
        popup = await open()
        await query()
        await ready('ready')
        await until(
          () =>
            cdp.evaluate(
              popup.sessionId,
              'document.body.innerText.includes("Download with VidBeep")'
            ),
          'restarted cache render'
        )
        await snapshot('worker-restart')
        const restartCounts = await cdp.evaluate(sid(), countsExpression)
        await json(path.join(directory, 'restart-listeners.json'), restartCounts)
        assert.equal(
          await cdp.evaluate(sid(), 'chrome.runtime.onMessage.hasListeners()'),
          true,
          'Restarted worker must register message listener'
        )
        await closePopup()
        await json(path.join(directory, 'recordings.json'), recordings)
        await Promise.all([...pending])
        // Runtime errors from malformed roots are part of the old/new evidence.
        observe()
        return {
          status: 'passed',
          attempts,
          recordings: recordings.map((value) =>
            normalizeBrowserObservation(value, [
              [runDir, '<run>'],
              [extension, '<extension>'],
              ...normalizationRoots
            ])
          )
        }
      } catch (error) {
        receipt.error = String(error)
        await json(path.join(directory, 'capability.json'), attempts)
        const missingLoad = /unpacked extension worker|Chromium exited before CDP ready/.test(
          String(error)
        )
        const missingPopup =
          receipt.unpackedLoad &&
          /actual action popup|Cannot show popup|openPopup.*not a function|not supported/.test(
            String(error)
          )
        if (capabilityPassed || !(missingLoad || missingPopup)) {
          throw error
        }
      } finally {
        if (cdp) {
          await cdp.send('Browser.close').catch(() => {})
          cdp.close()
        }
        if (child.exitCode === null && child.signalCode === null) {
          // This process group was created here with this exact scratch profile.
          try {
            process.kill(-child.pid, 'SIGTERM')
          } catch {
            /* owned process already ended */
          }
          await until(
            () => child.exitCode !== null || child.signalCode !== null,
            'owned Chromium cleanup',
            10_000
          )
        }
        if (display && display.exitCode === null && display.signalCode === null) {
          display.kill('SIGTERM')
          await until(
            () => display.exitCode !== null || display.signalCode !== null,
            'owned Xvfb cleanup'
          )
        }
        await json(path.join(directory, 'cdp-trace.json'), trace)
        await json(path.join(directory, 'raw-requests.json'), requests)
        await json(path.join(directory, 'raw-errors.json'), errors)
        await writeFile(path.join(owned, 'chromium.log'), Buffer.concat(output))
      }
    }
    const skip = loaded ? SKIP_POPUP : SKIP_LOAD
    await json(path.join(directory, 'capability.json'), attempts)
    process.stdout.write(`${skip}\n`)
    return { status: 'skipped', skip, attempts }
  } finally {
    if (!fixtureServer) {
      await server.close()
    }
  }
}
