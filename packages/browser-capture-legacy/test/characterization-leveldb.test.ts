import { ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it } from '@effect/vitest'
import { type ExecutorContext, type ExecutorFinishEvent, virtualError } from '@vidbee/task-queue-legacy'
import { vi } from 'vitest'

const host = vi.hoisted(() => ({
  profile: '', spawn: vi.fn(), candidates: vi.fn(),
  temporary: [] as string[], copied: [] as string[], removed: [] as string[], failCleanup: false
}))
vi.mock('../src/availability', () => ({
  isBrowserCaptureAvailable: () => true,
  resolveBrowserExecutable: () => '/synthetic/chromium',
  userHomeDir: () => '/synthetic/home',
  DEFAULT_CAPTURE_SIZE: { width: 3840, height: 3840 }
}))
vi.mock('@vidbee/downloader-core/cookie-browser-paths', () => ({ getBrowserProfileCandidates: host.candidates }))
vi.mock('node:child_process', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:child_process')>(), spawn: host.spawn
}))
vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...original,
    mkdtemp: async (prefix: string) => {
      const created = await original.mkdtemp(prefix)
      host.temporary.push(created)
      return created
    },
    copyFile: async (source: string, destination: string) => {
      host.copied.push(path.basename(source))
      await original.copyFile(source, destination)
    },
    rm: async (target: string, options: Parameters<typeof original.rm>[1]) => {
      host.removed.push(target)
      if (host.failCleanup && path.basename(target).startsWith('vidbee-ls-')) {
        throw new Error('synthetic cleanup denied')
      }
      await original.rm(target, options)
    }
  }
})
import { BrowserCaptureExecutor } from '@vidbee/browser-capture-legacy'

const tokenA = 'a'.repeat(40)
const tokenB = 'b'.repeat(40)
const magic = Buffer.from([0x57, 0xfb, 0x80, 0x8b, 0x24, 0x75, 0x47, 0xdb])
const wal = (token = tokenA, encoding: BufferEncoding = 'latin1') => Buffer.from(`bcTokenSha\0${token}`, encoding)
function varint(value: number): Buffer {
  const bytes: number[] = []
  let remaining = value
  do {
    const byte = remaining % 128
    remaining = Math.floor(remaining / 128)
    bytes.push(byte | (remaining > 0 ? 0x80 : 0))
  } while (remaining > 0)
  return Buffer.from(bytes)
}
function snappyLiteral(blob: Buffer): Buffer {
  const chunks: Buffer[] = [varint(blob.length)]
  for (let offset = 0; offset < blob.length; offset += 60) {
    const part = blob.subarray(offset, offset + 60)
    chunks.push(Buffer.from([(part.length - 1) << 2]), part)
  }
  return Buffer.concat(chunks)
}
function table(raw: Buffer, compression = 0, offset = varint(0)): Buffer {
  const data = Buffer.concat([raw, Buffer.from([compression, 0, 0, 0, 0])])
  const handle = Buffer.concat([offset, varint(raw.length)])
  const index = Buffer.concat([varint(0), varint(0), varint(handle.length), handle, Buffer.alloc(4)])
  const footer = Buffer.alloc(48)
  Buffer.concat([varint(0), varint(0), varint(data.length), varint(index.length)]).copy(footer)
  magic.copy(footer, 40)
  return Buffer.concat([data, index, Buffer.alloc(5), footer])
}

let scratch = ''
let leveldb = ''
beforeEach(() => {
  vi.clearAllMocks()
  scratch = mkdtempSync(path.join(os.tmpdir(), 'vidbee-leveldb-characterization-'))
  host.profile = path.join(scratch, 'profile')
  leveldb = path.join(host.profile, 'Local Storage', 'leveldb')
  mkdirSync(leveldb, { recursive: true })
  host.temporary.length = 0
  host.copied.length = 0
  host.removed.length = 0
  host.failCleanup = false
  host.candidates.mockReturnValue([host.profile])
})
afterEach(() => {
  for (const directory of host.temporary) rmSync(directory, { force: true, recursive: true })
  rmSync(scratch, { force: true, recursive: true })
})

