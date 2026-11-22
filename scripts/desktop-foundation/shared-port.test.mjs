import { expect, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as S from 'effect/Schema'
import { sourceLoader } from './source-harness.mjs'

const old = sourceLoader()
const current = sourceLoader()
const baseline = 'scripts/desktop-foundation/fixtures/shared-port/'
const shared = 'apps/desktop/src/shared/'
const observe = (fn, args) => {
  try { return { value: fn(...args) } }
  catch (error) { return { error: error.name, message: error.message } }
}
const compare = (name, inputs) => {
  const [file, symbol] = name
  for (const args of inputs) {
    const actual = observe(current(shared + file)[symbol], args)
    const expected = observe(old(baseline + file)[symbol], args)
    // These pure helpers construct no application errors. Out-of-type engine failures need only fail.
    if ('error' in expected) expect(actual).toHaveProperty('error')
    else expect(actual).toEqual(expected)
  }
}

it.effect('preserves permission missing/invalid distinctions against aeb83777', () => Effect.sync(() => {
  compare(['agent-permissions.ts', 'parseAgentPermissionMode'], [undefined, null, NaN, 0, 1, false, true, '', 'ask', 'auto', 'full', 'legacy', 'constructor', '__proto__', 'toString'].map(value => [value]))
}))

it.effect('preserves URL identity including malformed and unusual pages', () => Effect.sync(() => {
  compare(['video-identity.ts', 'videoIdentityFromUrl'], [undefined, null, NaN, 0, false, '', 'constructor', '__proto__', 'not a url',
    ' https://youtu.be/abcdefghijk ', 'https://www.youtube.com/watch?v=abcdefghijk',
    'https://youtube.com/shorts/abcdefghijk', 'https://youtube.com/live/abcdefghijk',
    'https://youtube.com/embed/abcdefghijk', 'https://youtube.com/watch?v=short',
    'ftp://youtube.com/watch?v=abcdefghijk', 'https://constructor/watch?v=abcdefghijk',
    'https://bilibili.com/video/BV1234567890', 'https://bilibili.com/list/1?bvid=BV1234567890&p=2',
    ...['', '0', '-1', 'NaN', 'Infinity', '1.5', '9007199254740992', '2'].map(page => `https://bilibili.com/video/BV1234567890?p=${page}`)
  ].map(value => [value]))
}))

it.effect('preserves native audio path membership', () => Effect.sync(() => {
  compare(['utils/native-playable.ts', 'isNativelyPlayableAudio'], [undefined, null, NaN, 0, false, '', 'constructor', '__proto__', '.mp3', 'file.',
    'x/FILE.MP3', 'x\\FILE.FLAC', 'a.b/track', 'track.m4a', 'track.mp4', 'track.opus', 'track.wav', 'track.aac', 'track.ogg', 'x/'.repeat(10000) + 'audio.mp3'].map(value => [value]))
}))

it.effect('preserves What’s New ordering, ties, NaN, sparse lists and fallback selection', () => Effect.sync(() => {
  const inputs = []
  for (const lastSeenWhatsNew of [undefined, null, '', ' ', 'ai-transcripts', 'old', 'constructor', NaN, false, 0]) {
    for (const isReturningUser of [true, false]) inputs.push([{ lastSeenWhatsNew, isReturningUser }])
  }
  compare(['whats-new.ts', 'shouldShowWhatsNew'], inputs)
  const rows = [[], [{downloadTaskId: 'a', listState: 'completed'}],
    [{downloadTaskId: 'a', listState: 'running', updatedAt: 99}, {downloadTaskId: 'b', listState: 'completed', updatedAt: 1}],
    [{downloadTaskId: 'a', listState: 'queued', updatedAt: 2}, {downloadTaskId: 'b', listState: 'running', updatedAt: 2}],
    [{downloadTaskId: 'constructor', listState: 'constructor', updatedAt: 1}],
    [{downloadTaskId: '', listState: 'completed', updatedAt: 1}],
    [{downloadTaskId: 'a', listState: 'completed', updatedAt: NaN}, {downloadTaskId: 'b', listState: 'completed', updatedAt: Number.MAX_VALUE}],
    [,, {downloadTaskId: 'after-hole', listState: 'completed', updatedAt: 1}]]
  compare(['whats-new.ts', 'pickWhatsNewTranscriptId'], rows.map(value => [value]))
}))

it.effect('matches subtitle schema acceptance and decoded output and retains exact zod compatibility errors', () => Effect.sync(() => {
  const legacy = old(baseline + 'agent-subtitles.ts').agentSubtitleInputSchema
  const compatibility = current('apps/desktop/src/compatibility/shared/agent-subtitles.ts').agentSubtitleInputSchema
  const model = current(shared + 'agent-subtitles.ts').AgentSubtitleInput
  const cue = {start: 0, end: 1, text: ' caption '}
  const valid = {language: ' en ', cues: [cue]}
  const inputs = [undefined, null, false, true, NaN, Infinity, Number.MAX_VALUE, '', 'constructor', '__proto__', {}, valid,
    {...valid, append: undefined}, {...valid, extra: true}, {...valid, cues: [{...cue, extra: true}]},
    {...valid, cues: Array.from({length: 500}, () => cue)}, {...valid, cues: Array.from({length: 501}, () => cue)},
    {...valid, cues: [{start: 1, end: 0.5, text: ' end before start is accepted '}]}]
  for (const key of ['language', 'append', 'cues']) for (const value of [undefined, null, false, true, NaN, 0, 1, Number.MAX_VALUE, '', 'constructor', '__proto__', []]) inputs.push({...valid, [key]: value})
  for (const key of ['start', 'end', 'text']) for (const value of [undefined, null, false, NaN, Infinity, -1, 0, 0.5, 604800, 604801, Number.MAX_VALUE, '', ' ', 'x'.repeat(4001)]) inputs.push({...valid, cues: [{...cue, [key]: value}]})
  for (const input of inputs) {
    const expected = legacy.safeParse(input)
    expect(compatibility.safeParse(input)).toEqual(expected)
    const actual = S.decodeUnknownExit(model)(input)
    expect(actual._tag === 'Success', `subtitle input ${String(JSON.stringify(input))}`).toBe(expected.success)
    if (expected.success) expect(actual.value).toEqual(expected.data)
    expect(observe(value => compatibility.parse(value), [input])).toEqual(observe(value => legacy.parse(value), [input]))
  }
}))

it.effect('keeps DTO fields mutable, optional and finite without adding constructor side effects', () => Effect.sync(() => {
  const definitions = [
    ['types/player.ts', 'PlayerAttachInput', {filePath: '/fixture/video.mp4'}],
    ['types/player.ts', 'PlayerAttachResult', {playablePath: '/fixture/video.mp4', reason: undefined}],
    ['types/mermaid-export.ts', 'MermaidExportPayload', {source: 'graph TD; A-->B', format: 'svg', theme: 'dark'}],
    ['types/mermaid-export.ts', 'MermaidExportImage', {data: new Uint8Array([1, 2]), width: 2, height: 1}],
    ['types/ytdlp-kernel.ts', 'YtDlpKernelStatus', {ready: false, state: 'preparing', source: null, ytDlpVersion: null, nodeVersion: null, progress: null, preparationStep: null, error: null}],
    ['agent-notifications.ts', 'AgentNotificationTarget', {threadId: '__proto__', downloadId: 'constructor', promptId: 'toString'}],
    ['skill-install.ts', 'GitHubSkillSource', {repository: 'owner/repository', revision: 'main', paths: ['SKILL.md']}],
    ['skill-install.ts', 'GitHubSkillInstallInput', {repository: 'owner/repository', revision: 'main', path: 'SKILL.md'}],
    ['mcp.ts', 'DesktopMcpStatus', {enabled: true, running: false, url: null, configPath: '/fixture/mcp.json', toolCount: 0, httpConfig: '{}'}],
    ['mcp.ts', 'DesktopMcpCapability', {name: 'test', labelKey: 'test.label', description: 'Test capability'}],
    ['mcp.ts', 'DesktopMcpCapabilityGroup', {id: 'constructor', kind: 'tools', items: []}],
    ['types/auth.ts', 'DesktopAuthUser', {email: 'fixture@example.invalid', id: 'constructor', image: null, name: 'Fixture'}],
    ['types/auth.ts', 'DesktopAccountOverview', {credits: {byFeature: {prompt: 0, transcription: 0}, expiringSoonCredits: 0, quotaCredits: 0, remainingCredits: 0, reservedCredits: 0, usedCredits: 0}, reservations: [], invitationOverview: {code: 'fixture', earnedCredits: 0, invitedUsers: 0, inviteUrl: 'https://fixture.invalid'}, invitedUsers: {items: [], nextCursor: null}, giftedCreditRecords: {items: [], nextCursor: null}}]
  ]
  for (const [file, name, input] of definitions) {
    const schema = current(shared + file)[name]
    const decoded = S.decodeUnknownSync(schema)(input)
    expect(decoded).toEqual(input)
    expect(Object.isFrozen(decoded)).toBe(false)
    for (const value of [undefined, null, false, NaN, Number.MAX_VALUE, 'constructor', '__proto__']) expect(S.decodeUnknownExit(schema)(value)._tag).toBe('Failure')
    const extra = S.decodeUnknownSync(schema)({...input, unknownKey: 'ignored'})
    expect(extra).not.toHaveProperty('unknownKey')
    for (const [key, value] of Object.entries(input)) {
      if (typeof value === 'number') expect(S.decodeUnknownExit(schema)({...input, [key]: NaN})._tag).toBe('Failure')
    }
  }
}))

it.effect('preserves icon menu derivation, equality and command guards', () => Effect.sync(() => {
  const states = []
  for (const playlistCount of [NaN, -1, 0, 1, 2, Number.MAX_VALUE]) for (const sessionId of [null, '', 'constructor']) for (const playing of [true, false]) {
    const input = {playlistCount, sessionId, playing}
    compare(['app-icon-menu.ts', 'buildAppIconMenuState'], [[input]])
    states.push(old(baseline + 'app-icon-menu.ts').buildAppIconMenuState(input))
  }
  compare(['app-icon-menu.ts', 'isAppIconMenuCommand'], [undefined, null, NaN, 0, false, '', 'next', 'previous', 'toggle', 'constructor', '__proto__'].map(value => [value]))
  for (const left of states) for (const right of states) {
    compare(['app-icon-menu.ts', 'sameAppIconMenuState'], [[left, right]])
    expect(current(shared + 'app-icon-menu.ts').sameAppIconMenuState(right)(left)).toBe(old(baseline + 'app-icon-menu.ts').sameAppIconMenuState(left, right))
  }
}))
