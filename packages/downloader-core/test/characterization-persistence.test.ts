import { createHash } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'

const io = vi.hoisted(() => ({ calls: [] as unknown[][], failRename: false, readFailure: undefined as Error | undefined }))
vi.mock('node:fs', async (original) => {
  const real = await original<typeof import('node:fs')>()
  return { ...real,
    readFileSync: (...args: Parameters<typeof real.readFileSync>) => { if (io.readFailure) throw io.readFailure; return real.readFileSync(...args) },
    mkdirSync: (...args: Parameters<typeof real.mkdirSync>) => { io.calls.push(['mkdir', ...args]); return real.mkdirSync(...args) },
    writeFileSync: (...args: Parameters<typeof real.writeFileSync>) => { io.calls.push(['write', ...args]); return real.writeFileSync(...args) },
    renameSync: (...args: Parameters<typeof real.renameSync>) => { io.calls.push(['rename', ...args]); if (io.failRename) throw new Error('injected rename failure'); return real.renameSync(...args) }
  }
})
import { InstagramProfileInspector } from '@vidbee/downloader-core'
import { SocialProfileManager } from '@vidbee/downloader-core/social-profile-manager'
import { writeKnownItemsFile } from '@vidbee/downloader-core/social-media-service'
const roots: string[] = []
function root() { const dir = mkdtempSync(join(tmpdir(), 'vidbee-inventory-')); roots.push(dir); return dir }
afterEach(() => { io.failRename = false; io.readFailure = undefined; io.calls = []; for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true }) })
const url = 'https://x.com/fixture'
const hash = createHash('sha256').update('x:fixture').digest('hex')
const manager = (storageDir: string) => new SocialProfileManager({ storageDir, runtime: { resolveBinaryPath: () => '/fixture/not-started' }, resolveYtDlpPath: () => '/fixture/not-started' })
const inspector = (storageDir: string, now = 1000) => new InstagramProfileInspector({ storageDir, clock: () => now, resolveBinaryPath: () => { throw new Error('no process expected') } })
const backupMessage = 'Saved Instagram profile could not be read. Restore its backup before rescanning.'

