import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { NODE } from './fixtures/node-runtime.js'

for (const scenario of ['seed', 'persistent', 'unreadable', 'SIGINT', 'SIGTERM']) test(`audit sidecar cookies, persistent seeding and termination: ${scenario}`, { timeout: 60000 }, () => {
  const root = mkdtempSync(join(tmpdir(), 'vidbee-audit-sidecar-'))
  try {
    const cookiesPath = join(root, 'cookies.txt')
    if (scenario !== 'unreadable') writeFileSync(cookiesPath, [1699999999, 1700000000, 1700000001, 0, -5].map((expires, index) => `${index === 2 ? '#HttpOnly_' : ''}.fixture.invalid\tTRUE\t/\tTRUE\t${expires}\tc${index}\tv${index}`).join('\n'))
    const job = join(root, 'job.json')
    writeFileSync(job, JSON.stringify({ url: 'https://fixture.invalid/video', outputPath: '/fixture/output.mp4', ffmpegPath: '/fixture/ffmpeg', browserExecutable: '/fixture/chromium', width: 4, height: 4, cookiesPath, localStorage: { a: '1' }, ...(scenario === 'persistent' ? { userDataDir: '/fixture/session' } : {}) }))
    const program = `process.argv=['node','sidecar','--job',${JSON.stringify(job)}];await import('@vidbee/browser-capture-legacy/sidecar')`
    const result = spawnSync(NODE, ['--import', 'tsx', '--import', new URL('./fixtures/audit-sidecar-driver.mjs', import.meta.url).href, '--input-type=module', '-e', program], { encoding: 'utf8', timeout: 30000, env: { ...process.env, VIDBEE_ORACLE_SCENARIO: `audit-${scenario}` } })
    assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.stderr, '')
    const lines = result.stdout.trim().split('\n')
    const events = lines.filter((line) => line.startsWith('__VIDBEE_CAPTURE__')).map((line) => JSON.parse(line.slice('__VIDBEE_CAPTURE__'.length)))
    const raw = lines.find((line) => line.startsWith('__ORACLE__')); assert.ok(raw, result.stdout)
    const trace: unknown[][] = JSON.parse(raw.slice('__ORACLE__'.length))
    const seeding = trace.filter((row) => ['init-script', 'cookies', 'persistent'].includes(String(row[0])))
    if (scenario === 'unreadable') {
      assert.equal(result.status, 1)
      assert.deepEqual(events.at(-1), { type: 'error', message: `ENOENT: no such file or directory, open '${cookiesPath}'` })
      assert.deepEqual(seeding, []); assert.equal(trace.some((row) => row[0] === 'browser-launch'), false)
    } else if (scenario === 'persistent') {
      assert.equal(result.status, 0)
      assert.deepEqual(seeding, [['persistent', '/fixture/session', '/fixture/chromium'], ['init-script', 'name-helper', null], ['init-script', 'spoofLargePlayerBoxInPage', null]])
    } else {
      assert.deepEqual(seeding, [
        ['init-script', 'name-helper', null], ['init-script', 'spoofLargePlayerBoxInPage', null],
        ['cookies', [1699999999, 1700000000, 1700000001, 0, -5].map((expires, index) => ({ name: `c${index}`, value: `v${index}`, domain: 'fixture.invalid', path: '/', secure: true, httpOnly: index === 2, expires: expires <= 1700000000 ? -1 : expires, sameSite: 'Lax' }))],
        ['init-script', '', { a: '1' }]
      ])
      if (scenario.startsWith('SIG')) {
        assert.equal(result.status, 1); assert.deepEqual(events.at(-1), { type: 'error', message: 'Capture cancelled' })
        assert.deepEqual(trace.filter((row) => ['stdin-write', 'child-signal', 'context-close', 'browser-close', 'pid-signal'].includes(String(row[0]))), [['stdin-write', 'q', false, 1], ['child-signal', 'SIGINT'], ['context-close'], ['browser-close'], ['pid-signal', 42, 'SIGTERM'], ['pid-signal', 42, 'SIGKILL']])
      } else { assert.equal(result.status, 0); assert.deepEqual(events.at(-1), { type: 'done', filePath: '/fixture/output.mp4', size: 3, durationMs: null }) }
    }
  } finally { rmSync(root, { recursive: true, force: true }) }
})
