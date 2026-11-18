import { existsSync, rmSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import { SourceAdmission } from '@vidbee/task-queue-legacy/source-admission'
const files = vi.hoisted(() => ({ created: [] as string[], removed: [] as string[] }))
vi.mock('node:fs/promises', async (original) => {
  const real = await original<typeof import('node:fs/promises')>()
  return { ...real,
    mkdtemp: async (prefix: string) => { const dir = await real.mkdtemp(prefix); files.created.push(dir); return dir },
    rm: async (file: string, options: Parameters<typeof real.rm>[1]) => { files.removed.push(file); return real.rm(file, options) }
  }
})
import { mapSocialMediaProfile, previewSocialMedia } from '@vidbee/downloader-core-legacy/social-media-service'
afterEach(() => { for (const dir of files.created.splice(0)) rmSync(dir, { recursive: true, force: true }); files.removed = [] })
class Admission extends SourceAdmission {
  constructor(private readonly failure: unknown, private readonly released: () => void) { super() }
  override acquire(): Promise<(() => void) | null> { return this.failure ? Promise.reject(this.failure) : Promise.resolve(() => this.released()) }
}
it('mapping admission rejection keeps original non-Error value and cleans temporary directory', async () => {
  const failure = { admission: 'reject' }
  await expect(mapSocialMediaProfile('https://x.com/fixture', { resolveBinaryPath: () => '/fixture/not-launched', admission: new Admission(failure, () => {}) }, undefined, new AbortController().signal, () => {})).rejects.toBe(failure)
  expect(files.created).toHaveLength(1); expect(files.removed).toEqual(files.created); expect(existsSync(files.created[0] ?? '')).toBe(false)
})
it('preview admission rejection happens outside finally and leaves its scratch directory', async () => {
  const failure = { admission: 'reject' }
  await expect(previewSocialMedia('https://x.com/fixture', { resolveBinaryPath: () => '/fixture/not-launched', admission: new Admission(failure, () => {}) })).rejects.toBe(failure)
  expect(files.created).toHaveLength(1); expect(files.removed).toEqual([]); expect(existsSync(files.created[0] ?? '')).toBe(true)
})
for (const site of ['map', 'preview'] as const) it(`${site} executor-builder failure releases admission and removes scratch directory`, async () => {
  let released = 0; const failure = { settings: 'opaque rejection' }
  const runtime = { resolveBinaryPath: () => '/fixture/not-launched', resolveExtraArgs: () => { throw failure }, admission: new Admission(undefined, () => { released++ }) }
  const pending = site === 'map' ? mapSocialMediaProfile('https://x.com/fixture', runtime, undefined, new AbortController().signal, () => {}) : previewSocialMedia('https://x.com/fixture', runtime)
  await expect(pending).rejects.toBe(failure); expect(released).toBe(1); expect(files.removed).toEqual(files.created)
})
it('unsupported map source has fixed message before scratch/admission; aborted admitted map still releases', async () => {
  const runtime = { resolveBinaryPath: () => '/fixture/not-launched' }
  await expect(mapSocialMediaProfile('https://x.com/fixture/status/123', runtime, undefined, new AbortController().signal, () => {})).rejects.toThrow('Map an X or TikTok profile category URL.')
  expect(files.created).toEqual([])
  let released = 0; const signal = AbortSignal.abort()
  expect(await mapSocialMediaProfile('https://x.com/fixture', { ...runtime, admission: new Admission(undefined, () => { released++ }) }, undefined, signal, () => {})).toEqual({ complete: false })
  expect(released).toBe(1); expect(files.removed).toEqual(files.created)
})
