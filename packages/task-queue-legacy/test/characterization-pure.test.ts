import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { IllegalTransitionError, isLegalTransition, transition, type TransitionTrigger } from '@vidbee/task-queue-legacy/fsm'
import { classify, defaultMaxAttempts, getRuleForCategory, parseRetryAfter, sanitizeOutput, takeStderrTail, virtualError } from '@vidbee/task-queue-legacy/classifier'
import { legacyDownloadStatusOf, legacySubStatusOf, projectTaskToLegacy } from '@vidbee/task-queue-legacy/projection'
import { backgroundChildSpawnOptions, FFMPEG_ENCODE_THREADS, isPidAlive, killProcessTree, readPidStartTime, setReadPidStartTimeImpl } from '@vidbee/task-queue-legacy/process'
import { EMPTY_PROGRESS, type ErrorCategory, type TaskKind, type TaskOutput, type TaskStatus } from '@vidbee/task-queue-legacy/types'
import { task } from './fixtures'

const statuses: TaskStatus[] = ['queued', 'running', 'processing', 'paused', 'retry-scheduled', 'completed', 'failed', 'cancelled']
const edges: Record<TaskStatus, TaskStatus[]> = {
  queued: ['running', 'paused', 'cancelled'],
  running: ['processing', 'completed', 'retry-scheduled', 'failed', 'paused', 'cancelled'],
  processing: ['completed', 'retry-scheduled', 'failed', 'paused', 'cancelled'],
  paused: ['queued', 'cancelled', 'failed'],
  'retry-scheduled': ['queued', 'paused', 'cancelled'],
  completed: [], failed: ['queued'], cancelled: ['queued']
}
const output: TaskOutput = { filePath: '/dl/media.mp4', size: 10, durationMs: null, sha256: null }
const error = virtualError('network-transient', 'connection lost')

for (const from of statuses) {
  for (const to of statuses) {
    test(`FSM edge ${from} -> ${to}`, () => {
      const original = task('edge', { status: from, pid: 123, pidStartedAt: 321, lastError: error, nextRetryAt: 500 })
      const before = structuredClone(original)
      const legal = edges[from].includes(to)
      assert.equal(isLegalTransition(from, to), legal)
      const apply = () => transition(original, to, { trigger: 'dispatch', reason: 'explicit reason', output, error, nextRetryAt: 900, now: 100 })
      if (!legal) {
        assert.throws(apply, (caught) => {
          assert.ok(caught instanceof IllegalTransitionError)
          assert.equal(caught.name, 'IllegalTransitionError')
          assert.equal(caught.message, `IllegalTransition: ${from} -> ${to} (dispatch)`)
          assert.equal(caught.from, from)
          assert.equal(caught.to, to)
          assert.equal(caught.reason, 'dispatch')
          return true
        })
      } else {
        const next = apply()
        assert.notEqual(next, original)
        assert.equal(next.status, to)
        assert.equal(next.prevStatus, from)
        assert.equal(next.statusReason, 'explicit reason')
        assert.equal(next.enteredStatusAt, 100)
        assert.equal(next.updatedAt, 100)
        assert.equal(next.createdAt, original.createdAt)
        assert.equal(next.attempt, original.attempt)
        assert.equal(next.progress, original.progress)
        const clearsPid = ['completed', 'failed', 'cancelled', 'paused', 'retry-scheduled'].includes(to)
        assert.equal(next.pid, clearsPid ? null : 123)
        assert.equal(next.pidStartedAt, clearsPid ? null : 321)
        assert.equal(next.output, to === 'completed' ? output : original.output)
        assert.equal(next.lastError, to === 'completed' ? null : error)
        assert.equal(next.nextRetryAt, to === 'retry-scheduled' ? 900 : 500)
      }
      assert.deepEqual(original, before)
    })
  }
}