async function capture(): Promise<{ job: unknown; finished: ExecutorFinishEvent | undefined }> {
  const child = new ChildProcess()
  Object.defineProperties(child, {
    pid: { value: 42 }, stdout: { value: new PassThrough() }, stderr: { value: new PassThrough() }
  })
  host.spawn.mockReturnValue(child)
  const finished: ExecutorFinishEvent[] = []
  const context: ExecutorContext = {
    taskId: 'leveldb-task', attemptId: 'leveldb-attempt', attemptNumber: 1,
    input: { kind: 'video', url: 'https://fixture.invalid/video', title: 'Fixture',
      options: { settings: { browserForCookies: 'chrome' } } }
  }
  const executor = new BrowserCaptureExecutor({
    resolveSidecarScript: () => '/synthetic/sidecar.js', resolveFfmpegPath: () => '/synthetic/ffmpeg',
    defaultDownloadDir: path.join(scratch, 'downloads'), execPath: '/synthetic/node', execArgv: []
  })
  executor.run(context, {
    onSpawn: () => undefined, onStd: () => undefined, onProgress: () => undefined,
    onFinish: (event) => { finished.push(event) }
  })
  await vi.waitFor(() => expect(host.spawn.mock.calls.length + finished.length).toBeGreaterThan(0))
  if (host.spawn.mock.calls.length === 0) return { job: null, finished: finished[0] }
  const args: string[] = host.spawn.mock.calls[0]?.[1] ?? []
  const jobPath = args[args.indexOf('--job') + 1]
  if (!jobPath) throw new Error('Missing synthetic capture job path')
  const job: unknown = JSON.parse(readFileSync(jobPath, 'utf8'))
  child.emit('close', 1)
  await vi.waitFor(() => expect(finished).toHaveLength(1))
  return { job, finished: finished[0] }
}
function expectJob(job: unknown, token: string | null): void {
  expect(job).toEqual({
    url: 'https://fixture.invalid/video', outputPath: path.join(scratch, 'downloads', 'Fixture (browser capture).mp4'),
    ffmpegPath: '/synthetic/ffmpeg', browserExecutable: '/synthetic/chromium', width: 3840, height: 3840,
    ...(token === null ? {} : { localStorage: { bcTokenSha: token } })
  })
  expect(host.candidates.mock.calls).toEqual([[process.platform, '/synthetic/home', 'chrome']])
  expect(host.removed).toEqual(host.temporary.filter((directory) => path.basename(directory).startsWith('vidbee-ls-')))
}

