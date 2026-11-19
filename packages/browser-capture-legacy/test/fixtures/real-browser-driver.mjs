import assert from 'node:assert/strict'
// This preload routes every browser request; only the numeric loopback fixture is fulfilled.
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
const spawnSync = childProcess.spawnSync
// Avoid the owner's Pulse server: this fixture deliberately records video only.
childProcess.spawnSync = (command, args, options) => command === 'which' && args[0] === 'pactl' ? { stdout: '', status: 1 } : spawnSync(command, args, options)
syncBuiltinESMExports()
const launch = chromium.launch.bind(chromium)
const video = readFileSync(new URL('./playback.mp4', import.meta.url))
const html = `<!doctype html><style>html,body{margin:0;background:black}</style><video autoplay muted playsinline src="http://127.0.0.1/fixture.mp4"></video><script>
window.hls={levels:[{width:80,height:60,bitrate:1},{width:160,height:120,bitrate:2}],config:{},currentLevel:-1};
document.querySelector('video').hls=window.hls;
</script>`
chromium.launch = async (options) => {
  assert.equal(options.env.DBUS_SESSION_BUS_ADDRESS, 'disabled:')
  assert.equal(options.env.XDG_RUNTIME_DIR, `${process.env.HOME}/runtime`)
  assert.equal(options.env.PULSE_SERVER, `unix:${process.env.HOME}/runtime/no-pulse`)
  const version = spawnSync('/usr/bin/chromium', ['--version'], { encoding: 'utf8' }).stdout.trim()
  const expectedVersion = JSON.parse(readFileSync(new URL('./audit-chromium-version.json', import.meta.url), 'utf8'))
  assert.equal(version, expectedVersion, `Chromium changed from ${expectedVersion} to ${version}; re-characterize layout before accepting the fixture`)
  const browser = await launch(options)
  const newContext = browser.newContext.bind(browser)
  browser.newContext = async (contextOptions) => {
    const context = await newContext(contextOptions)
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url())
      if (url.hostname !== '127.0.0.1') { await route.abort(); return }
      if (url.pathname === '/fixture.mp4') await route.fulfill({ status: 200, contentType: 'video/mp4', body: video })
      else await route.fulfill({ status: 200, contentType: 'text/html', body: html })
    })
    return context
  }
  return browser
}