test('FSM destination guards and error constructor preserve exact reasons', () => {
  for (const from of ['running', 'processing'] as const) {
    for (const invalid of [undefined, { ...output, size: 0 }, { ...output, size: -1 }]) {
      const reason = invalid ? 'completed requires output.size > 0' : 'finalize-success requires output'
      assert.throws(() => transition(task('guard', { status: from }), 'completed', { trigger: 'finalize-success', output: invalid }), {
        name: 'IllegalTransitionError', message: `IllegalTransition: ${from} -> completed (${reason})`, from, to: 'completed', reason
      })
    }
    for (const nextRetryAt of [undefined, 0, -1]) {
      assert.throws(() => transition(task('guard', { status: from }), 'retry-scheduled', { trigger: 'finalize-error', nextRetryAt }), {
        name: 'IllegalTransitionError', message: `IllegalTransition: ${from} -> retry-scheduled (retry-scheduled requires nextRetryAt)`, from, to: 'retry-scheduled', reason: 'retry-scheduled requires nextRetryAt'
      })
    }
    // Guards compare <= 0; neither NaN nor Infinity is rejected.
    for (const size of [NaN, Infinity]) assert.equal(transition(task('nan', { status: from }), 'completed', { trigger: 'finalize-success', output: { ...output, size } }).output?.size, size)
    for (const nextRetryAt of [NaN, Infinity]) assert.equal(transition(task('nan', { status: from }), 'retry-scheduled', { trigger: 'finalize-error', nextRetryAt }).nextRetryAt, nextRetryAt)
  }
  for (const reason of [undefined, '']) {
    const caught = new IllegalTransitionError('queued', 'completed', reason)
    assert.equal(caught.message, 'IllegalTransition: queued -> completed')
    assert.equal(caught.reason, reason)
  }
})

test('FSM all triggers affect fields only in their destination branches', () => {
  const triggers: TransitionTrigger[] = ['dispatch', 'pause', 'cancel', 'progressing', 'finalize-success', 'finalize-error', 'retry-tick', 'resume', 'fail', 'retry-manual', 'requeue', 'crash-recovery']
  for (const trigger of triggers) {
    const old = task('trigger', { status: 'retry-scheduled', attempt: 3, nextRetryAt: 50, lastError: error, pid: 7, pidStartedAt: 8, output })
    const next = transition(old, 'queued', { trigger, now: 100 })
    assert.equal(next.attempt, trigger === 'retry-tick' ? 4 : trigger === 'retry-manual' ? 0 : 3)
    assert.equal(next.nextRetryAt, ['retry-tick', 'retry-manual', 'requeue', 'resume'].includes(trigger) ? null : 50)
    assert.equal(next.lastError, ['retry-manual', 'requeue'].includes(trigger) ? null : error)
    assert.equal(next.pid, 7)
    assert.equal(next.pidStartedAt, 8)
    assert.equal(next.output, output)
    assert.equal(next.statusReason, null)
    // Trigger names do not constrain legal edges, nor do they imply required error data.
    const failed = transition(task('running', { status: 'running', lastError: error }), 'failed', { trigger, now: 101 })
    assert.equal(failed.lastError, error)
  }
  for (const from of ['failed', 'cancelled'] as const) {
    for (const trigger of ['retry-manual', 'requeue'] as const) {
      const old = task('terminal', { status: from, attempt: 3, input: { kind: 'video', url: 'u', options: { startedAt: 11, completedAt: 22, extra: true } }, output, lastError: error })
      const next = transition(old, 'queued', { trigger, reason: '', now: 100 })
      assert.deepEqual(next.input.options, { startedAt: 11, completedAt: undefined, extra: true })
      assert.equal(Object.hasOwn(next.input.options ?? {}, 'completedAt'), true)
      assert.equal(next.output, output)
      assert.equal(next.attempt, trigger === 'retry-manual' ? 0 : 3)
      assert.equal(next.statusReason, '')
      assert.equal(old.input.options?.completedAt, 22)
    }
  }
  for (const attempt of [0, 1, 4]) {
    for (const startedAt of [undefined, null, 0, 11]) {
      const old = task('start', { status: 'queued', attempt, input: { kind: 'video', url: 'u', options: { startedAt, extra: 1 } } })
      const next = transition(old, 'running', { trigger: 'dispatch', now: 99 })
      assert.equal(next.attempt, attempt === 0 ? 1 : attempt)
      assert.deepEqual(next.input.options, { startedAt: startedAt ?? 99, extra: 1 })
      assert.notEqual(next.input, old.input)
    }
  }
  const noOptions = transition(task('no-options', { status: 'queued' }), 'running', { trigger: 'dispatch', now: 99 })
  assert.deepEqual(noOptions.input.options, { startedAt: 99 })
  const paused = task('paused', { status: 'paused', attempt: 2, nextRetryAt: 88 })
  assert.equal(transition(paused, 'queued', { trigger: 'resume' }).attempt, 2)
  for (const to of ['failed', 'retry-scheduled'] as const) {
    const next = transition(task('errors', { status: 'running', lastError: error }), to, { trigger: 'fail', error: virtualError('disk-full', 'full'), nextRetryAt: 1 })
    assert.equal(next.lastError?.category, 'disk-full')
  }
})

