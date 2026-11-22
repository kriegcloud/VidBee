import { Transpiler } from 'bun'
// Frozen design corpus: native source-extraction oracle; production declarations/codecs are strict TS.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import { it } from '@effect/vitest'
import { make as makePartials } from '@vidbee/transcription/Partials.layer'
import { PartialsManifest } from '@vidbee/transcription/Partials.service'
import { TranscriptionTime } from '@vidbee/transcription/TranscriptionTime.service'
import * as E from 'effect/Effect'
import * as O from 'effect/Option'
import * as RS from 'effect/rpc/RpcSchema'
import * as Ser from 'effect/rpc/RpcSerialization'
import * as S from 'effect/Schema'
import * as Stream from 'effect/Stream'
import {
  buildTranscriptListSnapshot,
  toTranscriptListSnapshot
} from '../../src/main/lib/transcript-list-snapshot.ts'
import { transcriptStageHistory } from '../../src/main/lib/transcript-stage-history.ts'
import {
  CloudAccepted,
  CloudObservedPipeline
} from '../../src/renderer/src/transport/census/Cloud.model.js'
import { RemoteCaptionSnapshot } from '../../src/renderer/src/transport/census/RemoteCaptions.model.js'
import { TranscriptOperationError } from '../../src/renderer/src/transport/census/Transcript.errors.js'
import * as M from '../../src/renderer/src/transport/census/Transcript.model.js'
import {
  Dependencies,
  Initial,
  TranscriptRpcs
} from '../../src/renderer/src/transport/census/Transcript.rpc.js'
import { DeliveryError } from '../../src/renderer/src/transport/DocumentDelivery.errors.js'
import { RpcObserved } from '../../src/renderer/src/transport/RpcObservation.model.js'

