import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { SocialProfileManager } from '@vidbee/downloader-core-legacy/social-profile-manager'
import type { SocialProfileCategory } from '@vidbee/downloader-core-legacy/social-media-service'
import { SourceAdmission } from '@vidbee/task-queue-legacy/source-admission'
import { NODE } from './fixtures/node-runtime'

async function until<T>(read: () => T, done: (value: T) => boolean): Promise<T> {
  for (let i = 0; i < 500; i++) { const value = read(); if (done(value)) return value; await new Promise((resolve) => setTimeout(resolve, 5)) }
  throw new Error('fixture did not reach expected state')
}
class RecordingAdmission extends SourceAdmission {
  constructor(private readonly onAcquire: () => void, private readonly onRelease: () => void) { super() }
  override async acquire() { this.onAcquire(); return () => { this.onRelease() } }
}
const redgifs = 'https://www.redgifs.com/users/fixture'
for (const body of ['null', '{bad json}', '123', '[]', '"text"']) test(`Redgifs JSON line ${body} at stdout end before leader exit`, { timeout: 5000 }, async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'vidbee-redgifs-lifecycle-')); t.after(() => rmSync(root, { recursive: true, force: true }))
  const bin = join(root, 'fake.cjs'); const release = join(root, 'release'); const terminated = join(root, 'term')
  writeFileSync(bin, `#!${NODE}\nconst fs=require('node:fs');process.on('SIGTERM',()=>{fs.writeFileSync(${JSON.stringify(terminated)},'term');process.exit(0)});process.stdout.end(${JSON.stringify(body)});setInterval(()=>{if(fs.existsSync(${JSON.stringify(release)}))process.exit(0)},5)\n`, { mode: 0o755 })
  const api = new SocialProfileManager({ storageDir: join(root, 'profiles'), resolveYtDlpPath: () => bin, runtime: { resolveBinaryPath: () => bin } })
  const mapped = api.map(redgifs, 'posts'); assert.equal(mapped.categories.posts?.state, 'mapping')
  if (body === 'null') {
    const value = await until(() => api.get(redgifs).categories.posts, (p) => p?.state === 'error')
    assert.equal(value?.error, "Cannot read properties of null (reading 'id')")
    await until(() => { try { return readFileSync(terminated, 'utf8') } catch { return '' } }, (v) => v === 'term')
  } else {
    // Successful line consumption alone does not complete traversal; child close is separate.
    writeFileSync(release, 'go')
    const value = await until(() => api.get(redgifs).categories.posts, (p) => p?.state !== 'mapping')
    assert.equal(value?.state, 'complete'); assert.deepEqual(value?.items, [])
  }
})
test('Redgifs streams final unterminated Unicode item before child exit; active exclusion, clone, stop/release', { timeout: 5000 }, async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'vidbee-redgifs-unicode-')); t.after(() => rmSync(root, { recursive: true, force: true }))
  const bin = join(root, 'fake.cjs'); const log = join(root, 'argv.json')
  const record = JSON.stringify({ extractor_key: 'RedGifs', id: 'FixtureClip', title: 'café €' })
  const bytes = Buffer.from(record); const split = bytes.indexOf(0xe2) + 1
  writeFileSync(bin, `#!${NODE}\nrequire('node:fs').writeFileSync(${JSON.stringify(log)},JSON.stringify(process.argv.slice(2)));const data=Buffer.from(${JSON.stringify([...bytes])});process.stdout.write(data.subarray(0,${split}));setTimeout(()=>{process.stdout.end(data.subarray(${split}));},5);setInterval(()=>{},1000)\n`, { mode: 0o755 })
  let acquired = 0; let released = 0
  const api = new SocialProfileManager({ storageDir: join(root, 'profiles'), resolveYtDlpPath: () => bin, runtime: { resolveBinaryPath: () => bin, admission: new RecordingAdmission(() => { acquired++ }, () => { released++ }) } })
  t.after(() => api.stop(redgifs))
  const initial = api.map(redgifs, 'posts'); assert.equal(initial.categories.posts?.state, 'mapping')
  assert.throws(() => api.map(redgifs, 'posts'), { message: 'This profile is already mapping. Stop it or wait for completion.' })
  initial.owner = 'mutated'; assert.equal(api.get(redgifs).owner, 'fixture')
  const category = await until(() => api.get(redgifs).categories.posts, (v) => (v?.items.length ?? 0) > 0)
  assert.equal(category?.state, 'mapping'); assert.equal(category?.items[0]?.title, 'café €')
  assert.deepEqual(JSON.parse(readFileSync(log, 'utf8')), ['--ignore-config', '--flat-playlist', '--dump-json', '--no-progress', redgifs])
  const stopped = await api.stop(redgifs); assert.equal(stopped.categories.posts?.state, 'partial'); assert.equal(acquired, 1); assert.equal(released, 1)
})