test('FSM default clock and nullish reasons use their legacy defaults', (t) => {
  t.mock.method(Date, 'now', () => 123456)
  for (const reason of [undefined, null, '']) {
    const old = task('clock', { status: 'running', input: { kind: 'video', url: 'u', options: { startedAt: 7, completedAt: 8 } } })
    const next = transition(old, 'completed', { trigger: 'finalize-success', output, reason })
    assert.equal(next.enteredStatusAt, 123456)
    assert.equal(next.updatedAt, 123456)
    assert.equal(next.statusReason, reason ?? null)
    assert.equal(next.input, old.input)
    assert.deepEqual(next.input.options, { startedAt: 7, completedAt: 8 })
  }
})

const ruleCases: Array<{ category: ErrorCategory; matches: string[]; miss: string; max: number; backoff: number | null; key: string; hints: string[] }> = [
  { category: 'http-429', matches: ['HTTP Error 429', 'Too Many Requests'], miss: 'HTTP Error 428 Too Many Request', max: 3, backoff: 30000, key: 'http429', hints: ['retry-later'] },
  { category: 'auth-required', matches: ['Sign in to confirm', 'Login required', 'Private video', 'Private profile', 'members-only', 'cookies are no longer valid', 'redirect to login page', 'redirect to challenge page', 'authentication required'], miss: 'Login optional; Private channel; members only; redirect to welcome page', max: 0, backoff: null, key: 'authRequired', hints: ['import-cookies'] },
  { category: 'geo-blocked', matches: ['not available in your country', 'geo-restricted', 'geo restricted', "content isn't available in your country"], miss: 'not available in another country; geo_restricted', max: 0, backoff: null, key: 'geoBlocked', hints: ['set-proxy'] },
  { category: 'not-found', matches: ['HTTP Error 404', 'Video unavailable', 'This video has been removed', 'Requested format is not available', 'NotFoundError', 'profile not found'], miss: 'HTTP Error 403; Video available; profile missing', max: 0, backoff: null, key: 'notFound', hints: ['remove-task'] },
  { category: 'disk-full', matches: ['ENOSPC', 'No space left on device'], miss: 'ENOSPS; No space left on disk', max: 0, backoff: null, key: 'diskFull', hints: ['open-folder', 'free-disk'] },
  { category: 'permission-denied', matches: ['EACCES', 'EPERM', 'Permission denied'], miss: 'EACCE; EPER; Permission allowed', max: 0, backoff: null, key: 'permissionDenied', hints: ['choose-folder'] },
  { category: 'binary-missing', matches: ['yt-dlp executable not found', 'gallery-dl executable not found', 'ffmpeg executable not found', 'ffprobe executable not found'], miss: 'yt_dlp executable missing', max: 0, backoff: null, key: 'binaryMissing', hints: ['report-bug'] },
  { category: 'ffmpeg', matches: ['ffmpeg', 'Postprocessing', 'Conversion failed'], miss: 'ffmpe; Postprocess; Conversion succeeded', max: 1, backoff: 5000, key: 'ffmpeg', hints: ['report-bug'] },
  { category: 'network-transient', matches: ['socket hang up', 'ECONNRESET', 'ECONNREFUSED', 'getaddrinfo ENOTFOUND', 'Connection timed out', 'HTTP Error 500', 'HTTP Error 599', 'Read timed out'], miss: 'ECONNRESE; HTTP Error 499; Read timeout', max: 5, backoff: null, key: 'networkTransient', hints: ['retry'] },
  { category: 'stalled', matches: [], miss: 'stalled', max: 3, backoff: 5000, key: 'stalled', hints: ['retry'] },
  { category: 'cancelled-by-user', matches: [], miss: 'cancelled-by-user', max: 0, backoff: null, key: 'cancelledByUser', hints: [] },
  { category: 'output-missing', matches: [], miss: 'output-missing', max: 0, backoff: null, key: 'outputMissing', hints: ['report-bug'] },
  { category: 'unknown', matches: [], miss: 'unrecognized message', max: 1, backoff: null, key: 'unknown', hints: ['retry', 'report-bug'] }
]
for (const r of ruleCases) {
  test(`classifier ${r.category}: alternatives, near miss, defaults and virtual metadata`, () => {
    for (const match of r.matches) {
      for (const stderr of [match, match.toUpperCase()]) {
        assert.deepEqual(classify({ stderr, exitCode: 2 }), { category: r.category, exitCode: 2, rawMessage: stderr, uiMessageKey: `task.error.${r.key}`, uiActionHints: r.hints, retryable: r.max > 0, suggestedRetryAfterMs: r.backoff })
      }
    }
    assert.equal(classify({ stderr: r.miss }).category, 'unknown')
    assert.equal(defaultMaxAttempts(r.category), r.max)
    assert.equal(getRuleForCategory(r.category).defaultBackoffMs, r.backoff)
    assert.deepEqual(virtualError(r.category, 'token=synthetic-secret'), { category: r.category, exitCode: null, rawMessage: 'token=synthetic-secret', uiMessageKey: `task.error.${r.key}`, uiActionHints: r.hints, retryable: r.max > 0, suggestedRetryAfterMs: r.backoff })
  })
}