describe('public capture executor copied LevelDB characterization', () => {
  it.each([
    ['latin1 WAL', wal(), tokenA],
    ['UTF16LE WAL', wal(tokenA, 'utf16le'), tokenA],
    ['invalid UTF8 prefix', Buffer.concat([Buffer.from([0xff, 0xfe, 0x80]), wal()]), tokenA],
    ['uncompressed SSTable', table(wal()), tokenA],
    ['literal snappy SSTable', table(snappyLiteral(wal()), 1), tokenA],
    ['truncated table', table(wal()).subarray(0, 35), null],
    ['wrong table magic', Buffer.concat([table(wal()).subarray(0, -8), Buffer.alloc(8)]), null],
    ['unknown compression', table(wal(), 2), null],
    ['invalid block offset', table(wal(), 0, varint(100000)), null],
    ['truncated snappy varint', table(Buffer.from([0x80]), 1), null],
    ['invalid snappy copy offset', table(Buffer.from([40, 1, 1]), 1), null],
    ['truncated snappy extended literal', table(Buffer.from([40, 0xf0]), 1), null],
    ['truncated snappy two-byte copy', table(Buffer.from([40, 2]), 1), null],
    ['truncated snappy four-byte copy', table(Buffer.from([40, 3]), 1), null],
    ['overflowing block offset wraps to zero', table(wal(), 0, varint(2 ** 32)), tokenA],
    ['snappy ignores declared output length', table(Buffer.concat([Buffer.from([0]), snappyLiteral(wal()).subarray(1)]), 1), tokenA],
    ['snappy pads truncated literals with zeroes', table(Buffer.concat([Buffer.from([60, 59 << 2]), wal()]), 1), tokenA],
    ['malformed footer varints', Buffer.concat([table(wal()).subarray(0, -48), Buffer.alloc(40, 0x80), magic]), null]
  ])('pins %s through the capture job', async (name, bytes, expected) => {
    writeFileSync(path.join(leveldb, String(name).includes('WAL') || String(name).includes('UTF8') ? '000001.log' : '000001.ldb'), bytes)
    const result = await capture()
    expectJob(result.job, expected)
  })

  it.each([1, 2, 3, 4])('pins snappy extended literal length with %s size bytes', async (sizeBytes) => {
    const blob = Buffer.concat([wal(), Buffer.alloc(20)])
    const size = Buffer.alloc(sizeBytes)
    size.writeUIntLE(blob.length - 1, 0, sizeBytes)
    const compressed = Buffer.concat([varint(blob.length), Buffer.from([(59 + sizeBytes) << 2]), size, blob])
    writeFileSync(path.join(leveldb, '000001.ldb'), table(compressed, 1))
    expectJob((await capture()).job, tokenA)
  })

  it('pins all three overlapping snappy copy tag forms', async () => {
    for (const kind of [1, 2, 3]) {
      const literal = Buffer.from('bcTokenSha\0aaaa')
      const tail = kind === 1
        ? Buffer.from([1, 1, 17, 1, 17, 1, 17, 1, 17, 1])
        : kind === 2 ? Buffer.from([142, 1, 0]) : Buffer.from([143, 1, 0, 0, 0])
      // Type 1 copies 4 + 8 + 8 + 8 + 8 a's; types 2/3 copy 36 a's.
      const compressed = Buffer.concat([varint(51), Buffer.from([(literal.length - 1) << 2]), literal, tail])
      writeFileSync(path.join(leveldb, '000001.ldb'), table(compressed, 1))
      const result = await capture()
      expectJob(result.job, tokenA)
      host.spawn.mockClear()
      host.candidates.mockClear()
    }
  })

  it.each([
    ['latin1 exact edge', Buffer.concat([Buffer.from('bcTokenSha'), Buffer.alloc(350), Buffer.from(tokenA)]), tokenA],
    ['latin1 outside edge', Buffer.concat([Buffer.from('bcTokenSha'), Buffer.alloc(351), Buffer.from(tokenA)]), null],
    ['UTF16 exact edge', Buffer.concat([Buffer.from('bcTokenSha', 'utf16le'), Buffer.alloc(300), Buffer.from(tokenA, 'utf16le')]), tokenA],
    ['UTF16 outside edge', Buffer.concat([Buffer.from('bcTokenSha', 'utf16le'), Buffer.alloc(302), Buffer.from(tokenA, 'utf16le')]), null],
    ['uppercase token rejected', wal('A'.repeat(40)), null],
    ['later key occurrence', Buffer.concat([wal('x'.repeat(400)), wal(tokenB)]), tokenB]
  ])('pins the 400-byte nearby-value heuristic: %s', async (_name, bytes, expected) => {
    writeFileSync(path.join(leveldb, '000001.log'), bytes)
    expectJob((await capture()).job, expected)
  })

  it('scans copied filenames in reverse lexical order and skips lock/LOG/unrelated files', async () => {
    for (const name of ['LOCK', 'LOG', 'LOG.old', 'LOG000004.log', '000003.txt']) writeFileSync(path.join(leveldb, name), wal('c'.repeat(40)))
    writeFileSync(path.join(leveldb, '000001.log'), wal(tokenA))
    writeFileSync(path.join(leveldb, '000002.ldb'), table(wal(tokenB)))
    expectJob((await capture()).job, tokenB)
    expect(host.copied.slice().sort()).toEqual(['000001.log', '000002.ldb'])
  })

  it('continues past malformed newer blocks and preserves first occurrence within a WAL', async () => {
    writeFileSync(path.join(leveldb, '000003.ldb'), Buffer.from('broken table'))
    writeFileSync(path.join(leveldb, '000002.log'), Buffer.concat([wal(tokenA), wal(tokenB)]))
    writeFileSync(path.join(leveldb, '000001.log'), wal('c'.repeat(40)))
    expectJob((await capture()).job, tokenA)
  })

  it('recovers source copy failures and missing directories as absent tokens and still cleans snapshots', async () => {
    mkdirSync(path.join(leveldb, '000001.log'))
    expectJob((await capture()).job, null)
    host.spawn.mockClear()
    host.candidates.mockClear()
    rmSync(leveldb, { recursive: true })
    expectJob((await capture()).job, null)
  })

  it('propagates snapshot cleanup failure through executor finish and does not spawn or write a job', async () => {
    writeFileSync(path.join(leveldb, '000001.log'), wal())
    host.failCleanup = true
    const result = await capture()
    expect(result.job).toBeNull()
    expect(host.spawn).not.toHaveBeenCalled()
    expect(host.temporary.every((directory) => path.basename(directory).startsWith('vidbee-ls-'))).toBe(true)
    expect(host.removed).toEqual(host.temporary)
    expect(result.finished).toEqual({
      taskId: 'leveldb-task', attemptId: 'leveldb-attempt',
      result: { type: 'error', error: virtualError('unknown', 'synthetic cleanup denied'), exitCode: 1 },
      closedAt: expect.any(Number), stdoutTail: '', stderrTail: ''
    })
  })
})