const platforms = [
  ['facebook', 'https://www.facebook.com/fixture', 'photos', [3, 'https://cdn.invalid/image', { id: '123' }]],
  ['pinterest', 'https://www.pinterest.com/fixture/_created/', 'posts', [3, 'https://cdn.invalid/image', { id: '123', num: 1, extension: 'jpg' }]],
  ['threads', 'https://www.threads.com/@fixture/media', 'media', [3, 'https://cdn.invalid/image', { id: '123', shortcode: 'ABCDEF', username: 'fixture', num: 1, extension: 'jpg' }]],
  ['snapchat', 'https://www.snapchat.com/@fixture', 'stories', [3, 'https://cdn.invalid/image', { vidbee_category: 'stories', file_id: 'FixtureAAA1.400', extension: 'jpg' }]],
  ['vsco', 'https://vsco.co/fixture/gallery', 'gallery', [3, 'https://cdn.invalid/image', { id: '65a1b2c3d4e5f6', video: false }]]
] as const
for (const [platform, url, category, record] of platforms) test(`${platform} public manager records generic mapping command and replacement semantics`, { timeout: 5000 }, async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'vidbee-mapping-trace-')); t.after(() => rmSync(root, { recursive: true, force: true }))
  const bin = join(root, 'fake.cjs'); const log = join(root, 'argv.json')
  writeFileSync(bin, `#!${NODE}\nrequire('node:fs').writeFileSync(${JSON.stringify(log)},JSON.stringify(process.argv.slice(2)));console.log(${JSON.stringify(JSON.stringify(record))});console.log(${JSON.stringify(JSON.stringify(record))});\n`, { mode: 0o755 })
  const admissionTrace: string[] = []
  const api = new SocialProfileManager({ storageDir: join(root, 'profiles'), resolveYtDlpPath: () => bin, runtime: { resolveBinaryPath: () => bin, resolveExtraArgs: () => ['--proxy', 'http://proxy.invalid:8080'], admission: new RecordingAdmission(() => { admissionTrace.push('acquire') }, () => { admissionTrace.push('release') }) } })
  let result: SocialProfileCategory | undefined
  for (let i = 0; i < 2; i++) {
    const initial = api.map(url, category); assert.equal(initial.categories[category]?.state, 'mapping')
    result = await until(() => api.get(url).categories[category], (v) => v?.state !== 'mapping')
    assert.equal(result?.state, 'complete'); assert.equal(result?.items.length, 1); assert.equal(result?.items[0]?.images, platform === 'threads' ? 2 : 1)
  }
  assert.deepEqual(admissionTrace, ['acquire', 'release', 'acquire', 'release'])
  const argv = JSON.parse(readFileSync(log, 'utf8')); const expected = new URL(`./fixtures/map-${platform}.json`, import.meta.url)
  if (process.env.VIDBEE_RECORD_CHARACTERIZATION === '1') writeFileSync(expected, JSON.stringify(argv, null, 2) + '\n')
  assert.deepEqual(argv, JSON.parse(readFileSync(expected, 'utf8')))
})