it('social get is synchronous, creates hash-named inventory, writes fixed temp then renames with modes', () => {
  const dir = join(root(), 'profiles'); const api = manager(dir); io.calls = []
  const value = api.get(url)
  expect(value.owner).toBe('fixture')
  expect(readdirSync(dir)).toEqual([`${hash}.json`])
  expect(statSync(dir).mode & 0o777).toBe(0o700)
  expect(statSync(join(dir, `${hash}.json`)).mode & 0o777).toBe(0o600)
  expect(io.calls.map((call) => [call[0], String(call[1]).replace(dir, '<DIR>'), call[0] === 'mkdir' ? call[2] : call[0] === 'rename' ? String(call[2]).replace(dir, '<DIR>') : call[3]])).toEqual([
    ['mkdir', '<DIR>', { recursive: true, mode: 0o700 }], ['write', `<DIR>/${hash}.json.tmp`, { mode: 0o600 }], ['rename', `<DIR>/${hash}.json.tmp`, `<DIR>/${hash}.json`]
  ])
})
it('social read strips unknown keys, backfills categories and changes orphan mapping only in memory', () => {
  const dir = root(); const api = manager(dir); const value = api.get(url)
  value.categories.tweets = { state: 'mapping', items: [] }
  writeFileSync(join(dir, `${hash}.json`), JSON.stringify({ ...value, extra: 'drop' }))
  const disk = readFileSync(join(dir, `${hash}.json`), 'utf8'); io.calls = []
  expect(api.get(url)).not.toHaveProperty('extra')
  expect(api.get(url).categories.tweets?.state).toBe('partial')
  expect(readFileSync(join(dir, `${hash}.json`), 'utf8')).toBe(disk)
  expect(io.calls).toEqual([])
})
for (const [label, body, error] of [
  ['syntax', '{', 'SyntaxError'], ['bom', '\uFEFF{}', 'SyntaxError'], ['shape', '{}', 'ZodError'], ['null', 'null', 'ZodError'], ['invalid-utf8', Buffer.from([0xff]), 'SyntaxError']
] as const) it(`social get propagates ${label}; list omits it`, () => {
  const dir = root(); writeFileSync(join(dir, `${hash}.json`), body)
  expect(() => manager(dir).get(url)).toThrowError(expect.objectContaining({ name: error }))
  expect(manager(dir).list()).toEqual([])
})
it('social identity mismatch has fixed Error text; unsupported input/category are synchronous errors', () => {
  const dir = root(); const api = manager(dir); const value = api.get(url)
  writeFileSync(join(dir, `${hash}.json`), JSON.stringify({ ...value, owner: 'other' }))
  expect(() => api.get(url)).toThrow('Saved social profile identity does not match.')
  expect(() => api.get('https://fixture.invalid')).toThrow('Enter a Facebook, X, TikTok, Redgifs, VSCO, Threads, Pinterest, or Snapchat profile URL.')
  expect(() => api.map(url, 'invalid')).toThrow('Unsupported profile category.')
})
it('social rename failure leaves fixed temporary file and existing mode is not changed', () => {
  const dir = root(); chmodSync(dir, 0o755); const temp = join(dir, `${hash}.json.tmp`); writeFileSync(temp, 'old', { mode: 0o644 }); io.failRename = true
  expect(() => manager(dir).get(url)).toThrow('injected rename failure')
  expect(statSync(temp).mode & 0o777).toBe(0o644)
  expect(statSync(dir).mode & 0o777).toBe(0o755)
  expect(JSON.parse(readFileSync(temp, 'utf8')).owner).toBe('fixture')
})
it('Instagram empty inspection saves synchronously before its Promise settles, with UUID temp and cache-before-save', async () => {
  const dir = join(root(), 'profiles'); const api = inspector(dir); io.calls = []
  const pending = api.inspect('https://instagram.com/fixture', undefined, [])
  const filename = readdirSync(dir)[0]; expect(filename).toMatch(/^instagram_[a-f0-9]{64}\.json$/)
  expect(io.calls.map((call) => call[0])).toEqual(['mkdir', 'write', 'rename'])
  expect(String(io.calls[1]?.[1])).toMatch(/\.json\.[a-f0-9-]{36}\.tmp$/)
  expect(statSync(join(dir, filename ?? '')).mode & 0o777).toBe(0o600)
  const result = await pending; expect(api.get(result.inspectionId)?.inspection).toEqual(result)
  const failedDir = join(root(), 'profiles'); const failed = inspector(failedDir); io.failRename = true
  await expect(failed.inspect('https://instagram.com/fixture', undefined, [])).rejects.toThrow('injected rename failure')
  const temporary = readdirSync(failedDir)[0] ?? ''; expect(temporary).toMatch(/\.tmp$/)
  const saved = JSON.parse(readFileSync(join(failedDir, temporary), 'utf8'))
  expect(failed.get(saved.inspectionId)?.inspection.profile.username).toBe('fixture')
})
it('Instagram missing/expired/invalid ID reads are null and disk does not override cached object', async () => {
  const dir = root(); const first = await inspector(dir).inspect('https://instagram.com/fixture', undefined, [])
  expect(inspector(dir).get('invalid')).toBeNull()
  expect(inspector(dir).get(`instagram_${'0'.repeat(64)}`)).toBeNull()
  const target = join(dir, `${first.inspectionId}.json`)
  writeFileSync(target, JSON.stringify({ ...first, expiresAt: 1000 }))
  expect(inspector(dir).get(first.inspectionId)).toBeNull()
  writeFileSync(target, JSON.stringify({ ...first, inspectionId: 'different', unknown: 1, profile: { ...first.profile, username: 'different', unknown: 2 } }))
  const loaded = inspector(dir).get(first.inspectionId)
  // Unlike the social store, no filename/body identity check exists.
  expect(loaded?.inspection.inspectionId).toBe('different')
  expect(loaded?.inspection).not.toHaveProperty('unknown')
  expect(loaded?.inspection.profile).not.toHaveProperty('unknown')
})
for (const [label, body] of [['syntax', '{'], ['bom', '\uFEFF{}'], ['shape', '{}'], ['null', 'null'], ['invalid-utf8', Buffer.from([0xff])]] as const) it(`Instagram ${label} becomes backup guidance Error`, async () => {
  const dir = root(); const first = await inspector(dir).inspect('https://instagram.com/fixture', undefined, [])
  writeFileSync(join(dir, `${first.inspectionId}.json`), body)
  expect(() => inspector(dir).get(first.inspectionId)).toThrowError(new Error(backupMessage))
})
it('Instagram completed-download read rewrites stripped inventory; file modes are creation-only', async () => {
  const dir = root(); chmodSync(dir, 0o755); const initial = await inspector(dir).inspect('https://instagram.com/fixture', undefined, [])
  const target = join(dir, `${initial.inspectionId}.json`)
  const snapshot = { ...initial, unknown: 1, categories: [{ category: 'posts', state: 'ready', sourceCount: 1, assetCount: 1, items: [{ id: 'one', url: 'https://instagram.com/p/ONE/', assetCount: 1, unknown: 2 }] }] }
  writeFileSync(target, JSON.stringify(snapshot)); chmodSync(target, 0o644)
  const api = new InstagramProfileInspector({ storageDir: dir, clock: () => 1000, resolveBinaryPath: () => 'unused', completedDownloads: () => [{ url: 'https://instagram.com/p/ONE/', category: 'posts', assetCount: 1 }] })
  const value = await api.inspect('https://instagram.com/fixture', undefined, [])
  expect(value.categories[0]?.items?.[0]?.downloaded).toBe(true)
  const disk = JSON.parse(readFileSync(target, 'utf8'))
  expect(disk).not.toHaveProperty('unknown'); expect(disk.categories[0].items[0]).not.toHaveProperty('unknown')
  expect(statSync(dir).mode & 0o777).toBe(0o755)
  expect(statSync(target).mode & 0o777).toBe(0o600) // replacement inode, not chmod
})
it('known-items writes directly, retains order/duplicates and existing mode; absent IDs do no I/O', async () => {
  const dir = root(); io.calls = []
  expect(await writeKnownItemsFile(dir, undefined)).toBeUndefined(); expect(await writeKnownItemsFile(dir, [])).toBeUndefined(); expect(io.calls).toEqual([])
  const file = await writeKnownItemsFile(dir, ['2', '1', '2']); expect(file).toBe(join(dir, 'known-items.json'))
  expect(readFileSync(file ?? '', 'utf8')).toBe('["2","1","2"]'); expect(statSync(file ?? '').mode & 0o777).toBe(0o600)
  chmodSync(file ?? '', 0o644); await writeKnownItemsFile(dir, ['3']); expect(statSync(file ?? '').mode & 0o777).toBe(0o644)
  await expect(writeKnownItemsFile(join(dir, 'missing'), ['1'])).rejects.toHaveProperty('code', 'ENOENT')
})