test('classifier first match is rule order, not stderr occurrence; exit 127 has precedence', () => {
  const regexRules = ruleCases.filter((r) => r.matches.length > 0)
  for (const [i, first] of regexRules.entries()) {
    for (const later of regexRules.slice(i + 1)) {
      assert.equal(classify({ stderr: `${later.matches[0]}\n${first.matches[0]}` }).category, first.category)
    }
  }
  assert.equal(classify({ stderr: '', exitCode: 127 }).category, 'binary-missing')
  assert.equal(classify({ stderr: 'ffmpeg Conversion failed', exitCode: 127 }).category, 'binary-missing')
  assert.equal(classify({ stderr: 'Permission denied', exitCode: 127 }).category, 'permission-denied')
  assert.equal(classify({ stderr: '' }).exitCode, null)
  assert.equal(classify({ stderr: '', exitCode: 0 }).exitCode, 0)
})

test('Retry-After parses explicit and stderr seconds/date values with precedence and fallbacks', (t) => {
  t.mock.method(Date, 'now', () => 1700000000000)
  const future = new Date(1700000045000).toUTCString()
  const past = new Date(1699999999000).toUTCString()
  for (const [header, expected] of [[undefined, null], [null, null], ['', null], ['  ', null], ['invalid-date', null], [' 0002 ', 2000], ['0', 0], [future, 45000], [past, 0]] as const) assert.equal(parseRetryAfter(header), expected)
  for (const value of ['12', future]) {
    const expected = value === '12' ? 12000 : 45000
    assert.equal(classify({ stderr: 'HTTP Error 429', retryAfterHeader: value }).suggestedRetryAfterMs, expected)
    assert.equal(classify({ stderr: `HTTP Error 429\nRetry-After: ${value}` }).suggestedRetryAfterMs, expected)
  }
  assert.equal(classify({ stderr: 'HTTP Error 429\nretry-after: 9', retryAfterHeader: '0' }).suggestedRetryAfterMs, 0)
  assert.equal(classify({ stderr: 'HTTP Error 429\nRetry-After: 9', retryAfterHeader: 'bad' }).suggestedRetryAfterMs, 9000)
  assert.equal(classify({ stderr: 'HTTP Error 429\nRetry-After: bad' }).suggestedRetryAfterMs, 30000)
  assert.equal(classify({ stderr: 'HTTP Error 429' }).suggestedRetryAfterMs, 30000)
  assert.equal(classify({ stderr: 'ECONNRESET\nRetry-After: 9', retryAfterHeader: '8' }).suggestedRetryAfterMs, null)
})

test('sanitization redacts every pattern and classify matches original text before redaction', () => {
  const cases = [
    ['Authorization: Bearer synthetic', 'Authorization: <redacted>'], ['COOKIE: session=synthetic', 'COOKIE: <redacted>'],
    ['x-api-key: synthetic', 'x-api-key: <redacted>'], ['X-Auth-Token: synthetic', 'X-Auth-Token: <redacted>'],
    ['--cookies file.txt', '--cookies: <redacted>'], ['--cookies "a file.txt"', '--cookies: <redacted>'], ["--cookies-from-browser 'firefox profile'", '--cookies-from-browser: <redacted>'],
    ['token=synthetic&keep=1 secret=synthetic password=synthetic', 'token: <redacted>&keep=1 secret: <redacted> password: <redacted>']
  ] as const
  for (const [raw, sanitized] of cases) {
    assert.equal(sanitizeOutput(raw), sanitized)
    assert.equal(classify({ stderr: raw }).rawMessage, sanitized)
  }
  assert.equal(sanitizeOutput('hello\r\nAuthorization: one\r\nCookie: two\nend'), 'hello\r\nAuthorization: <redacted>\r\nCookie: <redacted>\nend')
  const classified = classify({ stderr: 'Authorization: HTTP Error 429\npublic text' })
  assert.equal(classified.category, 'http-429')
  assert.equal(classified.rawMessage, 'Authorization: <redacted>\npublic text')
})