it('frozen Transcript complete declaration and real producer codec census', async () => {
  const V = process.cwd()
  const G = process.cwd()
  const compare = (a, b, path = '$') => {
    assert.equal(typeof a, typeof b, path)
    if (a === null || typeof a !== 'object') {
      assert.ok(Object.is(a, b), path)
      return
    }
    assert.equal(Array.isArray(a), Array.isArray(b), path)
    assert.deepEqual(Object.keys(a), Object.keys(b), path)
    for (const k of Object.keys(a)) {
      compare(a[k], b[k], `${path}.${k}`)
    }
  }
  const round = async (schema, value) => {
    const codec = Ser.json.codecFor(schema)
    const bytes = await E.runPromise(S.encodeEffect(codec)(value))
    const decoded = await E.runPromise(S.decodeUnknownEffect(codec)(bytes))
    compare(value, decoded)
    return decoded
  }
  const golden = JSON.parse(
    fs.readFileSync(`${G}/apps/desktop/test/golden/mcp--get_transcript--words.json`, 'utf8')
  ).result.content[0].text.$jsonText.result
  const record = {
    id: golden.transcriptId,
    downloadTaskId: golden.downloadTaskId,
    transcriptionTaskId: golden.transcriptionTaskId,
    resultKind: 'future-result',
    modelVersion: 'fixture',
    asrTier: 'retired-tier',
    language: golden.language,
    sourceFilePath: golden.sourceFilePath,
    sourceKind: 'asr',
    supersededAt: null,
    createdAt: 1,
    updatedAt: 2,
    speakers: golden.speakers,
    segments: golden.items
  }
  const segment = { speakerKey: null, startMs: -0, endMs: 10, text: 'fixture', confidence: null }
  const stage = {
    stage: 'future-stage',
    startedAt: 1,
    metadata: { attempt: 2, omitted: undefined, n: -0 }
  }
  const partials = await E.runPromise(
    makePartials().pipe(
      E.provideService(PartialsManifest, {
        load: () => E.succeed({ chunks: [segment], stages: [stage] })
      }),
      E.provideService(TranscriptionTime, {
        now: E.succeed(1),
        monotonicMillis: E.succeed(1),
        readMonotonicMillis: () => 1,
        sleep: () => E.void,
        after: () => E.succeed(E.void),
        every: () => E.succeed(E.void),
        microtask: (a) => a
      })
    )
  )
  const restored = await E.runPromise(
    partials.restoreFromManifest({
      workDir: '/fixture',
      taskId: 'task',
      downloadTaskId: 'download'
    })
  )
  const task = {
    id: 'task',
    status: 'running',
    statusReason: 'recognizing',
    enteredStatusAt: 1,
    updatedAt: 2,
    input: { kind: 'transcription', url: 'fixture', options: {} },
    lastError: null
  }
  const view = {
    active: undefined,
    download: undefined,
    downloadTaskId: 'download',
    latest: record,
    selected: record,
    sourceFilePath: record.sourceFilePath,
    sources: golden.sources,
    task,
    title: 'fixture'
  }
  const hostSource = fs.readFileSync(`${V}/apps/desktop/src/main/lib/transcript-host.ts`, 'utf8')
  const finishSource = hostSource.slice(
    hostSource.indexOf('const finishTranscriptSnapshot ='),
    hostSource.indexOf('/**\n * Read one transcript without')
  )
  const js = new Transpiler({ loader: 'ts' }).transformSync(finishSource)
  const finish = new Function(
    'getTranscriptStore',
    'transcriptionPartials',
    'stageFromTask',
    'buildTranscriptListSnapshot',
    'transcriptStageHistory',
    `${js}; return finishTranscriptSnapshot`
  )(
    () => ({ getById: () => record }),
    { getByTask: () => restored },
    () => null,
    buildTranscriptListSnapshot,
    transcriptStageHistory
  )
  const detail = finish(view, true)
  const status = toTranscriptListSnapshot(detail)
  const updated = { ...status, sources: detail.sources }
  assert.equal(detail.stage, 'future-stage')
  assert.deepEqual(detail.stageHistory, [stage])
  const partial = { downloadTaskId: 'download', taskId: '', segments: restored.segments }
  const cue = {
    id: 'cue',
    speakerId: null,
    startMs: -0,
    endMs: 10,
    text: 'fixture',
    confidence: null,
    sortIndex: 0
  }
  const cues = {
    language: null,
    segments: [cue],
    sourceKind: 'asr',
    snapshotSourceKind: null,
    transcriptId: 'record',
    updatedAt: 2
  }
  const catalog = JSON.parse(
    '{"maxAudioSeconds":1e400,"models":[{"extra":{"neg":-0,"nullable":null},"name":"Fixture","creditsPerSecond":1,"id":"fixture"}],"defaultModelId":"fixture"}'
  )
  catalog.ownUndefined = undefined
  const model = {
    ready: true,
    version: 'fixture',
    bytes: 0,
    files: [{ id: 'a', present: false, path: '/fixture', bytes: -0 }],
    tiers: [],
    downloading: { url: 'fixture', received: 0, total: null, tier: undefined },
    downloads: [],
    pendingTiers: undefined,
    machine: undefined,
    language: undefined
  }
  const prep = { ready: true, downloading: false, percent: 100 }
  const history = {
    id: 'download',
    url: 'fixture',
    title: 'fixture',
    type: 'audio',
    status: 'completed',
    downloadedAt: 1,
    agentConversation: undefined
  }
  const imported = {
    imported: [
      {
        path: '/fixture',
        downloadId: 'download',
        created: true,
        reused: false,
        historyItem: history
      }
    ],
    rejected: [{ path: '/missing', reason: 'missing' }]
  }
  const patch = {
    downloadId: 'download',
    segmentId: 'cue',
    speakerId: null,
    text: undefined,
    startMs: -0
  }
  const insert = { downloadId: 'download', afterId: null, beforeId: undefined, text: '' }
  const exportInput = {
    sourcePath: '/fixture',
    subtitleText: 'fixture',
    defaultFileName: 'fixture',
    mode: 'soft'
  }
  const fixtures = {
    ListState: 'running',
    ListRecord: status.record,
    PartialSegment: segment,
    Status: status,
    Detail: detail,
    Updated: updated,
    Partial: partial,
    Cues: cues,
    SourceCue: { startMs: 0, endMs: 10, text: 'fixture' },
    SourceCues: [cue, { startMs: 0, endMs: 10, text: 'sidecar' }],
    Mode: 'soft',
    ExportInput: exportInput,
    ExportResult: { status: 'saved', path: '/fixture' },
    ExportProgress: { percent: null },
    Changes: { kind: 'updated', value: updated },
    Patch: patch,
    Insert: insert,
    HistoryItem: history,
    ImportResult: imported,
    CloudModel: catalog.models[0],
    CloudCatalog: catalog,
    ModelTransfer: model.downloading,
    ModelStatus: model
  }
  const codecs = {
    ListState: M.ListState,
    ListRecord: M.ListRecord,
    PartialSegment: M.PartialSegment,
    Status: M.Status,
    Detail: M.Detail,
    Updated: M.Updated,
    Partial: M.Partial,
    Cues: M.Cues,
    SourceCue: M.SourceCue,
    SourceCues: M.SourceCues,
    Mode: M.Mode,
    ExportInput: M.ExportInput,
    ExportResult: M.ExportResult,
    ExportProgress: M.ExportProgress,
    Changes: M.Changes,
    Patch: M.Patch,
    Insert: M.Insert,
    HistoryItem: M.HistoryItem,
    ImportResult: M.ImportResult,
    CloudModel: M.CloudModel,
    CloudCatalog: M.CloudCatalog,
    ModelTransfer: M.ModelTransfer,
    ModelStatus: M.ModelStatus
  }
  for (const [name, value] of Object.entries(fixtures)) {
    assert.ok(codecs[name], name)
    console.log('schema', name)
    await round(RpcObserved(codecs[name]), value)
  }
  await round(Dependencies, {})
  await round(Initial, {
    token: { document: 'd', client: 'c', generation: 1, family: 'transcript-changes', serial: 1 }
  })
  const token = {
    document: 'd',
    client: 'c',
    generation: 1,
    family: 'transcript-changes',
    serial: 1
  }
  const registered = { _tag: 'Registered', token, epoch: 'epoch' }
  const cut = { token, epoch: 'epoch', through: 1 }
  const appError = TranscriptOperationError.make({
    operation: 'fixture',
    legacyName: 'Error',
    message: 'fixture',
    code: undefined
  })
  for (const value of [
    { status: 'canceled' },
    { status: 'unavailable', reason: 'missing-source' },
    { status: 'unavailable', reason: 'audio-only' },
    { status: 'failed', message: 'fixture' }
  ]) {
    await round(RpcObserved(M.ExportResult), value)
  }
  for (const value of [
    null,
    { ...detail, record: null, transcriptId: null, sources: [], stage: null },
    Object.fromEntries(Object.entries(detail).filter(([key]) => key !== 'creation'))
  ]) {
    if (value === null) {
      await round(TranscriptRpcs.requests.get('Transcript.GetPlaybackCues').successSchema, {
        exit: { _tag: 'Success', value: null },
        cuts: []
      })
    } else {
      await round(RpcObserved(M.Detail), value)
    }
  }
  for (const value of [{ ...segment, words: undefined }, { ...segment, words: [] }, segment]) {
    await round(RpcObserved(M.PartialSegment), value)
  }
  for (const value of [
    { ...model, downloading: null },
    { ...model, pendingTiers: [], language: '' }
  ]) {
    await round(TranscriptRpcs.requests.get('Transcript.GetModelStatus').successSchema, {
      exit: { _tag: 'Success', value },
      cuts: []
    })
  }
  await round(TranscriptRpcs.requests.get('Transcript.GetCloudModels').successSchema, {
    exit: {
      _tag: 'Failure',
      error: TranscriptOperationError.make({
        operation: 'GetCloudModels',
        legacyName: 'Error',
        message: 'fixture'
      })
    },
    cuts: []
  })
  await round(RpcObserved(RemoteCaptionSnapshot), {
    author: '',
    duration: Number.POSITIVE_INFINITY,
    error: null,
    errorCode: null,
    segments: [],
    selectedTrackId: '',
    status: 'running',
    title: '',
    tracks: [],
    updatedAt: 1
  })
  await round(RpcObserved(CloudAccepted), {
    requestId: 'r',
    modelId: 'm',
    text: 'fixture',
    credits: 0,
    language: { unchecked: -0 },
    metadata: undefined
  })
  await round(RpcObserved(CloudObservedPipeline), {
    resultKind: 'transcript',
    modelVersion: 'fixture',
    asrTier: 'minimal',
    language: undefined,
    sourceKind: 'asr',
    speakers: [],
    segments: []
  })
  const payloads = {
    GetCloudModels: {},
    GetForDownload: { downloadId: 'download' },
    GetDetail: { downloadId: 'download' },
    GetPlaybackCues: { downloadId: 'download' },
    GetSourceCues: { downloadId: 'download', key: 'captions:en' },
    GetStatusMap: {},
    ImportLocal: { paths: ['/fixture'] },
    Start: { downloadId: 'download', force: undefined, speakerCount: 'auto' },
    Rediarize: { downloadId: 'download', speakerCount: 'auto' },
    SelectSource: { downloadId: 'download', key: 'asr' },
    Retry: { downloadId: 'download' },
    Cancel: { downloadId: 'download' },
    GetModelStatus: {},
    GetModelPrepStatus: {},
    RedownloadModels: {},
    GetPartials: { downloadId: 'download' },
    EnsureTier: { tier: 'minimal' },
    SetTier: { tier: 'minimal' },
    DeleteTier: { tier: 'minimal' },
    CancelTier: { tier: 'minimal' },
    Upgrade: { downloadId: 'download', tier: 'minimal' },
    UpdateSegment: patch,
    DeleteSegments: { downloadId: 'download', segmentIds: ['cue'] },
    InsertSegment: insert,
    ExportVideo: exportInput,
    CancelVideoExport: {}
  }
  const results = {
    GetCloudModels: catalog,
    GetPlaybackCues: cues,
    GetSourceCues: fixtures.SourceCues,
    GetStatusMap: { download: status },
    ImportLocal: imported,
    GetModelStatus: model,
    GetModelPrepStatus: prep,
    RedownloadModels: model,
    GetPartials: restored.segments,
    EnsureTier: model,
    SetTier: model,
    DeleteTier: model,
    CancelTier: model,
    InsertSegment: { segmentId: 'cue', snapshot: detail },
    ExportVideo: { status: 'saved', path: '/fixture' },
    CancelVideoExport: undefined
  }
  const handlers = {}
  let count = 0
  for (const [tag, rpc] of TranscriptRpcs.requests) {
    const name = tag.slice(11)
    console.log('rpc', name)
    if (name.startsWith('Watch')) {
      const values =
        name === 'WatchChanges'
          ? [
              { kind: 'partial', value: partial },
              { kind: 'updated', value: updated }
            ]
          : name === 'WatchModels'
            ? [prep]
            : [{ percent: null }, { percent: -0 }]
      const envelopes = [
        registered,
        ...values.map((value, i) => ({
          _tag: 'Observation',
          token,
          epoch: 'epoch',
          sequence: i + 1,
          value
        }))
      ]
      for (const value of envelopes) {
        await round(O.getOrThrow(RS.getStreamSchemas(rpc.successSchema)).success, value)
      }
      handlers[tag] = () => Stream.fromIterable(envelopes)
    } else {
      const payload = { ...payloads[name], dependencies: {} }
      if (
        [
          'GetForDownload',
          'GetDetail',
          'GetPlaybackCues',
          'GetSourceCues',
          'GetStatusMap',
          'GetPartials',
          'GetModelPrepStatus'
        ].includes(name)
      ) {
        payload.token = token
      }
      await round(rpc.payloadSchema, payload)
      const value = Object.hasOwn(results, name) ? results[name] : detail
      const completion = { exit: { _tag: 'Success', value }, cuts: [cut] }
      await round(rpc.successSchema, completion)
      await round(rpc.successSchema, { exit: { _tag: 'Failure', error: appError }, cuts: [cut] })
      await round(
        rpc.errorSchema,
        DeliveryError.make({ reason: 'RegistrationClosed', message: 'closed' })
      )
      handlers[tag] = () => E.succeed(completion)
    }
    count++
  }
  assert.equal(count, 29)
  assert.throws(() => compare(catalog, JSON.parse(JSON.stringify(catalog))))
  assert.throws(() => S.decodeUnknownSync(M.Status)({ ...status, stage: 23 }))
  console.log(
    JSON.stringify(
      {
        schemas: Object.keys(fixtures).length,
        rpcs: count,
        unary: 26,
        streams: 3,
        checks: [
          'construction',
          'real-json-codecs',
          'RpcServer-RpcClient',
          'source-finish-projector',
          'native-partial-restoration',
          'future-stage',
          'retained-history',
          'Infinity',
          'negative-zero',
          'presence',
          'key-order',
          'failure-cuts',
          'negative-json-loss'
        ]
      },
      null,
      2
    )
  )
})
