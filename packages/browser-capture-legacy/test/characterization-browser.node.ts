import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { NODE } from './fixtures/node-runtime.js'
import { offline, REAL_BROWSER_SKIP } from './fixtures/real-browser.js'

// Browser-process, timer and media work receives over ten times its local runtime budget.
test('public sidecar real headed Chromium loopback playback and serialized quality programs', { timeout: 240000, skip: REAL_BROWSER_SKIP }, () => {
  const directory = mkdtempSync(join('/tmp', 'vbc-'))
  try {
    const output = join(directory, 'capture.mp4'); const job = join(directory, 'job.json')
    writeFileSync(job, JSON.stringify({ url: 'http://127.0.0.1/fixture', outputPath: output, ffmpegPath: '/usr/bin/ffmpeg', browserExecutable: '/usr/bin/chromium', width: 1024, height: 1024, durationHintSec: 8 }))
    const program = `process.argv=['node','sidecar','--job',${JSON.stringify(job)}];await import('@vidbee/browser-capture-legacy/sidecar')`
    const result = spawnSync(...offline(NODE, ['--import', 'tsx', '--import', new URL('./fixtures/real-browser-driver.mjs', import.meta.url).href, '--input-type=module', '-e', program]), { encoding: 'utf8', timeout: 180000, env: { ...process.env, TMPDIR: directory, HOME: directory, XDG_CONFIG_HOME: directory, XDG_CACHE_HOME: directory } })
    assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stdout + result.stderr)
    const events = result.stdout.trim().split('\n').filter((line) => line.startsWith('__VIDBEE_CAPTURE__')).map((line) => JSON.parse(line.slice('__VIDBEE_CAPTURE__'.length)))
    assert.equal(events[0].type, 'spawn')
    assert.ok(events.some((event) => event.type === 'log' && event.message === 'ffmpeg x11grab started'))
    assert.ok(events.some((event) => event.type === 'progress' && event.currentTime > 0 && event.duration === 8))
    const last = events.at(-1); assert.deepEqual(last, { type: 'done', filePath: output, size: statSync(output).size, durationMs: 8000 })
    const probe = spawnSync('/usr/bin/ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height,codec_type', '-of', 'json', output], { encoding: 'utf8', timeout: 30000 })
    assert.equal(probe.status, 0); assert.deepEqual(JSON.parse(probe.stdout).streams, [{ codec_name: 'h264', codec_type: 'video', width: 960, height: 720 }])
    const decode = spawnSync('/usr/bin/ffmpeg', ['-v', 'error', '-i', output, '-f', 'null', '-'], { encoding: 'utf8', timeout: 30000 }); assert.equal(decode.status, 0, decode.stderr)
    assert.equal(readFileSync(job, 'utf8').includes('userDataDir'), false)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