test('stderr tail preserves short logs and uses approximate character-chunk limits', () => {
  assert.equal(takeStderrTail(''), '')
  assert.equal(takeStderrTail('a'.repeat(8192)), 'a'.repeat(8192))
  assert.equal(takeStderrTail('a'.repeat(8193)), 'a'.repeat(7374))
  assert.equal(takeStderrTail('0123456789'.repeat(10), 90), '0123456789'.repeat(9))
  const unicode = '🎞️'.repeat(3000)
  const tail = takeStderrTail(unicode)
  assert.ok(Buffer.byteLength(tail) <= 8192)
  assert.ok(unicode.endsWith(tail))
  assert.equal(classify({ stderr: `HTTP Error 429${'z'.repeat(9000)}` }).category, 'unknown')
  assert.equal(classify({ stderr: `${'z'.repeat(9000)}HTTP Error 429` }).category, 'http-429')
  assert.ok(Buffer.byteLength(classify({ stderr: unicode }).rawMessage) <= 8192)
})

const legacyStatuses = ['pending', 'downloading', 'processing', 'pending', 'pending', 'completed', 'error', 'cancelled']
for (const [i, status] of statuses.entries()) {
  test(`projection status ${status} preserves progress/error metadata with conditional fields`, () => {
    const projected = projectTaskToLegacy(task('status', { status, lastError: error, nextRetryAt: 77, enteredStatusAt: 99, progress: { ...EMPTY_PROGRESS, percent: 0.25 } }))
    assert.equal(legacyDownloadStatusOf(status), legacyStatuses[i])
    assert.equal(projected.status, legacyStatuses[i])
    assert.equal(projected.internalStatus, status)
    const sub = ['queued', 'paused', 'retry-scheduled'].includes(status) ? status : undefined
    assert.equal(legacySubStatusOf(status), sub)
    assert.equal(projected.subStatus, sub)
    assert.equal(Object.hasOwn(projected, 'subStatus'), sub !== undefined)
    assert.equal(projected.completedAt, ['completed', 'failed', 'cancelled'].includes(status) ? 99 : undefined)
    assert.equal(projected.nextRetryAt, status === 'retry-scheduled' ? 77 : undefined)
    assert.equal(Object.hasOwn(projected, 'nextRetryAt'), status === 'retry-scheduled')
    assert.equal(projected.errorCategory, 'network-transient')
    assert.equal(projected.uiMessageKey, 'task.error.networkTransient')
    assert.equal(projected.error, status === 'failed' ? 'connection lost' : undefined)
    assert.equal(Object.hasOwn(projected, 'error'), status === 'failed')
    assert.equal(projected.progress?.percent, 25)
  })
}

test('projection baseline pins own undefined keys separately from absent conditional keys', () => {
  const p = projectTaskToLegacy(task('base', { status: 'queued' }))
  const defined = { id: 'base', url: 'https://example.com/video', type: 'video', status: 'pending', internalStatus: 'queued', statusReason: null, createdAt: 1, attempt: 1, maxAttempts: 5, subStatus: 'queued' }
  const undefinedKeys = ['title', 'thumbnail', 'description', 'channel', 'uploader', 'viewCount', 'tags', 'duration', 'playlistId', 'playlistTitle', 'playlistIndex', 'playlistSize', 'sourceMediaKind', 'collectionSummary', 'mediaKind', 'batchId', 'batchKind', 'batchTitle', 'batchCategory', 'batchOrder', 'batchSourceCount', 'batchAssetCount', 'fileSize', 'startedAt', 'completedAt', 'downloadPath']
  assert.deepEqual(p, { ...Object.fromEntries(undefinedKeys.map((key) => [key, undefined])), ...defined })
  for (const key of ['speed', 'progress', 'cookieSources', 'filePath', 'savedFileName', 'outputDirectory', 'fileCount', 'downloadedCount', 'skippedCount', 'failedCount', 'totalSize', 'resolvedFormatId', 'subtitleStatus', 'subtitleLanguages', 'error', 'errorCategory', 'uiMessageKey', 'nextRetryAt']) assert.equal(Object.hasOwn(p, key), false, key)
})

