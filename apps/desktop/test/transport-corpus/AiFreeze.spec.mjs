import { Transpiler } from 'bun'
// Frozen design corpus: native source-extraction oracle; production declarations/codecs are strict TS.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { it } from '@effect/vitest'
import * as RS from 'effect/rpc/RpcSerialization'
import * as S from 'effect/Schema'
import * as C from '../../src/renderer/src/transport/census/Ai.rpc.js'
import { StoredThread } from '../../src/renderer/src/transport/census/StoredThread.model.js'

it('frozen AiFreeze complete declaration and real producer codec census', async () => {
  const root = `${process.cwd()}/apps/desktop/src/`
  const read = (p) => readFileSync(root + p, 'utf8')
  const transpile = new Transpiler({ loader: 'ts' })
  const between = (s, a, b) => s.slice(s.indexOf(a), s.indexOf(b, s.indexOf(a)))
  const round = (schema, value) => {
    const codec = RS.json.codecFor(schema),
      parser = RS.json.makeUnsafe()
    const [frame] = parser.decode(parser.encode({ value: S.encodeSync(codec)(value) }))
    const result = S.decodeSync(codec)(frame.value)
    assert.deepEqual(result, value)
    return result
  }
  const rpc = (name) => C.AiRpcs.requests.get(`Ai.${name}`)
  const token = { document: 'd', client: 'c', generation: 1, family: 'ai.agent', serial: 1 }
  const cuts = [{ token, epoch: 'e', through: 2 }]
  const complete = (name, value) =>
    round(rpc(name).successSchema, { exit: { _tag: 'Success', value }, cuts }).exit.value
  const thinking = { levels: ['off'], defaultLevel: 'off', vision: false }
  const composerSrc = between(
    read('main/lib/agent-composer.ts'),
    'export async function getAgentComposerOptions',
    '/** Persist'
  )
  const compose = (providers) =>
    new Function(
      'aiStore',
      'loadCloudModels',
      'getAgentThinkingOptions',
      transpile.transformSync(composerSrc.replace('export ', '')) +
        ';return getAgentComposerOptions'
    )(
      { getSnapshot: () => ({ providers, activeProviderId: null }) },
      () => Promise.resolve({ models: [], defaultModelId: 'default' }),
      () => Promise.resolve(thinking)
    )()
  for (const provider of [
    { id: 'p', modelId: 'm', name: 'P', presetId: 'retained-preset' },
    { id: 'p', modelId: 'm', name: null, presetId: 'custom' },
    { id: 'p', modelId: '', name: 3, presetId: null }
  ]) {
    complete('GetAgentComposerOptions', await compose([provider]))
  }
  console.log(
    'A1 composer: 3 actual-source outputs survive complete-operation JSON (unknown preset; null description; scalar label)'
  )
  const storeSrc = read('main/lib/agent-chat-store.ts')
  const methods =
    between(storeSrc, '  get(id: string, options?', '  /**\n   * Commit entities') +
    between(storeSrc, '  save(\n', '  /**\n   * Drop old cursor') +
    between(storeSrc, '  events(\n', '  /**\n   * Read the committed seq')
  const sourceClass = transpile
    .transformSync(`class SourceStore {db; ${methods}}`)
    .replace(/^export /, '')
  const projected = (t) => ({
    ...t,
    messages: t.messages.map((x) => ({ ...x })),
    runs: t.runs.map((r) => ({
      ...r,
      rawMessages: [],
      sessionEntries: undefined,
      tools: r.tools,
      activity: r.activity ?? []
    })),
    artifacts: t.artifacts.map((a) => ({ ...a, path: '', posterPath: undefined })),
    images: undefined
  })
  const makeClass = new Function(
    'publicAgentThread',
    'publicAgentPatch',
    'agentDirectoryMeta',
    'persistableRun',
    'durableAgentEvent',
    'rehydrateEntry',
    `${sourceClass};return SourceStore`
  )
  const SourceStore = makeClass(
    projected,
    (t) => projected(t),
    () => ({}),
    (r) => ({ ...r, rawMessages: [], sessionEntries: undefined }),
    (e) => {
      const { snapshot, patch, catalog, ...header } = e
      return header
    },
    (e) => e
  )
  const fixture = () => ({
    id: 't',
    downloadId: 'agent-workspace',
    promptId: 'chat',
    leafId: 'm',
    seq: 1,
    messages: [
      { id: 'm', parentId: null, runId: null, role: 'user', text: 'x', thinking: '', createdAt: 1 }
    ],
    runs: [
      {
        id: 'r',
        messageId: 'm',
        status: 'running',
        error: null,
        model: 'x',
        instruction: 'x',
        createdAt: 1,
        updatedAt: 1,
        rawMessages: [],
        sessionEntries: [{ type: 'custom', data: 'private' }],
        tools: []
      }
    ],
    artifacts: [
      {
        id: 'a',
        threadId: 't',
        runId: 'r',
        kind: 'image',
        name: 'a',
        path: '/private/a.png',
        start: 0
      }
    ]
  })
  const header = {
    threadId: 't',
    runId: null,
    messageId: null,
    seq: 2,
    type: 'saved',
    createdAt: null,
    retained: { x: 3 }
  }
  const makeStore = () => {
    const store = new SourceStore(),
      calls = []
    let entryReads = 0
    store.db = {
      transaction: (fn) => () => fn(),
      prepare: (sql) => ({
        run: (...args) => {
          calls.push({ sql, args })
        },
        get: () => (sql.includes('COUNT(*)') ? { n: 0 } : { data: JSON.stringify(fixture()) }),
        all: () => {
          if (sql.includes('agent_events')) {
            return [{ data: JSON.stringify(header) }]
          }
          if (sql.includes('agent_messages')) {
            return fixture().messages.map((data) => ({ data: JSON.stringify(data) }))
          }
          if (sql.includes('agent_artifacts')) {
            return fixture().artifacts.map((data) => ({ data: JSON.stringify(data) }))
          }
          if (sql.includes('agent_runs')) {
            return fixture().runs.map((data) => ({
              data: JSON.stringify({ ...data, sessionEntries: undefined })
            }))
          }
          if (sql.includes('agent_run_entries')) {
            entryReads++
            return [{ data: JSON.stringify({ type: 'custom', data: 'private' }) }]
          }
          throw new Error(sql)
        }
      })
    }
    store.threadSeq = () => 2
    store.appendRunEntries = () => {}
    return { store, calls, entryReads: () => entryReads }
  }
  const recovery = makeStore().store.events('t', 0)
  complete('GetAgentEvents', recovery)
  round(C.Event, {
    threadId: 't',
    runId: null,
    messageId: null,
    seq: 2,
    type: 'saved',
    createdAt: 1
  })
  assert.throws(() => round(C.Event, header))
  console.log(
    'A1 recovery: actual parsed header createdAt:null survives GetAgentEvents completion; fresh Event guard still rejects it'
  )
  const runner = read('main/lib/agent-chat-runner.ts')
  const sendSrc = between(runner, 'export function sendAgentMessage(', '/**')
  // Select the complete function up to the following documentation block.
  assert(sendSrc.includes('return publicAgentThread'))
  const sourceSend = new Function(
    'AGENT_THINKING_LEVELS',
    'AGENT_MAX_MESSAGE_IMAGES',
    'isUuid',
    'getAgentChatStore',
    'publicAgentThread',
    'active',
    `${transpile.transformSync(sendSrc.replace('export ', ''))};return sendAgentMessage`
  )(
    ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
    10,
    () => true,
    () => ({ open: () => fixture(), get: () => fixture() }),
    projected,
    new Map()
  )
  const base = { downloadId: 'agent-workspace', promptId: 'chat' }
  for (const extra of [
    { threadId: null },
    { uiResponse: null },
    { sourceDurationMs: Number.NaN },
    { threadId: 0, uiResponse: 7 }
  ]) {
    const input = () => ({ ...base, ...extra })
    const old = sourceSend(input())
    const current = sourceSend(round(rpc('SendAgentMessage').payloadSchema, input()))
    assert.deepEqual(current, old)
    complete('SendAgentMessage', current)
  }
  for (const extra of [
    { thinkingLevel: 'invalid' },
    { thinkingLevel: null },
    { text: 7 },
    { imageIds: 3 }
  ]) {
    const input = () => ({ ...base, ...extra })
    let oldText
    try {
      sourceSend(input())
    } catch (e) {
      oldText = e.message
    }
    assert.equal(oldText, 'Invalid chat input')
    const decoded = round(rpc('SendAgentMessage').payloadSchema, input())
    assert.throws(
      () => sourceSend(decoded),
      (e) => e.message === oldText
    )
    const completion = round(rpc('SendAgentMessage').successSchema, {
      exit: {
        _tag: 'Failure',
        error: C.AiOperationError.make({ operation: 'SendAgentMessage', message: oldText })
      },
      cuts
    })
    assert.equal(completion.exit.error.message, oldText)
    assert.deepEqual(completion.cuts, cuts)
  }
  const setSrc = between(runner, 'export function setAgentThinkingLevel(', '/** Remove')
  const setLevel = new Function(
    'AGENT_THINKING_LEVELS',
    `${transpile.transformSync(setSrc.replace('export ', ''))};return setAgentThinkingLevel`
  )(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
  const setInput = round(rpc('SetAgentThinkingLevel').payloadSchema, {
    threadId: 't',
    level: 'invalid'
  })
  assert.throws(
    () => setLevel(setInput.threadId, setInput.level),
    (e) => e.message === 'Invalid thinking level'
  )
  round(rpc('SetAgentThinkingLevel').successSchema, {
    exit: {
      _tag: 'Failure',
      error: C.AiOperationError.make({
        operation: 'SetAgentThinkingLevel',
        message: 'Invalid thinking level'
      })
    },
    cuts
  })
  console.log(
    'A2 ingress: 4 successful null/scalar/NaN cases and 4 deliberate send failures match source; invalid thinking level remains application failure; original texts and cuts round-trip'
  )
  for (const [scope, expected] of [
    [undefined, [1, 1, 1]],
    [{}, [0, 0, 0]],
    [{ runIds: ['r'] }, [0, 1, 0]]
  ]) {
    const { store, calls } = makeStore(),
      thread = S.decodeUnknownSync(StoredThread)(fixture())
    thread.runs[0].status = 'interrupted'
    store.save(thread, 'run.interrupted', undefined, scope)
    const counts = ['agent_messages', 'agent_runs', 'agent_artifacts'].map(
      (table) => calls.filter((c) => c.sql.startsWith(`INSERT INTO ${table} `)).length
    )
    assert.deepEqual(counts, expected)
    assert.equal(thread.seq, 2)
    console.log(
      'A3 scope ' +
        (scope === undefined ? 'omitted' : JSON.stringify(scope)) +
        ': message/run/artifact upserts ' +
        counts.join('/') +
        '; seq ' +
        thread.seq
    )
  }
  const { store, entryReads } = makeStore()
  const metadata = store.get('t', { sessionEntries: false })
  assert.equal(entryReads(), 0)
  assert.equal(metadata.runs[0].sessionEntries, undefined)
  const full = store.get('t')
  assert.equal(entryReads(), 1)
  assert.equal(full.runs[0].sessionEntries[0].data, 'private')
  assert.equal(full.artifacts[0].path, '/private/a.png')
  const live = fixture()
  live.seq = 3
  live.title = 'live'
  assert.equal(store.events('t', 0, live).snapshot.title, 'live')
  const stale = fixture()
  stale.title = 'stale'
  assert.equal(store.events('t', 0, stale).snapshot.title, undefined)
  console.log(
    'A3 store: metadata skips entries; full get retains private entries/paths; eligible live recovery wins and stale live recovery falls back'
  )
})
