// Frozen oracle fixtures must never be rewritten by tests.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { NODE } from './fixtures/node-runtime.js'

const prefix = '__VIDBEE_CAPTURE__'
const cases: readonly [string, string | undefined, string][] = [
  ['usage', undefined, 'Usage: browser-capture-sidecar --job <job.json>'],
  ['null', 'null', 'Capture job must be an object'],
  ['scalar', '7', 'Capture job must be an object'],
  ['array', '[]', 'Capture job is missing url'],
  ['object', '{}', 'Capture job is missing url'],
  ['blank url', '{"url":"  "}', 'Capture job is missing url'],
  ['missing output', '{"url":" x "}', 'Capture job is missing outputPath'],
  ['missing ffmpeg', '{"url":"x","outputPath":"/fixture/output"}', 'Capture job is missing ffmpegPath'],
  ['no browser', '{"url":"x","outputPath":"/fixture/output","ffmpegPath":"/fixture/ffmpeg"}', 'No Chromium-family browser found to play DRM media'],
  // Before the port: nonfinite defaults expected "No Chromium-family browser found to play DRM media".
  ['nonfinite defaults', '{"url":"x","outputPath":"/fixture/output","ffmpegPath":"/fixture/ffmpeg","width":1e999,"height":1e999,"durationHintSec":1e999,"localStorage":["accepted"]}', 'Invalid browser-capture data.'],
  ['BOM', '\ufeff{}', 'Unexpected token \'\ufeff\', "\ufeff{}" is not valid JSON'],
  ['invalid JSON', '{', "Expected property name or '}' in JSON at position 1 (line 1 column 2)"]
]
for (const [name, body, message] of cases) test(`public sidecar Node oracle: ${name}`, { timeout: 60000 }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'vidbee-sidecar-characterization-'))
  try {
    const file = join(directory, 'job.json'); if (body !== undefined) writeFileSync(file, body)
    const program = `process.argv = ['fixture-node', 'fixture-sidecar', ...${JSON.stringify(body === undefined ? [] : ['--job', file])}]; await import('@vidbee/browser-capture-legacy/sidecar')`
    const result = spawnSync(NODE, ['--import', 'tsx', '--input-type=module', '-e', program], { encoding: 'utf8', timeout: 30000, env: { ...process.env, VIDBEE_BROWSER_CAPTURE: '0' } })
    assert.equal(result.error, undefined); assert.equal(result.status, 1); assert.equal(result.signal, null); assert.equal(result.stderr, '')
    const lines = result.stdout.trimEnd().split('\n').map((line) => { assert.ok(line.startsWith(prefix)); return JSON.parse(line.slice(prefix.length)) })
    assert.equal(lines.length, 2); assert.equal(lines[0].type, 'spawn'); assert.equal(typeof lines[0].pid, 'number'); assert.ok(lines[0].pid > 0)
    assert.deepEqual(lines[1], { message, type: 'error' })
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

for (const scenario of ['normal-close', 'early-close', 'readiness-timeout']) test(`public sidecar captures process observer/stop policy: ${scenario}`, { timeout: 60000 }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'vidbee-sidecar-process-'))
  try {
    const file = join(directory, 'job.json')
    writeFileSync(file, JSON.stringify({ url: 'https://fixture.invalid/video', outputPath: '/fixture/output.mp4', ffmpegPath: '/fixture/ffmpeg', browserExecutable: '/fixture/chromium', width: 4, height: 4, durationHintSec: 2 }))
    const driver = new URL('./fixtures/sidecar-process-driver.mjs', import.meta.url).href
    const program = `process.argv = ['node', 'sidecar', '--job', ${JSON.stringify(file)}]; await import('@vidbee/browser-capture-legacy/sidecar')`
    const result = spawnSync(NODE, ['--import', 'tsx', '--import', driver, '--input-type=module', '-e', program], { encoding: 'utf8', timeout: 30000, env: { ...process.env, VIDBEE_ORACLE_SCENARIO: scenario } })
    assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stdout + result.stderr); assert.equal(result.stderr, '')
    const lines = result.stdout.trim().split('\n')
    const oracle = lines.find((line) => line.startsWith('__ORACLE__')); assert.ok(oracle)
    const trace: unknown[][] = JSON.parse(oracle.slice('__ORACLE__'.length))
    const fixture = new URL(`./fixtures/process-${scenario}.json`, import.meta.url)
    assert.deepEqual(trace, JSON.parse(readFileSync(fixture, 'utf8')))
    const selected = trace.filter((row) => ['xvfb-observers', 'pactl-observers', 'scan-observers', 'recorder-observers', 'stdin-write', 'child-signal', 'pid-signal', 'context-close', 'browser-close', 'early-close', 'recorder-final-observers'].includes(String(row[0])))
    assert.deepEqual(selected, [
      ['xvfb-observers', 0, 0], ['pactl-observers', 0, 1, 1], ['scan-observers', 1, 1, 1, 1], ['recorder-observers', 0, 0, 0],
      ...(scenario === 'early-close' ? [['early-close']] : []),
      ['stdin-write', 'q', false, 1], ['child-signal', 'SIGINT'],
      ...(scenario === 'early-close' ? [['child-signal', 'SIGKILL']] : []),
      ['context-close'], ['browser-close'], ['pactl-observers', 0, 1, 1], ['pid-signal', 42, 'SIGTERM'], ['pid-signal', 42, 'SIGKILL'], ['recorder-final-observers', scenario === 'early-close' ? 1 : 0, 0]
    ])
    const recorderSpawn = trace.filter((row) => row[0] === 'spawn').at(-2)
    assert.ok(recorderSpawn); assert.deepEqual(recorderSpawn[3] && (recorderSpawn[3] as { stdio: string[] }).stdio, ['pipe', 'ignore', 'pipe'])
    const done = lines.filter((line) => line.startsWith(prefix)).map((line) => JSON.parse(line.slice(prefix.length))).at(-1)
    assert.deepEqual(done, { type: 'done', filePath: '/fixture/output.mp4', size: 3, durationMs: 2000 })
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