test('projection forwards host options and input metadata, preserves zero timestamps and clones tags', () => {
  const options = { description: '', channel: 'channel', uploader: 'uploader', viewCount: 0, tags: ['tag'], duration: 7, playlistTitle: 'playlist', playlistSize: 0, sourceMediaKind: 'mixed', mediaKind: 'photo', batchId: 'batch', batchKind: 'social-media', batchTitle: 'title', batchCategory: 'category', batchOrder: 0, batchSourceCount: 0, batchAssetCount: 0, fileSize: 0, startedAt: 0, completedAt: 0, downloadPath: '' }
  const p = projectTaskToLegacy(task('metadata', { input: { kind: 'video', url: 'url', title: 'title', thumbnail: 'thumb', playlistId: 'list', playlistIndex: 0, options } }))
  for (const [key, value] of Object.entries(options)) assert.deepEqual(Reflect.get(p, key), value, key)
  assert.notEqual(p.tags, options.tags)
  assert.equal(p.playlistId, 'list')
  assert.equal(p.playlistIndex, 0)
  assert.equal(p.title, 'title')
  assert.equal(p.thumbnail, 'thumb')
  assert.equal(p.url, 'url')
  const emptyTags = projectTaskToLegacy(task('empty-tags', { input: { kind: 'video', url: 'u', options: { tags: [] } } }))
  assert.deepEqual(emptyTags.tags, [])
})

test('projection percent, sparse progress, bytes, speed, ETA and duration formats', () => {
  for (const [percent, expected] of [[-1, 0], [0, 0], [0.12345, 12.345], [1, 100], [2, 100]] as const) {
    assert.deepEqual(projectTaskToLegacy(task('percent', { progress: { ...EMPTY_PROGRESS, percent } })).progress, { percent: expected, indeterminate: false, currentSpeed: undefined, eta: undefined, downloaded: undefined, total: undefined })
  }
  const sparse = projectTaskToLegacy(task('sparse', { progress: { ...EMPTY_PROGRESS, bytesDownloaded: 0 } }))
  assert.deepEqual(sparse.progress, { percent: 0, indeterminate: true, currentSpeed: undefined, eta: undefined, downloaded: '0B', total: undefined })
  for (const patch of [{ bytesTotal: 1 }, { speedBps: 1 }, { etaMs: 1 }, { ticks: 1 }]) {
    const p = projectTaskToLegacy(task('sparse-only', { progress: { ...EMPTY_PROGRESS, ...patch } }))
    assert.equal(Object.hasOwn(p, 'progress'), false)
    assert.equal(Object.hasOwn(p, 'speed'), false)
  }
  for (const [bytes, expected] of [[-1, '-1B'], [0, '0B'], [1023, '1023B'], [1024, '1.00KB'], [1536, '1.50KB'], [1024 ** 2, '1.00MB'], [1024 ** 3, '1.00GB'], [1024 ** 4, '1.00TB'], [1024 ** 5, '1024.00TB']] as const) {
    const p = projectTaskToLegacy(task('bytes', { progress: { ...EMPTY_PROGRESS, bytesDownloaded: bytes, bytesTotal: bytes, speedBps: bytes } }))
    assert.equal(p.progress?.downloaded, expected)
    assert.equal(p.progress?.total, expected)
    assert.equal(p.progress?.currentSpeed, `${expected}/s`)
    assert.equal(p.speed, `${expected}/s`)
  }
  for (const [etaMs, expected] of [[-1, '0:00'], [999, '0:00'], [1000, '0:01'], [59999, '0:59'], [60000, '1:00'], [3599999, '59:59'], [3600000, '1:00:00'], [3661000, '1:01:01'], [90061000, '25:01:01']] as const) assert.equal(projectTaskToLegacy(task('eta', { progress: { ...EMPTY_PROGRESS, percent: 0, etaMs } })).progress?.eta, expected)
  for (const [durationMs, expected] of [[null, 77], [0, 0], [499, 0], [500, 1], [1499, 1], [1500, 2]] as const) assert.equal(projectTaskToLegacy(task('duration', { input: { kind: 'video', url: 'u', options: { duration: 77 } }, output: { ...output, durationMs } })).duration, expected)
})

test('projection audio detection checks task kind and only conversion options.type', () => {
  const kinds: TaskKind[] = ['video', 'audio', 'subtitles', 'playlist', 'instagram-profile-category', 'pinterest-gallery', 'vsco-gallery', 'facebook-gallery', 'social-media', 'tiktok-photo', 'threads-post', 'threads-profile', 'snapchat-media', 'subscription-item', 'yt-dlp-forward', 'transcription', 'conversion', 'model-download']
  for (const kind of kinds) {
    for (const type of [undefined, 'audio', 'video', 'Audio']) {
      const p = projectTaskToLegacy(task('kind', { kind, input: { kind: 'audio', url: 'u', options: { type } } }))
      assert.equal(p.type, kind === 'audio' || (kind === 'conversion' && type === 'audio') ? 'audio' : 'video')
    }
  }
})

