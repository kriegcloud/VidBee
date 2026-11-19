import { expect, it } from 'vitest'
import { expandTikTokShortLink, retryTransientYtDlpNetworkError } from '@vidbee/downloader-core-legacy'

it('retry preserves original final rejection identity and exactly two one-second sleeps', async () => {
  const original = new Error('IncompleteRead: fixture'); const trace: unknown[] = []
  const pending = retryTransientYtDlpNetworkError(async () => { trace.push('attempt'); throw original }, async (delay) => { trace.push(['sleep', delay]) })
  trace.push('returned')
  queueMicrotask(() => trace.push('microtask'))
  await expect(pending).rejects.toBe(original)
  expect(trace).toMatchSnapshot()
})
it.each(['opaque-failure', { code: 'opaque' }])('non-Error metadata rejection remains identical', async (failure) => {
  await expect(retryTransientYtDlpNetworkError(() => Promise.reject(failure))).rejects.toBe(failure)
})
it('a rejected retry sleep is propagated by identity', async () => {
  const failure = { sleep: 'failure' }
  await expect(retryTransientYtDlpNetworkError(() => Promise.reject(new Error('read timed out')), () => Promise.reject(failure))).rejects.toBe(failure)
})
for (const status of [200, 299, 300, 302, 399, 400]) it(`short-link status boundary ${status}, exact HTTP request options`, async () => {
  const trace: unknown[] = []
  const raw = '  https://vm.tiktok.com/ABCDEF/  '
  const result = await expandTikTokShortLink(raw, { fetch: async (input, options) => {
    expect(options.signal).toBeInstanceOf(AbortSignal)
    trace.push([input, { ...options, signal: '<AbortSignal>' }])
    return new Response(null, { status, headers: { location: 'https://www.tiktok.com/@fixture/video/123456?token=not-kept' } })
  } })
  expect(trace).toEqual([['https://vm.tiktok.com/ABCDEF/', { method: 'HEAD', redirect: 'manual', headers: { 'User-Agent': 'facebookexternalhit/1.1' }, signal: '<AbortSignal>' }]])
  expect(result).toBe(status >= 300 && status <= 399 ? 'https://www.tiktok.com/@fixture/video/123456' : raw)
})
it('short-link non-Error fetch rejection fails open with original whitespace; nonshort avoids fetch', async () => {
  const raw = ' https://vm.tiktok.com/ABCDEF/ '
  expect(await expandTikTokShortLink(raw, { fetch: () => Promise.reject({ opaque: true }) })).toBe(raw)
  expect(await expandTikTokShortLink('https://fixture.invalid', { fetch: () => { throw new Error('must not fetch') } })).toBe('https://fixture.invalid')
})

it('short-link timeout defaults and override are passed to AbortSignal.timeout', async () => {
  const { vi } = await import('vitest'); const timeout = vi.spyOn(AbortSignal, 'timeout')
  const fetch = async () => new Response(null, { status: 200 })
  try { await expandTikTokShortLink('https://vm.tiktok.com/ABCDEF', { fetch }); await expandTikTokShortLink('https://vm.tiktok.com/ABCDEF', { fetch, timeoutMs: 123 }); expect(timeout.mock.calls).toEqual([[10000], [123]]) } finally { timeout.mockRestore() }
})

it('wrapper constructor resolution accepts direct/default/nested exports and rejects absent constructor exactly', async () => {
  const { resolveYtDlpWrapCtor } = await import('@vidbee/downloader-core-legacy/yt-dlp-wrap')
  class Constructor {}
  expect(resolveYtDlpWrapCtor(Constructor)).toBe(Constructor)
  expect(resolveYtDlpWrapCtor({ default: Constructor })).toBe(Constructor)
  expect(resolveYtDlpWrapCtor({ default: { default: Constructor } })).toBe(Constructor)
  expect(() => resolveYtDlpWrapCtor({})).toThrowError(new TypeError('yt-dlp-wrap-plus did not export a constructor'))
})
