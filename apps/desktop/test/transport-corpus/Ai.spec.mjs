// Frozen design corpus: native source-extraction oracle; production declarations/codecs are strict TS.

import { strict as assert } from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { it } from '@effect/vitest'
import * as RpcSchema from 'effect/rpc/RpcSchema'
import * as RS from 'effect/rpc/RpcSerialization'
import * as S from 'effect/Schema'
import * as C from '../../src/renderer/src/transport/census/Ai.rpc.js'
import {
  Entry,
  PiEvent,
  SaveScope,
  ToolDefinition
} from '../../src/renderer/src/transport/census/AiNative.model.js'
import {
  durableAgentEvent,
  projectAgentPatch,
  projectAgentThread
} from '../../src/shared/agent-thread-patch.ts'

it('frozen Ai complete declaration and real producer codec census', async () => {
  const count = { schemas: 0, rpcs: 0, roundTrips: 0 }
  const round = (schema, value) => {
    const codec = RS.json.codecFor(schema),
      parser = RS.json.makeUnsafe()
    const encoded = S.encodeSync(codec)(value)
    const [frame] = parser.decode(parser.encode({ value: encoded }))
    const decoded = S.decodeSync(codec)(frame.value)
    assert.deepEqual(decoded, value)
    count.roundTrips++
    return decoded
  }
  const token = { document: 'd', client: 'c', generation: 1, family: 'ai.agent', serial: 1 }
  const other = { ...token, family: 'ai.settings' }
  const promptToken = { ...token, family: 'ai.prompt' },
    clickToken = { ...token, family: 'ai.clicks' }
  const cut = { token, epoch: 'e', through: 1 }
  const message = {
    id: 'm',
    parentId: null,
    runId: null,
    role: 'user',
    text: 'x',
    thinking: '',
    createdAt: 1,
    thinkingMs: null,
    extra: { own: undefined, minus: -0, notFinite: Number.NaN, big: 4n }
  }
  const tool = { id: 'tool', name: 'read', status: 'completed', extra: { nested: null } }
  const stored = {
    id: 't',
    downloadId: 'workspace',
    promptId: 'chat',
    seq: 1,
    leafId: 'm',
    title: null,
    messages: [message],
    runs: [
      {
        id: 'r',
        messageId: 'm',
        status: 'completed',
        error: null,
        model: 'x',
        instruction: 'x',
        createdAt: 1,
        updatedAt: 1,
        rawMessages: [],
        tools: [tool],
        usage: { input: -0, output: 1, totalTokens: 1, extra: null }
      }
    ],
    artifacts: [
      {
        id: 'a',
        threadId: 't',
        runId: 'r',
        kind: 'image',
        name: 'a',
        path: '/private',
        posterPath: '/private',
        start: 0
      }
    ],
    custom: { a: undefined, b: Number.POSITIVE_INFINITY }
  }
  const thread = projectAgentThread(stored, () => [])
  const blank = projectAgentThread({ ...stored, messages: [], runs: [], artifacts: [] }, () => [])
  const patch = projectAgentPatch(
    stored,
    { thread: true, messageIds: ['m'], runIds: ['r'], artifactIds: ['a'] },
    () => []
  )
  const summary = {
    id: 't',
    downloadId: 'workspace',
    promptId: 'chat',
    title: 'x',
    updatedAt: 1,
    running: false,
    approvalPending: undefined
  }
  const catalog = {
    kind: 'upsert',
    summary,
    history: true,
    runStatus: 'completed',
    statusUpdatedAt: 1,
    revision: 1
  }
  const event = {
    threadId: 't',
    runId: null,
    messageId: null,
    seq: 1,
    type: 'saved',
    createdAt: 1,
    snapshot: thread,
    patch,
    catalog
  }
  // Extract only the actual pure provider projector; no Electron module is loaded.
  const source = readFileSync(new URL('../../src/main/lib/ai-store.ts', import.meta.url), 'utf8')
  const body = source.match(
    /const toPublicProvider = \(provider: StoredProvider\): AiProviderConfig => \(\{([\s\S]*?)\}\)/
  )[1]
  const provider = runInNewContext(`(provider)=>({${body}})`)({
    id: 'p',
    presetId: 'custom',
    name: 'P',
    baseUrl: 'http://localhost',
    modelId: 'm',
    apiKeySealed: 'plain:synthetic',
    createdAt: 1,
    updatedAt: 1,
    maxTokens: undefined,
    vision: null,
    private: 'must not leak'
  })
  // VM prototype is foreign: transfer data descriptors to a local plain object at fixture acquisition.
  const localProvider = { ...provider }
  const prompt = {
    name: 'chat',
    content: 'x',
    isPreset: true,
    sortOrder: 0,
    createdAt: 1,
    updatedAt: 1,
    description: undefined
  }
  const settings = {
    activeProviderId: null,
    cloudModelId: null,
    providers: [localProvider],
    prompts: [prompt]
  }
  const thinking = { levels: ['off', 'high'], defaultLevel: 'off', vision: true }
  const promptRun = {
    downloadId: 'd',
    promptId: 'chat',
    status: 'idle',
    text: '',
    thinking: '',
    thinkingMs: 0,
    updatedAt: 0,
    error: null,
    errorCode: null,
    recovery: undefined
  }
  const providerWrite = { presetId: 'custom', modelId: 'm', apiKey: undefined, maxTokens: 256 }
  const promptWrite = {
    name: 'p',
    content: 'x',
    frontmatter: { custom: null, own: undefined, n: -0 }
  }
  const promptInput = {
    downloadId: 'd',
    promptId: 'chat',
    transcriptText: 'x',
    forceRegenerate: undefined
  }
  const send = {
    downloadId: 'workspace',
    promptId: 'chat',
    text: 'x',
    threadId: undefined,
    sourceDurationMs: -0
  }
  const composer = {
    models: [{ value: 'cloud:m', label: 'm', description: undefined }],
    selected: 'cloud:m',
    thinking
  }
  const caps = {
    allowDisableThinking: true,
    contextWindow: 4096,
    id: 'm',
    name: 'm',
    reasoning: false,
    thinkingLevels: ['off'],
    thinkingOnly: false,
    vision: false,
    maxTokens: undefined
  }
  const ui = { root: 'root', elements: { root: { type: 'InfoCard', props: {}, children: [] } } }
  const sample = {
    WireFinite: -0,
    Activity: { id: 'a', kind: 'thinking', text: 'x' },
    Thinking: 'off',
    RunStatus: 'completed',
    ToolStatus: 'completed',
    ErrorCode: 'INTERNAL',
    PromptCode: 'unknown',
    PresetId: 'custom',
    UiResponse: { toolCallId: 'x', title: 'x', values: [] },
    UiSpec: ui,
    Approval: { action: 'tool.execute', summary: 'x', risk: 'config' },
    Image: { path: '', id: 'i' },
    Artifact: thread.artifacts[0],
    Message: message,
    Tool: tool,
    Run: thread.runs[0],
    Thread: thread,
    Summary: summary,
    Patch: patch,
    Catalog: catalog,
    Event: event,
    Recovery: { events: [durableAgentEvent(event)], snapshot: thread },
    ThinkingOptions: thinking,
    Send: send,
    Provider: localProvider,
    ProviderWrite: providerWrite,
    Prompt: prompt,
    PromptWrite: promptWrite,
    Settings: settings,
    PromptKey: { downloadId: 'd', promptId: 'chat' },
    PromptInput: promptInput,
    PromptRun: promptRun,
    ProviderTest: { ok: false, text: '', error: 'x', errorCode: 'network' },
    CatalogOption: { label: 'm', value: 'm' },
    ModelCaps: caps,
    Preset: {
      id: 'custom',
      defaultModel: 'm',
      needsApiKey: true,
      requiresBaseUrl: true,
      baseUrl: undefined
    },
    RemoteInput: { presetId: 'custom', apiKey: undefined },
    CloudModels: { models: [{ id: 'm', name: 'm', multiplier: 1 }], defaultModelId: 'm' },
    Composer: composer,
    GithubSource: { repository: 'a/b', revision: 'abc', paths: ['SKILL.md'] },
    GithubInput: { repository: 'a/b', revision: 'abc', path: 'SKILL.md' },
    Target: { threadId: 't', downloadId: 'd', promptId: 'chat' },
    UiTask: {
      id: 'q',
      kind: 'download',
      title: null,
      status: 'completed',
      progress: null,
      selectable: true,
      download: { codec: null, extra: undefined }
    },
    AgentToken: token,
    SettingsToken: other,
    PromptToken: promptToken,
    ClickToken: clickToken,
    ReadAgent: { agent: token },
    ReadSettings: { settings: other },
    ReadPrompt: { prompt: promptToken },
    ReadClicks: { clicks: clickToken }
  }
  const codecs = {
    WireFinite: C.WireFinite,
    Activity: C.Activity,
    Thinking: C.Thinking,
    RunStatus: C.RunStatus,
    ToolStatus: C.ToolStatus,
    ErrorCode: C.ErrorCode,
    PromptCode: C.PromptCode,
    PresetId: C.PresetId,
    UiResponse: C.UiResponse,
    UiSpec: C.UiSpec,
    Approval: C.Approval,
    Image: C.Image,
    Artifact: C.Artifact,
    Message: C.Message,
    Tool: C.Tool,
    Run: C.Run,
    Thread: C.Thread,
    Summary: C.Summary,
    Patch: C.Patch,
    Catalog: C.Catalog,
    Event: C.Event,
    Recovery: C.Recovery,
    ThinkingOptions: C.ThinkingOptions,
    Send: C.Send,
    Provider: C.Provider,
    ProviderWrite: C.ProviderWrite,
    Prompt: C.Prompt,
    PromptWrite: C.PromptWrite,
    Settings: C.Settings,
    PromptKey: C.PromptKey,
    PromptInput: C.PromptInput,
    PromptRun: C.PromptRun,
    ProviderTest: C.ProviderTest,
    CatalogOption: C.CatalogOption,
    ModelCaps: C.ModelCaps,
    Preset: C.Preset,
    RemoteInput: C.RemoteInput,
    CloudModels: C.CloudModels,
    Composer: C.Composer,
    GithubSource: C.GithubSource,
    GithubInput: C.GithubInput,
    Target: C.Target,
    UiTask: C.UiTask,
    AgentToken: C.AgentToken,
    SettingsToken: C.SettingsToken,
    PromptToken: C.PromptToken,
    ClickToken: C.ClickToken,
    ReadAgent: C.ReadAgent,
    ReadSettings: C.ReadSettings,
    ReadPrompt: C.ReadPrompt,
    ReadClicks: C.ReadClicks
  }
  for (const [name, value] of Object.entries(sample)) {
    round(codecs[name], value)
    count.schemas++
  }
  round(C.Provider, { ...localProvider, maxTokens: null })
  round(
    C.Provider,
    Object.fromEntries(Object.entries(localProvider).filter(([k]) => k !== 'maxTokens'))
  )
  round(C.Thread, blank)
  assert(!('apiKeySealed' in round(C.Provider, localProvider)))
  assert.throws(() => round(C.Provider, { ...localProvider, apiKeySealed: 'secret' }))
  const common = {
    threadId: 't',
    downloadId: 'd',
    promptId: 'chat',
    agent: token,
    settings: other,
    prompt: promptToken,
    clicks: clickToken,
    ids: ['q'],
    toolCallId: 'tool',
    approved: true,
    remember: false,
    imageId: 'i',
    messageId: 'm',
    level: 'high',
    after: 0,
    title: 'x',
    artifactId: 'a',
    value: 'cloud:m',
    presetId: 'custom',
    modelId: 'm',
    id: 'p',
    document: 'x',
    name: 'p',
    bytes: new Uint8Array([0, 255]),
    url: 'https://github.com/a/b',
    repository: 'a/b',
    revision: 'abc',
    path: 'SKILL.md',
    autoRun: true,
    showInTranscript: false,
    resultId: 'result',
    transcriptText: 'x',
    content: 'x'
  }
  const result = {
    GetAgentUiTasks: [sample.UiTask],
    GetAgentThread: thread,
    CreateAgentThread: blank,
    SendAgentMessage: thread,
    SelectAgentImages: thread,
    RemoveAgentImage: thread,
    StopAgentRun: null,
    SelectAgentBranch: thread,
    SetAgentThinkingLevel: thread,
    GetAgentEvents: sample.Recovery,
    ListAgentHistory: [summary],
    ListAgentThreads: [summary],
    RenameAgentThread: [summary],
    DeleteAgentThread: [summary],
    SaveAgentArtifact: false,
    TakeAgentNotificationTarget: null,
    GetAgentThinkingOptions: thinking,
    GetAgentComposerOptions: composer,
    GetSnapshot: settings,
    ListPresets: [sample.Preset],
    LookupCatalogModel: caps,
    ListCatalogModels: [sample.CatalogOption],
    ListRemoteModels: [sample.CatalogOption],
    UpsertProvider: settings,
    DeleteProvider: settings,
    SetActiveProvider: settings,
    GetCloudModels: sample.CloudModels,
    SetCloudModel: settings,
    UpsertPrompt: prompt,
    CustomizeSkill: prompt,
    ImportSkillDocument: prompt,
    ImportSkillUpload: prompt,
    InspectGitHubSkills: sample.GithubSource,
    ImportGitHubSkill: prompt,
    SetSkillAutoRun: settings,
    SetSkillTranscriptVisibility: settings,
    ExportSkillDocument: 'x',
    DeletePrompt: settings,
    RestoreDefaultPrompts: settings,
    StartPrompt: promptRun,
    StopPrompt: promptRun,
    GetPromptRun: promptRun,
    TestProvider: sample.ProviderTest
  }
  for (const rpc of C.AiRpcs.requests.values()) {
    const name = rpc._tag.slice(3),
      streams = RpcSchema.getStreamSchemas(rpc.successSchema)
    const input =
      rpc.payloadSchema === S.Void
        ? undefined
        : S.decodeUnknownSync(rpc.payloadSchema)(S.encodeUnknownSync(rpc.payloadSchema)(common))
    round(rpc.payloadSchema, input)
    if (streams._tag === 'Some') {
      const schema = streams.value.success
      const family =
        name === 'WatchAgentEvents'
          ? 'ai.agent'
          : name === 'WatchSettings'
            ? 'ai.settings'
            : name === 'WatchPromptRuns'
              ? 'ai.prompt'
              : 'ai.clicks'
      const tok = { ...token, family }
      round(schema, { _tag: 'Registered', token: tok, epoch: 'e' })
      const value =
        name === 'WatchAgentEvents'
          ? { kind: 'event', event }
          : name === 'WatchPromptRuns'
            ? { kind: 'snapshot', snapshot: promptRun }
            : { kind: 'changed' }
      round(schema, { _tag: 'Observation', token: tok, epoch: 'e', sequence: 1, value })
      round(
        streams.value.error,
        C.AiStreamOverflow.make({ stream: family, message: 'StreamOverflow' })
      )
    } else {
      round(rpc.successSchema, { exit: { _tag: 'Success', value: result[name] }, cuts: [cut] })
      round(rpc.successSchema, {
        exit: {
          _tag: 'Failure',
          error: C.AiOperationError.make({ operation: name, message: 'Unknown conversation' })
        },
        cuts: [cut]
      })
    }
    round(
      streams._tag === 'Some' ? streams.value.error : rpc.errorSchema,
      (
        await import('../../src/renderer/src/transport/DocumentDelivery.errors.js')
      ).DeliveryError.make({ reason: 'RegistrationClosed', message: 'RegistrationClosed' })
    )
    count.rpcs++
  }
  for (const [schema, value] of [
    [SaveScope, { thread: undefined, messageIds: ['m'] }],
    [Entry, { id: 'entry', type: 'custom', parentId: null, extra: undefined }],
    [PiEvent, { type: 'message_end', message: { extra: null } }],
    [
      ToolDefinition,
      { name: 'read', label: 'Read', description: 'x', parameters: { type: 'object' } }
    ]
  ]) {
    round(schema, value)
    count.schemas++
  }
  assert.equal(count.rpcs, 51)
  console.log(JSON.stringify(count))
})