const summary = { posts: 1, images: 1, videos: 0, downloaded: 1, existing: 0, failed: 0, totalSize: 10, reason: 'exhausted' as const, manifestPath: '/dl/.vidbee/social.sqlite', startedAt: 1 }

test('projection output field presence, precedence, path variants and shallow copies', () => {
  const cookies = [{ type: 'browser' as const, browser: 'firefox' }]
  const languages = ['en']
  const out: TaskOutput = { ...output, durationMs: 1500, outputDirectory: '', fileCount: 0, downloadedCount: 0, skippedCount: 0, failedCount: 0, totalSize: 0, formatId: '137+140', subtitleStatus: 'unavailable', subtitleLanguages: languages, cookieSources: cookies, collectionSummary: summary, transcript: { resultKind: 'transcript', transcriptId: 't' }, subtitleAcquisition: { id: 's', acquiredAt: 1 } }
  const p = projectTaskToLegacy(task('output', { output: out, progress: { ...EMPTY_PROGRESS, collectionSummary: { ...summary, images: 5 } }, input: { kind: 'video', url: 'u', options: { fileSize: 999, duration: 999, downloadPath: '/ignored' } } }))
  assert.equal(p.fileSize, 10)
  assert.equal(p.duration, 2)
  assert.equal(p.downloadPath, '')
  assert.equal(p.outputDirectory, '')
  assert.equal(p.filePath, output.filePath)
  assert.equal(p.savedFileName, 'media.mp4')
  for (const key of ['fileCount', 'downloadedCount', 'skippedCount', 'failedCount', 'totalSize']) assert.equal(Reflect.get(p, key), 0)
  assert.equal(p.resolvedFormatId, '137+140')
  assert.equal(p.subtitleStatus, 'unavailable')
  assert.equal(p.collectionSummary, summary)
  assert.deepEqual(p.cookieSources, cookies)
  assert.notEqual(p.cookieSources, cookies)
  assert.notEqual(p.cookieSources?.[0], cookies[0])
  assert.deepEqual(p.subtitleLanguages, languages)
  assert.notEqual(p.subtitleLanguages, languages)
  assert.equal(Object.hasOwn(p, 'transcript'), false)
  assert.equal(Object.hasOwn(p, 'subtitleAcquisition'), false)
  const bare = projectTaskToLegacy(task('bare-output', { output }))
  for (const key of ['filePath', 'savedFileName', 'outputDirectory', 'fileCount', 'downloadedCount', 'skippedCount', 'failedCount', 'totalSize']) assert.equal(Object.hasOwn(bare, key), true, key)
  for (const key of ['cookieSources', 'subtitleLanguages', 'resolvedFormatId', 'subtitleStatus']) assert.equal(Object.hasOwn(bare, key), false, key)
  const empty = projectTaskToLegacy(task('empty-arrays', { output: { ...output, cookieSources: [], subtitleLanguages: [], formatId: '' } }))
  assert.deepEqual(empty.cookieSources, [])
  assert.deepEqual(empty.subtitleLanguages, [])
  assert.equal(Object.hasOwn(empty, 'resolvedFormatId'), false)
  for (const [filePath, savedFileName, downloadPath] of [['/dl/nested/a.mp4', 'a.mp4', '/dl/nested'], ['C:\\dl\\a.mp4', 'a.mp4', 'C:\\dl'], ['a.mp4', 'a.mp4', ''], ['/dl/', '', '/dl'], ['', '', '']] as const) {
    const path = projectTaskToLegacy(task('path', { output: { ...output, filePath } }))
    assert.equal(path.filePath, filePath || undefined)
    assert.equal(path.savedFileName, savedFileName)
    assert.equal(path.downloadPath, downloadPath)
  }
  assert.equal(Object.hasOwn(projectTaskToLegacy(task('retry-null', { status: 'retry-scheduled' })), 'nextRetryAt'), false)
  assert.equal(projectTaskToLegacy(task('retry-zero', { status: 'retry-scheduled', nextRetryAt: 0 })).nextRetryAt, 0)
})

