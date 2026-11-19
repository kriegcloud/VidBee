import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendManifestChunk, ensureChunkManifest, loadChunkManifest, loadPipelineSeed, manifestWorkKey, sourceFingerprint, writePipelineSeed, transcriptionPartials } from '@vidbee/transcription'
const dirs: string[] = []
const directory = () => { const dir = mkdtempSync(join(tmpdir(), 'transcription-checkpoint-')); dirs.push(dir); return dir }
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
describe('pre-port checkpoint public boundary', () => {
  it('retains permissive shapes/defaults and exponent overflow (section 9 candidates)', { timeout: 30000 }, () => {
    const dir = directory(); const file = join(dir, 'chunks.json')
    const inputs = ['{', 'null', '[]', '7', '{}', '{"key":{"taskId":"t","fingerprint":"f","modelVersion":"v"}}', '{"key":{"taskId":7,"fingerprint":true,"modelVersion":[]},"chunks":"bad","speakers":{},"turns":false,"stages":7,"durationMs":1e999,"extra":{"keep":true}}']
    expect(inputs.map(raw => { writeFileSync(file, raw); return loadChunkManifest(file) })).toMatchSnapshot()
    expect(loadChunkManifest(join(dir, 'absent'))).toBeNull()
  })
  it('keys, atomic publication, matching reuse, mismatch reset and first-time dedup', { timeout: 30000 }, () => {
    const dir = directory(); const input = { workDir: dir, taskId: 'task', fingerprint: '12:34', modelVersion: 'v1' }
    const initial = ensureChunkManifest(input)
    expect(initial.manifest).toMatchSnapshot('empty')
    const chunk = { index: 9, startMs: 100, endMs: 200, speakerKey: null, text: 'first', words: [], confidence: null }
    appendManifestChunk(initial.path, chunk, { durationMs: 500, speakers: [{ speakerKey: 's', displayName: 'Speaker' }] })
    const duplicate = appendManifestChunk(initial.path, { ...chunk, text: 'replacement', index: 0 }, { turns: [{ startMs: 0, endMs: 500, speakerKey: 's' }] })
    expect(duplicate).toMatchSnapshot('duplicate retains first payload but applies extras')
    expect(ensureChunkManifest(input).manifest).toEqual(duplicate)
    expect(readdirSync(dir)).toEqual(['chunks.json'])
    expect(readFileSync(initial.path, 'utf8')).toMatchSnapshot('bytes')
    expect(ensureChunkManifest({ ...input, modelVersion: 'v2' }).manifest).toMatchSnapshot('reset')
    expect([manifestWorkKey('', '', ''), manifestWorkKey('task', '12:34', 'v1'), manifestWorkKey('你好', 'a\0b', 'é')]).toMatchSnapshot('keys')
    const source = join(dir, 'source'); writeFileSync(source, 'hello'); utimesSync(source, 1000, 1234.567)
    expect(sourceFingerprint(source)).toBe('5:1234567')
  })
  it('seed loader defaults, unknown nested data, nonfinite data and write serialization', { timeout: 30000 }, () => {
    const dir = directory(); const file = join(dir, 'seed.json')
    const inputs = ['{', 'null', '{}', '{"segments":[]}', '{"segments":[null,7,{"endMs":1e999,"extra":"keep"}],"language":7,"asrTier":false,"modelVersion":7,"sourceKind":"future","speakers":{}}', '{"segments":[{"text":"hello","startMs":0,"endMs":1,"extra":true}],"speakers":[{"extra":true}],"extra":"outer"}']
    expect(inputs.map(raw => { writeFileSync(file, raw); return loadPipelineSeed(file) })).toMatchSnapshot()
    const seed = { language: null, modelVersion: 'v', asrTier: null, speakers: [], segments: [{ startMs: 0, endMs: Infinity, text: 'hello', speakerKey: null, confidence: NaN }] }
    writePipelineSeed(file, seed)
    expect(readFileSync(file, 'utf8')).toMatchSnapshot('seed bytes nonfinite serializes null')
    expect(loadPipelineSeed(file)).toMatchSnapshot('seed read null times')
    expect(readdirSync(dir)).toEqual(['seed.json'])
  })
})

it('partial singleton stage clock never rewinds history, while visible stage can rewind', { timeout: 30000 }, () => {
  const partials=transcriptionPartials; vi.spyOn(Date,'now').mockReturnValue(1234)
  try {
    const stages = ['queued','preparing-audio','recognizing','preparing-models','diarizing','preparing-audio','committing','committing'] as const
    expect(stages.map(stage => structuredClone(Reflect.apply(partials.setStage, partials, ['checkpoint-stage','checkpoint-download',stage])))).toMatchSnapshot()
    const old=partials.getByTask('checkpoint-stage'); expect(partials.getByDownload('checkpoint-download')).toBe(old)
    const segment={startMs:10,endMs:20,text:'first',speakerKey:null,confidence:null}
    partials.append('checkpoint-stage','checkpoint-download',segment)
    const replacement={...segment,text:'replacement'}; const next=partials.append('checkpoint-stage','checkpoint-download',replacement)
    expect(next.segments).toEqual([replacement]); expect(next.segments[0]).toBe(replacement)
    partials.set('checkpoint-second','checkpoint-download',[]); partials.clear('checkpoint-stage'); expect(partials.getByDownload('checkpoint-download')?.taskId).toBe('checkpoint-second')
    partials.clearByDownload('checkpoint-download'); expect(partials.getByDownload('checkpoint-download')).toBeNull()
  } finally { vi.restoreAllMocks(); partials.clear('checkpoint-stage'); partials.clear('checkpoint-second') }
})
it('stage restore filters elements, preserves unknown keys/overflow and prefers separate stage file', { timeout: 30000 }, () => {
  const dir=directory(); const path=join(dir,'chunks.json'); const stages=join(dir,'stages.json')
  writeFileSync(path,'{"key":{"taskId":"t","fingerprint":"f","modelVersion":"v"},"stages":[{"stage":"embedded","startedAt":1}],"chunks":[{"startMs":20,"endMs":30,"text":"b"},{"startMs":0,"endMs":10,"text":"a"}]}')
  try {
    const inputs=['{','null','{}','[]','[null,7,{"stage":"recognizing","startedAt":1e999,"extra":true},{"stage":7,"startedAt":1},{"stage":"missing"}]']
    expect(inputs.map(raw=>{ writeFileSync(stages,raw); return structuredClone(transcriptionPartials.restoreFromManifest({workDir:dir,taskId:'checkpoint-restore',downloadTaskId:'checkpoint-restore-d'})) })).toMatchSnapshot()
  } finally { transcriptionPartials.clear('checkpoint-restore') }
})
it('atomic writer reports a vanished work directory synchronously and leaves no staging residue', { timeout: 30000 }, () => {
  const dir=directory(); const missing=join(dir,'missing'); const seed={language:null,modelVersion:'v',asrTier:null,speakers:[],segments:[]}
  expect(()=>writePipelineSeed(join(missing,'seed.json'),seed)).toThrow(`cancelled: work dir missing (${missing})`)
  expect(readdirSync(dir)).toEqual([])
})