for (const site of ['xvfb', 'recorder']) test(`public sidecar isolated ${site} missing executable has immediate failure then unhandled child error`, { timeout: 60000 }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'vidbee-sidecar-error-'))
  try {
    const file = join(directory, 'job.json'); writeFileSync(file, JSON.stringify({ url: 'https://fixture.invalid/video', outputPath: '/fixture/output.mp4', ffmpegPath: '/fixture/ffmpeg', browserExecutable: '/fixture/chromium', width: 4, height: 4 }))
    const program = `process.argv=['node','sidecar','--job',${JSON.stringify(file)}]; await import('@vidbee/browser-capture-legacy/sidecar')`
    const result = spawnSync(NODE, ['--import', 'tsx', '--import', new URL('./fixtures/sidecar-process-driver.mjs', import.meta.url).href, '--input-type=module', '-e', program], { encoding: 'utf8', timeout: 30000, env: { ...process.env, VIDBEE_ORACLE_SCENARIO: `${site}-missing` } })
    assert.equal(result.error, undefined); assert.equal(result.status, 1); assert.equal(result.signal, null)
    assert.match(result.stderr, /Unhandled 'error' event/); assert.match(result.stderr, /spawn \/fixture\/missing ENOENT/)
    const events = result.stdout.split('\n').filter((line) => line.startsWith(prefix)).map((line) => JSON.parse(line.slice(prefix.length)))
    assert.equal(events[0].type, 'spawn')
    // Recorder failure can escape in the unhandled error turn before the sidecar catch resumes.
    if (site === 'recorder') assert.deepEqual(events.filter((event) => event.type === 'error'), [])
    if (site === 'xvfb') assert.deepEqual(events.at(-1), { message: 'Failed to start Xvfb', type: 'error' })
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('public sidecar display exhaustion rejects before starting Xvfb', { timeout: 60000 }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'vidbee-sidecar-displays-'))
  try {
    const file = join(directory, 'job.json'); writeFileSync(file, JSON.stringify({ url: 'https://fixture.invalid/video', outputPath: '/fixture/output.mp4', ffmpegPath: '/fixture/ffmpeg', browserExecutable: '/fixture/chromium', width: 4, height: 4 }))
    const program = `process.argv=['node','sidecar','--job',${JSON.stringify(file)}];await import('@vidbee/browser-capture-legacy/sidecar')`
    const result = spawnSync(NODE, ['--import', 'tsx', '--import', new URL('./fixtures/sidecar-process-driver.mjs', import.meta.url).href, '--input-type=module', '-e', program], { encoding: 'utf8', timeout: 30000, env: { ...process.env, VIDBEE_ORACLE_SCENARIO: 'display-exhausted' } })
    assert.equal(result.error, undefined); assert.equal(result.status, 1); assert.equal(result.stderr, '')
    const events = result.stdout.split('\n').filter((line) => line.startsWith(prefix)).map((line) => JSON.parse(line.slice(prefix.length)))
    assert.deepEqual(events.at(-1), { message: 'No free Xvfb display in :90-:129', type: 'error' })
    const raw = result.stdout.split('\n').find((line) => line.startsWith('__ORACLE__')); assert.ok(raw)
    const trace: unknown[][] = JSON.parse(raw.slice('__ORACLE__'.length)); assert.equal(trace.some((row) => row[0] === 'spawn'), false)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
