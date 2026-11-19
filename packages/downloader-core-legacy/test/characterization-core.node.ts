import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { DownloaderCore, type DownloadTask } from '@vidbee/downloader-core-legacy'
import { NODE } from './fixtures/node-runtime'
import { hideBundledYtDlp } from './fixtures/discovery-isolation'

function coreFixture(t: { after: (f: () => void) => void }, body: string) {
  const dir = mkdtempSync(join(tmpdir(), 'vidbee-core-oracle-')); const bin = join(dir, 'yt-dlp'); const log = join(dir, 'argv.jsonl')
  const saved = { ...process.env }; t.after(() => { process.env = saved; rmSync(dir, { recursive: true, force: true }) })
  writeFileSync(bin, `#!${NODE}\nrequire('node:fs').appendFileSync(${JSON.stringify(log)},JSON.stringify(process.argv.slice(2))+'\\n');${body}\n`, { mode: 0o755 })
  for (const name of ['ffmpeg', 'ffprobe']) writeFileSync(join(dir, name), '', { mode: 0o755 })
  process.env.YTDLP_PATH = bin; process.env.FFMPEG_PATH = join(dir, 'ffmpeg'); process.env.YTDLP_JS_RUNTIME = 'none'
  return { dir, log, core: new DownloaderCore({ downloadDir: join(dir, 'downloads'), maxConcurrent: 1 }) }
}
for (const [name, metadata, expected] of [
  ['empty-object', '{}', { id: 'https://fixture.invalid/watch', title: 'https://fixture.invalid/watch', formats: [] }],
  ['wrong-scalars', '{"id":7,"title":false,"duration":1e999,"tags":[" x ",7,""],"formats":[{}]}', { id: 7, title: false, duration: Infinity, tags: ['x'], formats: [{ formatId: 'unknown', ext: 'unknown' }] }]
] as const) test(name === 'wrong-scalars' ? 'core metadata wrong-scalars: old scalar escape becomes decoded rejection' : `core pre-port metadata field policy ${name}`, async (t) => {
  const { core, dir, log } = coreFixture(t, `console.log(${JSON.stringify(metadata)})`)
  const initializing = core.initialize(); assert.equal(process.env.FFMPEG_PATH, dir); await initializing
  if (name === 'wrong-scalars') {
    // Before the port: { id: 7, title: false, duration: Infinity, tags: ['x'], formats: [{ formatId: 'unknown', ext: 'unknown' }] }
    // Before the port: assert.equal(value.duration, Infinity); assert.equal(value.id, 7); assert.equal(value.title, false)
    await assert.rejects(core.getVideoInfo('https://fixture.invalid/watch'), { name: 'Error', message: 'Invalid yt-dlp metadata.' })
  } else {
    const value = await core.getVideoInfo('https://fixture.invalid/watch')
    assert.deepEqual(JSON.parse(JSON.stringify(value)), JSON.parse(JSON.stringify(expected)))
  }
  const argv = JSON.parse(readFileSync(log, 'utf8').trim()); assert.equal(argv[0], '-j'); assert.equal(argv.at(-1), 'https://fixture.invalid/watch')
})
for (const [name, metadata, error, message] of [
  ['syntax', '{', SyntaxError, /Expected property name/],
  ['null', 'null', TypeError, /Cannot read properties of null \(reading 'formats'\)/],
  ['formats-object', '{"formats":{}}', TypeError, /map is not a function/],
  ['empty-output', '', Error, /^yt-dlp exited with code 0$/]
] as const) test(`core metadata error ${name}`, async (t) => {
  const { core } = coreFixture(t, metadata ? `console.log(${JSON.stringify(metadata)})` : '')
  await assert.rejects(core.getVideoInfo('https://fixture.invalid/watch'), (failure) => failure instanceof error && message.test(failure.message))
})
test('core URL error and failed discovery messages; initialize creates directory before discovery', async (t) => {
  const { core, dir } = coreFixture(t, "console.log('{}')")
  await assert.rejects(core.getVideoInfo('  '), { name: 'Error', message: 'URL is required.' })
  // An isolated empty PATH does not affect Node fixture selection (absolute shebang).
  delete process.env.YTDLP_PATH; process.env.PATH = dir
  hideBundledYtDlp(t)
  const other = new DownloaderCore({ downloadDir: join(dir, 'other') })
  await assert.rejects(other.initialize(), { name: 'Error', message: 'yt-dlp binary not found. Set YTDLP_PATH or install yt-dlp in PATH.' })
})
for (const scenario of ['success', 'failure', 'active-cancel', 'pending-cancel'] as const) test(`core event order/download/cancellation ${scenario}`, { timeout: 5000 }, async (t) => {
  const { core, log } = coreFixture(t, scenario.endsWith('cancel') ? "process.stdout.write('ready\\n');setInterval(()=>{},1000)" : `process.stdout.write('Destination: /fixture/saved.mp4\\n');process.exitCode=${scenario === 'failure' ? 7 : 0}`)
  const trace: string[] = []
  core.on('history-updated', () => trace.push('history')); core.on('task-updated', (task: DownloadTask) => trace.push(`task:${task.status}`)); core.on('queue-updated', () => trace.push('queue'))
  const first = await core.createDownload({ url: 'https://fixture.invalid/watch', type: 'video', title: 'Fixture' })
  if (scenario.endsWith('cancel')) {
    assert.deepEqual(core.getStatus(), { active: 1, pending: 0 })
    if (scenario === 'pending-cancel') {
      const second = await core.createDownload({ url: 'https://fixture.invalid/second', type: 'video' })
      assert.deepEqual(core.getStatus(), { active: 1, pending: 1 }); assert.equal(await core.cancelDownload(second.id), true)
      assert.equal(core.listHistory()[0]?.status, 'cancelled')
    }
    assert.equal(await core.cancelDownload(first.id), true)
  }
  for (let i = 0; i < 500 && core.getStatus().active; i++) await new Promise((resolve) => setTimeout(resolve, 5))
  assert.deepEqual(core.getStatus(), { active: 0, pending: 0 })
  const task = core.listHistory().find((item) => item.id === first.id); assert.ok(task)
  assert.equal(task.status, scenario.endsWith('cancel') ? 'cancelled' : scenario === 'success' ? 'completed' : 'error')
  if (scenario === 'success') { assert.equal(task.savedFileName, 'saved.mp4'); assert.equal(task.downloadPath, '/fixture') }
  assert.deepEqual(trace.slice(-3), ['history', `task:${task.status}`, 'queue'])
  assert.equal(await core.cancelDownload(first.id), false)
  if (!scenario.endsWith('cancel')) {
    const argv = JSON.parse(readFileSync(log, 'utf8').trim()); assert.equal(argv.at(-3), '--ffmpeg-location'); assert.equal(argv.at(-1), first.url)
  }
})

