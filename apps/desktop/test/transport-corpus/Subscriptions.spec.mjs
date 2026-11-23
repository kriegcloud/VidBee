// Frozen design corpus: native source-extraction oracle; production declarations/codecs are strict TS.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import { it } from '@effect/vitest'
import * as E from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Rpc from 'effect/rpc/Rpc'
import * as RpcSchema from 'effect/rpc/RpcSchema'
import * as Ser from 'effect/rpc/RpcSerialization'
import * as S from 'effect/Schema'
import { transformSync } from 'esbuild'
import { SubscriptionOperationError } from '../../src/renderer/src/transport/census/Subscription.errors.js'
import * as M from '../../src/renderer/src/transport/census/Subscription.model.js'
import { SubscriptionRpcs } from '../../src/renderer/src/transport/census/Subscription.rpc.js'
import { DeliveryError as DErr } from '../../src/renderer/src/transport/DocumentDelivery.errors.js'
import * as DModel from '../../src/renderer/src/transport/DocumentDelivery.model.js'
import { sameObservation } from '../../src/renderer/src/transport/RpcCensus.model.js'
import {
  ObservedValue,
  RpcObserved
} from '../../src/renderer/src/transport/RpcObservation.model.js'

it('frozen Subscriptions complete declaration and real producer codec census', async () => {
  const D = { ...DModel, DeliveryError: DErr }

  const compare = (left, right) => assert.equal(sameObservation({ left, right }), true)
  const v = process.cwd()
  const source = fs.readFileSync(`${v}/apps/desktop/src/main/lib/subscriptions-host.ts`, 'utf8')
  const projector = source.slice(
    source.indexOf('const projectSubscriptionForRenderer'),
    source.indexOf('\n/**', source.indexOf('const projectSubscriptionForRenderer'))
  )
  const js = transformSync(projector.replace('export const', 'const'), {
    loader: 'ts',
    format: 'cjs'
  }).code
  const project = new Function(`${js};return projectSubscriptionForRenderer`)()
  const core = {
    id: 's',
    title: 'fixture',
    sourceUrl: 'https://fixture.invalid',
    feedUrl: 'https://fixture.invalid/rss',
    platform: 'future-platform',
    keywords: ['one'],
    tags: ['tag'],
    onlyDownloadLatest: false,
    autoDownload: false,
    enabled: false,
    status: 'future-status',
    createdAt: -0,
    updatedAt: 2,
    sourceKind: 'feed',
    categories: [],
    profileOwner: '',
    checkIntervalMs: -0,
    nextCheckAt: -0,
    coverUrl: '123',
    latestVideoTitle: '',
    latestVideoPublishedAt: -0,
    lastCheckedAt: -0,
    lastSuccessAt: -0,
    lastError: '',
    downloadDirectory: '',
    namingTemplate: '',
    downloadType: 'future-format',
    downloadQuality: 'future-quality',
    downloadContainer: 'future-container',
    items: [
      {
        id: 'i',
        url: 'https://fixture.invalid/i',
        title: 'item',
        publishedAt: -0,
        addedToQueue: false,
        thumbnail: '',
        taskId: ''
      }
    ]
  }
  const row = project(core)
  const token = { document: 'd', client: 'c', generation: 1, family: 'subscriptions', serial: 1 }
  const downloads = { ...token, family: 'downloads', serial: 2 }
  const delivery = { subscriptions: token, downloads }
  const error = SubscriptionOperationError.make({
    operation: 'update',
    legacyMessage: 'SUBSCRIPTION_DUPLICATE_FEED_URL'
  })
  const rt = async (schema, value) => {
    const codec = Ser.json.codecFor(schema)
    const encoded = await E.runPromise(S.encodeUnknownEffect(codec)(value))
    const parser = Ser.json.makeUnsafe()
    const wire = parser.encode({ payload: encoded })
    assert.notEqual(wire, undefined)
    const envelope = parser.decode(wire)[0]
    return E.runPromise(S.decodeUnknownEffect(codec)(envelope.payload))
  }
  const schemaValues = [
    ['item', M.DesktopSubscriptionItem, row.items[0]],
    ['read', M.DesktopSubscription, row],
    ['mutation', M.DesktopSubscriptionMutation, row],
    ['list', M.DesktopSubscriptionList, [row]],
    ['view', M.DesktopSubscriptionView, row],
    [
      'create',
      M.CreateSubscription,
      { url: '', checkIntervalMs: -0, tags: undefined, enabled: false, downloadDirectory: '' }
    ],
    [
      'update',
      M.UpdateSubscription,
      { checkIntervalMs: -0, title: undefined, namingTemplate: '', enabled: false }
    ],
    ['id', M.SubscriptionId, { id: '' }],
    ['resolve', M.ResolveSubscription, { url: '' }],
    [
      'update-request',
      M.UpdateSubscriptionRequest,
      { id: 's', updates: { checkIntervalMs: undefined } }
    ],
    ['refresh', M.RefreshSubscription, { id: undefined }],
    ['queue', M.QueueSubscriptionItem, { id: 's', itemId: 'i' }],
    [
      'resolved',
      M.ResolvedFeed,
      {
        sourceUrl: '',
        feedUrl: '',
        platform: 'custom',
        sourceKind: 'feed',
        availableCategories: [],
        profileOwner: undefined
      }
    ],
    ['error', SubscriptionOperationError, error],
    ['token', D.Token, token],
    ['registered', D.Registered, { _tag: 'Registered', token, epoch: 'e' }],
    ['cut', D.Cut, { token, epoch: 'e', through: 1 }],
    [
      'delivery-error',
      D.DeliveryError,
      D.DeliveryError.make({ reason: 'RegistrationClosed', message: 'RegistrationClosed' })
    ]
  ]
  for (const [name, schema, value] of schemaValues) {
    // Observed wrapping is selected only for output-like schemas; input transforms are exercised themselves.
    const chosen = ['item', 'read', 'mutation', 'list', 'view', 'legacy', 'resolved'].includes(name)
      ? RpcObserved(schema)
      : schema
    const back = await rt(chosen, value)
    if (name === 'error') {
      assert.equal(back.message, error.message)
    } else if (name === 'delivery-error') {
      assert.equal(back.message, value.message)
    } else if (
      [
        'create',
        'update',
        'update-request',
        'id',
        'resolve',
        'refresh',
        'queue',
        'token',
        'registered',
        'cut'
      ].includes(name)
    ) {
      assert.deepEqual(back, value)
    } else {
      compare(value, back)
    }
    console.log(`SCHEMA ${name} PASS`)
  }
  for (const interval of [
    {},
    { checkIntervalMs: undefined },
    { checkIntervalMs: null },
    { checkIntervalMs: -0 },
    { checkIntervalMs: 0 },
    { checkIntervalMs: -42.5 }
  ]) {
    compare(interval, await rt(M.UpdateSubscription, interval))
  }
  for (const [schema, names] of [
    [
      M.CreateSubscription,
      [
        'downloadType',
        'downloadQuality',
        'downloadContainer',
        'keywords',
        'tags',
        'onlyDownloadLatest',
        'autoDownload',
        'downloadDirectory',
        'namingTemplate',
        'enabled',
        'categories',
        'checkIntervalMs'
      ]
    ],
    [
      M.UpdateSubscription,
      [
        'downloadType',
        'downloadQuality',
        'downloadContainer',
        'title',
        'sourceUrl',
        'feedUrl',
        'platform',
        'keywords',
        'tags',
        'onlyDownloadLatest',
        'autoDownload',
        'enabled',
        'downloadDirectory',
        'namingTemplate',
        'categories',
        'checkIntervalMs',
        'items'
      ]
    ]
  ]) {
    for (const field of names) {
      const value =
        schema === M.CreateSubscription ? { url: 'u', [field]: undefined } : { [field]: undefined }
      assert.deepEqual(await rt(schema, value), value)
    }
  }
  assert.deepEqual(
    await rt(M.UpdateSubscription, {
      items: [row.items[0]],
      keywords: [],
      tags: [],
      categories: [],
      downloadType: 'future-format'
    }),
    { items: [row.items[0]], keywords: [], tags: [], categories: [], downloadType: 'future-format' }
  )
  const retained = {
    second: undefined,
    first: null,
    extra: {
      negative: -0,
      number: Number.NaN,
      big: 123n,
      marker: { _tag: 'RpcUndefined' },
      infinite: Number.POSITIVE_INFINITY
    },
    __proto__: null
  }
  compare(retained, await rt(ObservedValue, retained))
  // Authored unknown keys strip, output retained graphs keep their own keys; these are separate policies.
  assert.deepEqual(await rt(M.CreateSubscription, { url: 'u', unknown: 'strip' }), { url: 'u' })
  assert.equal(Object.hasOwn(project({ ...core, ignored: retained }), 'ignored'), false)
  console.log('PRESENCE omissions/null/undefined/-0, unknown authored keys and retained graph PASS')
  const resolved = {
    sourceUrl: '',
    feedUrl: '',
    platform: 'custom',
    sourceKind: 'feed',
    availableCategories: []
  }
  const inputs = {
    List: { token },
    Resolve: { url: '' },
    Create: { input: { url: '', checkIntervalMs: -0, tags: undefined }, delivery },
    Update: {
      id: 's',
      updates: { checkIntervalMs: undefined },
      delivery: { subscriptions: token }
    },
    Remove: { id: 's', delivery },
    Refresh: { id: undefined, delivery },
    QueueItem: { id: 's', itemId: 'i', delivery }
  }
  const outputs = {
    List: [row],
    Resolve: resolved,
    Create: row,
    Update: row,
    Remove: true,
    Refresh: undefined,
    QueueItem: false
  }
  for (const [short, input] of Object.entries(inputs)) {
    const rpc = SubscriptionRpcs.requests.get(`Subscriptions.${short}`)
    assert.ok(rpc)
    assert.deepEqual(await rt(rpc.payloadSchema, input), input)
    for (const value of [outputs[short], ...(short === 'Update' ? [undefined] : [])]) {
      const completion = {
        exit: { _tag: 'Success', value },
        cuts: short === 'Resolve' || short === 'List' ? [] : [{ token, epoch: 'e', through: 1 }]
      }
      compare(completion, await rt(rpc.successSchema, completion))
    }
    const failure = await rt(rpc.successSchema, {
      exit: { _tag: 'Failure', error },
      cuts: [{ token, epoch: 'e', through: 1 }]
    })
    assert.equal(failure.exit.error.message, error.message)
    assert.equal(failure.cuts[0].through, 1)
    await rt(
      Rpc.exitSchema(rpc),
      Exit.fail(
        D.DeliveryError.make({ reason: 'RegistrationClosed', message: 'RegistrationClosed' })
      )
    )
    console.log(`RPC ${short}: payload, inner success/failure, outer error PASS`)
  }
  const watch = SubscriptionRpcs.requests.get('Subscriptions.Changes')
  // Stream rpc success is the element schema, not a bare list.
  for (const element of [
    { _tag: 'Registered', token, epoch: 'e' },
    { _tag: 'Observation', token, epoch: 'e', sequence: 1, value: [row] }
  ]) {
    compare(
      element,
      await rt(RpcSchema.getStreamSchemas(watch.successSchema).value.success, element)
    )
  }
  console.log('RPC Changes: Registered and Observation PASS')
  // Negative control mutates the selected RPC success path, not an unrelated auxiliary codec.
  const listRpc = SubscriptionRpcs.requests.get('Subscriptions.List')
  const weakened = D.Completion({
    success: S.Array(S.Struct({ id: S.String })),
    error: SubscriptionOperationError
  })

  const reduced = await rt(listRpc.setSuccess(weakened).successSchema, {
    exit: { _tag: 'Success', value: [row] },
    cuts: []
  })
  assert.throws(() => compare(row, reduced.exit.value[0]))
  console.log(
    'MUTATION actual List Rpc.setSuccess + real transport closed DTO => omission detected PASS'
  )
})