test('projection social manifest suppression, summary fallback and image/video/mixed inference', () => {
  for (const [images, videos, expected] of [[1, 0, 'image'], [0, 1, 'video'], [1, 1, 'mixed'], [0, 0, 'mixed']] as const) {
    const s = { ...summary, images, videos }
    const base = task('social', { kind: 'social-media', input: { kind: 'social-media', url: 'u', options: { sourceMediaKind: 'mixed' } }, progress: { ...EMPTY_PROGRESS, collectionSummary: s } })
    const noOutput = projectTaskToLegacy(base)
    assert.equal(noOutput.collectionSummary, s)
    assert.equal(noOutput.sourceMediaKind, expected)
    assert.equal(noOutput.outputDirectory, '/dl')
    assert.equal(noOutput.downloadPath, '/dl')
    const manifest = projectTaskToLegacy({ ...base, output: { ...output, filePath: s.manifestPath } })
    assert.equal(Object.hasOwn(manifest, 'filePath'), true)
    assert.equal(manifest.filePath, undefined)
    assert.equal(manifest.savedFileName, undefined)
    // The output block overwrites the summary-derived root with the manifest's dirname.
    assert.equal(manifest.downloadPath, '/dl/.vidbee')
    assert.equal(manifest.outputDirectory, undefined)
    const media = projectTaskToLegacy({ ...base, output: { ...output, filePath: '/dl/assets/a.mp4', outputDirectory: '/dl', collectionSummary: s } })
    assert.equal(media.filePath, '/dl/assets/a.mp4')
    assert.equal(media.savedFileName, 'a.mp4')
    assert.equal(media.downloadPath, '/dl')
  }
  const ordinary = projectTaskToLegacy(task('ordinary', { output: { ...output, filePath: summary.manifestPath, collectionSummary: summary } }))
  assert.equal(ordinary.filePath, summary.manifestPath)
  assert.equal(ordinary.savedFileName, 'social.sqlite')
  const optionsOnly = projectTaskToLegacy(task('options-summary', { input: { kind: 'video', url: 'u', options: { collectionSummary: summary } } }))
  assert.equal(optionsOnly.collectionSummary, undefined)
})

test('Linux process helpers read the own process, inject start reader and kill only owned children', { skip: process.platform !== 'linux', timeout: 10000 }, async () => {
  assert.deepEqual(backgroundChildSpawnOptions(), { detached: true })
  assert.notEqual(backgroundChildSpawnOptions(), backgroundChildSpawnOptions())
  assert.equal(FFMPEG_ENCODE_THREADS, '2')
  assert.equal(isPidAlive(process.pid), true)
  assert.equal(isPidAlive(-1), false)
  assert.equal(readPidStartTime(-1), null)
  const raw = readFileSync(`/proc/${process.pid}/stat`, 'utf8')
  const ticks = Number(raw.slice(raw.lastIndexOf(')') + 2).split(' ')[19])
  const boot = Number(readFileSync('/proc/stat', 'utf8').match(/^btime\s+(\d+)/m)?.[1])
  const hz = Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }).trim())
  const actualStart = readPidStartTime(process.pid)
  assert.equal(actualStart, (boot + ticks / hz) * 1000)
  assert.ok(typeof actualStart === 'number' && actualStart > 0)
  // The API has no reset function; restore a Linux reader rather than retain the fake.
  const linuxReader = (pid: number): number | null => {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    const startTicks = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19])
    return (boot + startTicks / hz) * 1000
  }
  try {
    let seen: number | undefined
    setReadPidStartTimeImpl((pid) => { seen = pid; return 12345 })
    assert.equal(readPidStartTime(321), 12345)
    assert.equal(seen, 321)
    setReadPidStartTimeImpl(() => null)
    assert.equal(readPidStartTime(process.pid), null)
    setReadPidStartTimeImpl(() => { throw new Error('synthetic read failure') })
    assert.equal(readPidStartTime(process.pid), null)
  } finally {
    setReadPidStartTimeImpl(linuxReader)
  }
  assert.equal(readPidStartTime(process.pid), actualStart)
  for (const detached of [false, true]) {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached, stdio: 'ignore' })
    const closed = once(child, 'close')
    await once(child, 'spawn')
    assert.ok(child.pid)
    try {
      assert.equal(isPidAlive(child.pid), true)
      assert.ok(readPidStartTime(child.pid) != null)
      killProcessTree(child.pid, detached ? 'SIGKILL' : 'SIGTERM')
      const [code, signal] = await closed
      assert.equal(code, null)
      assert.equal(signal, detached ? 'SIGKILL' : 'SIGTERM')
      assert.equal(isPidAlive(child.pid), false)
      assert.equal(readPidStartTime(child.pid), null)
      killProcessTree(child.pid)
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL')
        await closed
      }
    }
  }
  for (const pid of [undefined, 0, -1]) assert.doesNotThrow(() => killProcessTree(pid))
})