for (const [name, selection, expected] of [
  ['default', {}, ['1', '2', '3']], ['range', { startIndex: 2, endIndex: 3 }, ['2', '3']],
  ['reversed', { startIndex: 3, endIndex: 1 }, ['1', '2', '3']], ['negative', { startIndex: -4, endIndex: 1 }, ['1']],
  ['ids-win', { entryIds: ['3', '1'], startIndex: 2, endIndex: 2 }, ['1', '3']]
] as const) test(`core playlist selection ${name}`, { timeout: 5000 }, async (t) => {
  const metadata = { id: 'playlist', title: 'Fixture playlist', entries: [1, 2, 3].map((id) => ({ id: String(id), title: `Entry ${id}`, url: `https://fixture.invalid/${id}` })) }
  const { core } = coreFixture(t, `if(process.argv.includes('-J'))console.log(${JSON.stringify(JSON.stringify(metadata))});`)
  const result = await core.startPlaylistDownload({ url: 'https://fixture.invalid/playlist', type: 'video', ...selection, entryIds: 'entryIds' in selection ? [...selection.entryIds] : undefined })
  assert.deepEqual(result.entries.map((entry) => entry.entryId), expected)
  assert.equal(result.totalCount, expected.length)
  for (let i = 0; i < 500 && (core.getStatus().active || core.getStatus().pending); i++) await new Promise((resolve) => setTimeout(resolve, 5))
  assert.deepEqual(core.getStatus(), { active: 0, pending: 0 })
})