for (const [platform, url, category, post] of [
  ['x', 'https://x.com/fixture', 'tweets', 'https://x.com/i/web/status/123456789'],
  ['tiktok', 'https://www.tiktok.com/@fixture', 'posts', 'https://www.tiktok.com/@fixture/video/123456789']
] as const) test(`${platform} aggregation, replacement, incremental known IDs and mapAndWait Promise prefix`, { timeout: 5000 }, async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'vidbee-social-incremental-')); t.after(() => rmSync(root, { recursive: true, force: true }))
  const bin = join(root, 'fake.cjs'); const log = join(root, 'known.jsonl')
  const item = { id: '123456789', url: post, author: 'fixture' }
  writeFileSync(bin, `#!${NODE}
const fs=require('node:fs'),path=require('node:path');
const option=(name)=>{const raw=process.argv.find(x=>x.startsWith(name+'='));return raw?JSON.parse(raw.slice(raw.indexOf('=')+1)):undefined};
const known=option('extractor.vidbee-social.known-items-file');fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(known?JSON.parse(fs.readFileSync(known,'utf8')):null)+'\\n');
const destination=option('extractor.vidbee-social.destination');const manifest=path.join(destination,'.vidbee','social-media.sqlite');fs.mkdirSync(path.dirname(manifest),{recursive:true});fs.writeFileSync(manifest,'manifest');
const emit=x=>console.log('__VIDBEE_SOCIAL__\\t'+JSON.stringify(x));
emit({type:'item',item:{...${JSON.stringify(item)},kind:'image'}});emit({type:'item',item:{...${JSON.stringify(item)},kind:'video'}});
emit({type:'complete',summary:{posts:1,images:1,videos:1,downloaded:0,existing:0,failed:0,totalSize:0,reason:'exhausted',manifestPath:manifest,startedAt:1,finishedAt:2}});
`, { mode: 0o755 })
  const api = new SocialProfileManager({ storageDir: join(root, 'profiles'), resolveYtDlpPath: () => bin, runtime: { resolveBinaryPath: () => bin } })
  const source = api.get(url); const key = source.categories[category] ? category : Object.keys(source.categories)[0]; assert.ok(key)
  const first = await api.mapAndWait(url, key); assert.equal(first.categories[key]?.state, 'complete'); assert.equal(first.categories[key]?.items[0]?.images, 1); assert.equal(first.categories[key]?.items[0]?.videos, 1)
  const second = api.mapAndWait(url, key, undefined, { incremental: true }); assert.equal(api.get(url).categories[key]?.state, 'complete')
  const result = await second; assert.equal(result.categories[key]?.items[0]?.images, 1); assert.equal(result.categories[key]?.items[0]?.videos, 1)
  assert.deepEqual(readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line)), [null, ['123456789']])
})
test('Redgifs mixed CR/LF/readline records, skipped long/syntax lines, wrong values and optional title', { timeout: 5000 }, async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'vidbee-redgifs-lines-')); t.after(() => rmSync(root, { recursive: true, force: true }))
  const bin = join(root, 'fake.cjs')
  const one = JSON.stringify({ extractor_key: 'RedGifs', id: 'OneClip', title: 42 })
  const two = JSON.stringify({ extractor_key: 'RedGifs', id: 'TwoClip', title: 'Two' })
  const invalid = ['{bad', '', JSON.stringify({ extractor_key: 'Other', id: 'Wrong' }), JSON.stringify({ extractor_key: 'RedGifs', id: '../bad' }), 'x'.repeat(100001)].join('\n')
  writeFileSync(bin, `#!${NODE}\nprocess.stdout.write(${JSON.stringify(invalid + '\n' + one + '\r')});setTimeout(()=>{process.stdout.write(${JSON.stringify('\n' + two + '\r\n')});},125)\n`, { mode: 0o755 })
  const api = new SocialProfileManager({ storageDir: join(root, 'profiles'), resolveYtDlpPath: () => bin, runtime: { resolveBinaryPath: () => bin } })
  const result = await api.mapAndWait(redgifs, 'posts')
  assert.equal(result.categories.posts?.state, 'complete'); assert.deepEqual(result.categories.posts?.items.map((item) => [item.id, item.title]), [['OneClip', undefined], ['TwoClip', 'Two']])
})

for (const [label, body] of [['malformed', '{'], ['bom', '\uFEFF{}'], ['wrong-shape', '{}'], ['null', 'null'], ['invalid-utf8', Buffer.from([0xff])]] as const) test(`Node social inventory exact public error payload: ${label}`, (t) => {
  const root = mkdtempSync(join(tmpdir(), 'vidbee-node-inventory-')); t.after(() => rmSync(root, { recursive: true, force: true }))
  const api = new SocialProfileManager({ storageDir: root, resolveYtDlpPath: () => '/fixture/not-started', runtime: { resolveBinaryPath: () => '/fixture/not-started' } })
  api.get('https://x.com/fixture'); const file = join(root, readdirSync(root)[0] ?? 'missing'); writeFileSync(file, body)
  let observed: unknown
  try { api.get('https://x.com/fixture') } catch (error) { observed = error instanceof Error ? { name: error.name, message: error.message, ...('issues' in error ? { issues: error.issues } : {}) } : error }
  assert.ok(observed); const expected = new URL(`./fixtures/file-error-${label}.json`, import.meta.url)
  if (process.env.VIDBEE_RECORD_CHARACTERIZATION === '1') writeFileSync(expected, JSON.stringify(observed, null, 2) + '\n')
  assert.deepEqual(observed, JSON.parse(readFileSync(expected, 'utf8')))
})