it('inventory permission failures retain social host error identity but Instagram maps backup guidance', async () => {
  const dir = root(); const social = manager(dir); social.get(url)
  const ig = await inspector(dir).inspect('https://instagram.com/fixture', undefined, [])
  const denied = Object.assign(new Error('EACCES: permission denied, open fixture'), { code: 'EACCES', path: '/fixture/inventory', syscall: 'open' })
  io.readFailure = denied
  expect(() => social.get(url)).toThrow(denied); expect(social.list()).toEqual([])
  expect(() => inspector(dir).get(ig.inspectionId)).toThrowError(new Error(backupMessage))
})

it('Instagram unknown category is a rejected Promise with exact error; expiry is inclusive', async () => {
  const dir = root(); const api = new InstagramProfileInspector({ storageDir: dir, clock: () => 1000, resolveBinaryPath: () => '/fixture/not-launched' })
  await expect(Reflect.apply(api.inspect, api, ['https://instagram.com/fixture', undefined, ['invalid']])).rejects.toThrow('Unsupported Instagram category.')
  const initial = await api.inspect('https://instagram.com/fixture', undefined, [])
  writeFileSync(join(dir, `${initial.inspectionId}.json`), JSON.stringify({ ...initial, expiresAt: 1001 }))
  expect(inspector(dir, 1000).get(initial.inspectionId)).not.toBeNull(); expect(inspector(dir, 1001).get(initial.inspectionId)).toBeNull()
})
