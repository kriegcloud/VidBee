import { Transpiler } from 'bun'
// Frozen design corpus: native source-extraction oracle; production declarations/codecs are strict TS.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import { it } from '@effect/vitest'
import * as E from 'effect/Effect'
import * as RS from 'effect/rpc/RpcSchema'
import * as Ser from 'effect/rpc/RpcSerialization'
import * as S from 'effect/Schema'
import * as C from '../../src/renderer/src/transport/census/Integration.rpc.js'
import { ObservedValue } from '../../src/renderer/src/transport/RpcObservation.model.js'

it('frozen Integration complete declaration and real producer codec census', async () => {
  const root = `${process.cwd()}/apps/desktop/src/`
  const source = fs.readFileSync(`${root}main/lib/auth-client.ts`, 'utf8')
  const start = source.indexOf('function isDesktopAiCreditSourceUsage')
  const end = source.indexOf('/** Return the authenticated API URL')
  const js = new Transpiler({ loader: 'ts' })
    .transformSync(source.slice(start, end))
    .replaceAll('export ', '')
  const oracle = new Function(
    js +
      ';return {desktopAiCreditUsage,desktopAiReservations,desktopAiCreditSnapshot,isDesktopAiCreditReceipt,isDesktopAiCreditHistoryCursor}'
  )()
  const compare = (a, b) => {
    assert.equal(typeof a, typeof b)
    if (a === null || typeof a !== 'object') {
      assert.ok(Object.is(a, b))
      return
    }
    assert.equal(Array.isArray(a), Array.isArray(b))
    assert.deepEqual(Object.keys(a), Object.keys(b))
    for (const k of Object.keys(a)) {
      assert.equal(Object.hasOwn(b, k), true)
      compare(a[k], b[k])
    }
  }
  const round = async (schema, value) => {
    const codec = Ser.json.codecFor(schema)
    const wire = await E.runPromise(S.encodeEffect(codec)(value))
    const parser = Ser.json.makeUnsafe()
    const frames = parser.decode(parser.encode({ _tag: 'Probe', value: wire }))
    return E.runPromise(S.decodeUnknownEffect(codec)(frames[0].value))
  }
  const token = { document: 'd', client: 'c', generation: 1, family: 'account.credits', serial: 1 }
  const cuts = [{ token, epoch: 'e', through: 1 }]
  const bucket = {
    quotaCredits: -0,
    remainingCredits: Number.POSITIVE_INFINITY,
    reservedCredits: -3,
    usedCredits: Number.NaN,
    expiringSoonCredits: Number.NEGATIVE_INFINITY
  }
  const credits = oracle.desktopAiCreditUsage({
    ...bucket,
    byFeature: { prompt: -0, transcription: Number.POSITIVE_INFINITY },
    interruptedCredits: -2,
    reconcilingCredits: Number.POSITIVE_INFINITY
  })
  const row = {
    requestId: '',
    status: 'reserved',
    taskLabel: null,
    createdAt: -0,
    deadlineAt: -0,
    expiresAt: -0,
    lastHeartbeatAt: -0,
    lastProgressAt: -0,
    reservedCredits: -0
  }
  const reservations = oracle.desktopAiReservations([row])
  const cursor = JSON.parse('{"opaque":{"zero":-0,"huge":1e400},"id":"c","at":-0}')
  assert.equal(oracle.isDesktopAiCreditHistoryCursor(cursor), true)
  const receipt = {
    opaque: { zero: -0, own: undefined },
    id: '',
    requestId: '',
    feature: '',
    status: '',
    createdAt: -0,
    credits: -0,
    refundedCredits: -0,
    taskLabel: null,
    basis: null,
    pricingVersion: null,
    model: null,
    inputTokens: -0,
    outputTokens: null
  }
  assert.equal(oracle.isDesktopAiCreditReceipt(receipt), true)
  const snapshot = oracle.desktopAiCreditSnapshot({
    credits: { ...bucket, byFeature: { prompt: 1, transcription: 2 } },
    reservations: [row]
  })
  const overview = {
    ...snapshot,
    invitationOverview: 17,
    invitedUsers: { items: [], nextCursor: 17, extra: { huge: Number.POSITIVE_INFINITY } },
    giftedCreditRecords: { items: [], nextCursor: true }
  }
  const values = {
    'Mcp.GetStatus': {
      enabled: true,
      running: false,
      url: null,
      configPath: '/fixture/mcp.json',
      toolCount: 50,
      httpConfig: 'synthetic'
    },
    'Mcp.GetCapabilities': [
      { id: 'tools', kind: 'tools', items: [{ name: 'get_task', labelKey: 'x', description: 'x' }] }
    ],
    'Mcp.SetEnabled': {
      enabled: false,
      running: false,
      url: null,
      configPath: 'x',
      toolCount: 50,
      httpConfig: 'x'
    },
    'Mcp.RotateToken': {
      enabled: true,
      running: false,
      url: null,
      configPath: 'x',
      toolCount: 50,
      httpConfig: 'x'
    },
    'Account.GetOverview': overview,
    'Account.GetAiCreditSnapshot': snapshot,
    'Account.GetAiCredits': credits,
    'Account.GetAiReservations': reservations,
    'Account.GetAiCreditHistory': { items: [receipt], nextCursor: cursor },
    'Account.GetCacheStats': { opaque: undefined, huge: Number.POSITIVE_INFINITY },
    'Account.CancelAiReservation': undefined,
    'Account.GetInvitationOverview': false,
    'Account.GetInvitedUsers': { items: [], nextCursor: 17 },
    'Account.GetGiftedCreditRecords': { items: [], nextCursor: true }
  }
  let count = 0
  for (const group of [C.McpRpcs, C.AccountRpcs]) {
    for (const [tag, rpc] of group.requests) {
      if (rpc._tag.startsWith('Account.Watch')) {
        assert.equal(RS.isStreamSchema(rpc.successSchema), true)
        for (const value of [
          { _tag: 'Registered', token, epoch: 'e' },
          { _tag: 'Observation', token, epoch: 'e', sequence: 1, value: undefined }
        ]) {
          compare(value, await round(rpc.successSchema.success, value))
        }
        const failure = await round(
          rpc.successSchema.error,
          new C.AccountOperationError({ operation: tag, message: 'stream' })
        )
        assert.equal(failure.message, 'stream')
        continue
      }
      const payload = tag.endsWith('SetEnabled')
        ? { enabled: false }
        : tag.endsWith('CreditHistory')
          ? { cursor }
          : tag.endsWith('InvitedUsers')
            ? { cursor: 17 }
            : tag.endsWith('GiftedCreditRecords')
              ? { cursor: true }
              : tag.endsWith('CancelAiReservation')
                ? { requestId: ' x ' }
                : [
                      'Account.GetOverview',
                      'Account.GetAiCreditSnapshot',
                      'Account.GetAiCredits'
                    ].includes(tag)
                  ? { creditsToken: token }
                  : undefined
      if (payload !== undefined) {
        compare(payload, await round(rpc.payloadSchema, payload))
      }
      const completion = { exit: { _tag: 'Success', value: values[tag] }, cuts }
      compare(completion, await round(rpc.successSchema, completion))
      const error = tag.startsWith('Mcp')
        ? new C.McpOperationError({ operation: tag, message: 'original' })
        : new C.AccountOperationError({ operation: tag, message: 'original' })
      const failed = await round(rpc.successSchema, { exit: { _tag: 'Failure', error }, cuts })
      assert.equal(failed.exit.error.message, 'original')
      compare(cuts, failed.cuts)
      count++
    }
  }
  const { Subscription } = await import(
    '../../src/renderer/src/transport/DocumentDelivery.model.js'
  )
  for (const _tag of ['Account.WatchCreditsUpdated', 'Account.WatchAuthContinue']) {
    for (const value of [
      { _tag: 'Registered', token, epoch: 'e' },
      { _tag: 'Observation', token, epoch: 'e', sequence: 1, value: undefined }
    ]) {
      compare(value, await round(Subscription(ObservedValue), value))
    }
  }
  for (const value of [{}, { cursor: undefined }, { cursor: null }, { cursor }]) {
    const result = await round(C.PageInput, value)
    compare(value, result)
    assert.equal(
      JSON.stringify({ json: { cursor: value.cursor, limit: 20 } }),
      JSON.stringify({ json: { cursor: result.cursor, limit: 20 } })
    )
  }
  const returned = await round(C.AccountHistory, { items: [receipt], nextCursor: cursor })
  const next = await round(C.HistoryInput, { cursor: returned.nextCursor })
  assert.equal(
    JSON.stringify({ json: { cursor } }),
    JSON.stringify({ json: { cursor: next.cursor } })
  )
  const extract = {
    status: 'completed',
    error: null,
    errorCode: null,
    title: 't',
    author: 'a',
    duration: Number.POSITIVE_INFINITY,
    tracks: [],
    selectedTrackId: '',
    segments: [{ start: -0, end: Number.POSITIVE_INFINITY, text: 't' }],
    cookieSources: [{ type: 'extension', browser: 'synthetic' }],
    updatedAt: -0
  }
  const retained = await round(C.TranscriptSnapshot, extract)
  compare(extract, retained)
  const http = JSON.parse(JSON.stringify(retained))
  assert.equal(http.duration, null)
  assert.equal(http.segments[0].end, null)
  assert.deepEqual(http.cookieSources, extract.cookieSources)
  compare(
    { creditsTokens: [], authTokens: [] },
    await round(C.RendererReady, { creditsTokens: [], authTokens: [] })
  )
  for (const value of [
    { input: { kind: 'unknown' } },
    {
      input: null,
      priority: -0,
      groupKey: false,
      parentId: 17,
      maxAttempts: Number.POSITIVE_INFINITY
    }
  ]) {
    compare(value, await round(C.ObservationAdmission, value))
  }
  for (const schema of [
    C.AccountCredits,
    C.AccountReservations,
    C.AccountSnapshot,
    C.AccountHistory,
    C.AccountOverview,
    C.AccountPassthrough,
    C.HistoryInput,
    C.PageInput,
    C.InitialRead,
    C.RendererReady,
    C.TranscriptExtractionView,
    C.TranscriptSnapshot,
    C.ObservationTask,
    C.ObservationAdmission
  ]) {
    Ser.json.codecFor(schema)
  }
  let mutationKilled = false
  try {
    compare(cursor, await round(S.Struct({ at: S.Finite, id: S.String }), cursor))
  } catch {
    mutationKilled = true
  }
  assert.equal(mutationKilled, true)
  console.log(
    JSON.stringify({
      unaryDeclarations: count,
      streamDeclarations: 2,
      sourceProjectors: true,
      completionFailure: true,
      cuts: true,
      presence: true,
      keyOrder: true,
      safeIntegerNegativeZero: true,
      recursiveExceptionalNumbers: true,
      loadMoreCursors: true,
      nextCloudBody: true,
      transcriptHttp: true,
      closedSchemaMutationKilled: true
    })
  )

  compare(extract, await round(C.TranscriptExtractionView, extract))
  const task = {
    id: 'x',
    input: { kind: 'unknown' },
    status: 'queued',
    priority: false,
    groupKey: 17,
    parentId: null,
    maxAttempts: -0,
    extra: { own: undefined }
  }
  compare(task, await round(C.ObservationTask, task))
  assert.equal(S.is(C.ObservationTask)(task), true)
})
