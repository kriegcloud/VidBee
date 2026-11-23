import { Transpiler } from 'bun'
// Frozen design corpus: native source-extraction oracle; production declarations/codecs are strict TS.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import { it } from '@effect/vitest'
import { SocialMediaOptionsSchema } from '@vidbee/downloader-core/social-media'
import * as E from 'effect/Effect'
import * as X from 'effect/Exit'
import * as O from 'effect/Option'
import * as Rpc from 'effect/rpc/Rpc'
import * as RS from 'effect/rpc/RpcSchema'
import * as Ser from 'effect/rpc/RpcSerialization'
import * as S from 'effect/Schema'
import {
  projectTaskForRenderer,
  projectTaskForRendererHistory
} from '../../src/main/lib/projection.ts'
import { getDisplayFormats } from '../../src/renderer/src/components/download/format-presentation.ts'
import * as C from '../../src/renderer/src/transport/census/Downloads.rpc.js'
import { failure } from '../../src/renderer/src/transport/DocumentDelivery.errors.js'
import { ObservedValue } from '../../src/renderer/src/transport/RpcObservation.model.js'

it('frozen Downloads complete declaration and real producer codec census', async () => {
  const transformSync = (source) => ({
    code: new Transpiler({ loader: 'ts' }).transformSync(source)
  })

  const v = process.cwd()
  const compare = (a, b, p = '$') => {
    assert.equal(typeof b, typeof a, p)
    if (a === null || typeof a !== 'object') {
      assert.ok(Object.is(a, b), p)
      return
    }
    if (a instanceof Uint8Array) {
      assert.deepEqual(b, a)
      return
    }
    assert.equal(Array.isArray(a), Array.isArray(b), p)
    assert.deepEqual(Object.keys(b).sort(), Object.keys(a).sort(), `${p} keys`)
    if (Array.isArray(a)) {
      assert.equal(a.length, b.length, `${p} length`)
    }
    for (const k of Object.keys(a)) {
      assert.ok(Object.hasOwn(b, k), p + k)
      compare(a[k], b[k], `${p}.${k}`)
    }
  }
  const round = async (schema, value) => {
    const codec = Ser.json.codecFor(schema)
    const encoded = await E.runPromise(S.encodeEffect(codec)(value))
    const parser = Ser.json.makeUnsafe()
    const frame = parser.encode({ value: encoded })
    assert.equal(typeof frame, 'string')
    return E.runPromise(S.decodeUnknownEffect(codec)(parser.decode(frame)[0].value))
  }
  const token = { document: 'doc', client: 'client', generation: 1, family: 'downloads', serial: 1 }
  const cut = { token, epoch: 'app', through: 1 }
  const golden = JSON.parse(
    fs.readFileSync(`${v}/apps/desktop/test/golden/extension-api--metadata-success.json`)
  ).response.body
  const format = {
    ...golden.formats[0],
    vcodec: 'avc1',
    extra: {
      u: undefined,
      n: null,
      z: -0,
      nan: Number.NaN,
      positive: Number.POSITIVE_INFINITY,
      negative: Number.NEGATIVE_INFINITY,
      marker: { _tag: 'RpcUndefined' },
      unknown: 1
    }
  }
  assert.equal(getDisplayFormats({ formats: [format], type: 'video' }).videoFormats[0], format)
  const source = fs.readFileSync(`${v}/apps/desktop/src/main/lib/yt-dlp-info.ts`, 'utf8')
  const inflate = new Function(
    `${
      transformSync(
        source.slice(
          source.indexOf('const inflateEstimatedSizes'),
          source.indexOf('const parseVideoInfoPayload')
        ),
        { loader: 'ts' }
      ).code
    };return inflateEstimatedSizes`
  )()
  const info = inflate(
    JSON.parse(
      '{"id":"i","title":"t","duration":1e308,"formats":[{"format_id":"f","ext":"mp4","tbr":1e308}]}'
    )
  )
  assert.equal(info.formats[0].filesize_approx, Number.POSITIVE_INFINITY)
  info.extra = { u: undefined, n: null, z: -0 }
  const summary = {
    posts: 2,
    images: 1,
    videos: 1,
    downloaded: 2,
    existing: 0,
    failed: 0,
    totalSize: 8,
    reason: 'exhausted',
    manifestPath: '/fixture/manifest',
    startedAt: 1
  }
  const task = {
    id: 't',
    kind: 'social-media',
    input: {
      url: 'https://fixture.invalid/v',
      kind: 'social-media',
      options: { sourceMediaKind: 'mixed', selectedFormat: format }
    },
    groupKey: 'g',
    priority: 10,
    status: 'completed',
    prevStatus: 'running',
    statusReason: null,
    enteredStatusAt: 3,
    attempt: 0,
    maxAttempts: 5,
    createdAt: 1,
    updatedAt: 3,
    nextRetryAt: null,
    pid: null,
    pidStartedAt: null,
    progress: {
      percent: 100,
      bytesDownloaded: 8,
      bytesTotal: 8,
      speedBps: null,
      etaMs: null,
      ticks: 1
    },
    output: {
      filePath: '/fixture/video.mp4',
      size: 8,
      durationMs: null,
      sha256: null,
      collectionSummary: summary
    },
    lastError: null,
    parentId: null
  }
  const active = projectTaskForRenderer(task),
    history = projectTaskForRendererHistory(task)
  const unusual = projectTaskForRenderer({
    ...task,
    progress: { ...task.progress, percent: Number.NaN }
  })
  assert.ok(Number.isNaN(unusual.progress.percent))
  const profile = {
    username: 'fixture',
    profileUrl: 'https://onlyfans.com/fixture',
    state: 'idle',
    updatedAt: 1,
    pages: 0,
    items: [],
    error: undefined
  }
  const social = {
    profileUrl: 'https://x.com/fixture',
    platform: 'x',
    owner: 'fixture',
    categories: { posts: { state: 'partial', items: [], error: undefined } },
    updatedAt: 1
  }
  const inspection = {
    inspectionId: 'i',
    expiresAt: 1,
    complete: false,
    profile: {
      username: 'fixture',
      profileUrl: 'https://www.instagram.com/fixture/',
      displayName: undefined
    },
    categories: [],
    totalSourceCount: 0,
    totalAssetCount: 0,
    mapping: undefined
  }
  const caption = {
    kind: 'caption',
    quote: { after: '', before: '', quote: 'text', startMs: 0, endMs: 1 },
    tagline: 't',
    coverSrc: null,
    sourceByline: undefined
  }
  const prompt = {
    kind: 'prompt',
    markdown: 'm',
    promptTitle: 'p',
    tagline: 't',
    userText: null,
    artifacts: [],
    userSkills: [{ name: 's', label: undefined }]
  }
  const connection = {
    connected: false,
    browser: undefined,
    sites: [],
    sources: [{ id: 's', browser: 'chrome', connected: false, sites: [], lastSeenAt: undefined }]
  }
  const ready = { requestId: 0, width: 0, height: 0 }
  const playlist = {
    id: 'p',
    title: 'p',
    entries: [
      { id: 'e', title: 'e', url: 'https://fixture.invalid/e', index: 1, thumbnail: undefined }
    ],
    entryCount: 1
  }
  const options = {
    url: 'https://fixture.invalid/v',
    type: 'video',
    selectedFormat: format,
    thumbnail: null,
    title: undefined,
    duration: -0
  }
  const result = {
    groupId: 'g',
    playlistId: 'p',
    playlistTitle: 'p',
    type: 'video',
    totalCount: 1,
    startIndex: 1,
    endIndex: 1,
    entries: [
      { downloadId: 'd', entryId: 'e', title: 'e', url: 'https://fixture.invalid/e', index: 1 }
    ]
  }
  const samples = {
    ObservedNumber: Number.NaN,
    VideoFormat: format,
    VideoInfo: { id: 'i', title: 't', formats: [format], thumbnail: null },
    DownloadOptions: options,
    PlaylistEntry: playlist.entries[0],
    PlaylistInfo: playlist,
    PlaylistDownloadOptions: { url: options.url, type: 'video' },
    PlaylistDownloadEntry: result.entries[0],
    PlaylistDownloadResult: result,
    DownloadProgress: { percent: 0, indeterminate: undefined },
    DownloadItem: active,
    DownloadHistoryItem: history,
    VideoInfoCommandResult: { ytDlpCommand: 'yt-dlp', info },
    LocalPosterRequest: { filePath: null, directory: undefined },
    PlayerAttachInput: { filePath: '/fixture/v' },
    PlayerAttachResult: { playablePath: '/fixture/v', reason: undefined },
    AppIconMenuState: { canNext: false, canPrevious: false, canToggle: true, playing: false },
    PathResult: { path: '/fixture/out' },
    CountResult: { count: 1 },
    ExtensionSource: connection.sources[0],
    ExtensionConnection: connection,
    Validation: { valid: false, reason: undefined },
    ExportVideoSource: { url: options.url, label: undefined },
    AgentArtifact: {
      id: 'a',
      threadId: 'th',
      runId: 'r',
      kind: 'image',
      name: 'n',
      path: '/fixture/i',
      start: 0,
      end: undefined
    },
    AgentSkillLabel: { name: 's', label: undefined },
    SharePayload: caption,
    MermaidPayload: { source: 'graph TD;A-->B', format: 'png', theme: 'dark' },
    MermaidImage: { data: new Uint8Array([0, 1, 255]), width: 1, height: 1 },
    ShareReady: ready,
    DownloadEvent: { _tag: 'Queued', item: active },
    DownloadStatus: 'pending',
    FailureKind: 'metadata'
  }
  const codecs = {
    ObservedNumber: C.ObservedNumber,
    VideoFormat: C.VideoFormat,
    VideoInfo: C.VideoInfo,
    DownloadOptions: C.DownloadOptions,
    PlaylistEntry: C.PlaylistEntry,
    PlaylistInfo: C.PlaylistInfo,
    PlaylistDownloadOptions: C.PlaylistDownloadOptions,
    PlaylistDownloadEntry: C.PlaylistDownloadEntry,
    PlaylistDownloadResult: C.PlaylistDownloadResult,
    DownloadProgress: C.DownloadProgress,
    DownloadItem: C.DownloadItem,
    DownloadHistoryItem: C.DownloadHistoryItem,
    VideoInfoCommandResult: C.VideoInfoCommandResult,
    LocalPosterRequest: C.LocalPosterRequest,
    PlayerAttachInput: C.PlayerAttachInput,
    PlayerAttachResult: C.PlayerAttachResult,
    AppIconMenuState: C.AppIconMenuState,
    PathResult: C.PathResult,
    CountResult: C.CountResult,
    ExtensionSource: C.ExtensionSource,
    ExtensionConnection: C.ExtensionConnection,
    Validation: C.Validation,
    ExportVideoSource: C.ExportVideoSource,
    AgentArtifact: C.AgentArtifact,
    AgentSkillLabel: C.AgentSkillLabel,
    SharePayload: C.SharePayload,
    MermaidPayload: C.MermaidPayload,
    MermaidImage: C.MermaidImage,
    ShareReady: C.ShareReady,
    DownloadEvent: C.DownloadEvent,
    DownloadStatus: C.DownloadStatus,
    FailureKind: C.FailureKind
  }
  for (const [name, value] of Object.entries(samples)) {
    const schema = codecs[name]
    const output = await round(schema, value)
    compare(value, output, `schema:${name}`)
  }
  compare(prompt, await round(C.SharePayload, prompt))
  const cases = {}
  const put = (tags, payload, value) => {
    for (const tag of tags.split(' ')) {
      cases[tag] = [payload, value]
    }
  }
  const D = 'Downloads.'
  put(
    ['FanslyProfileCommand', 'OnlyFansProfileCommand'].map((t) => D + t).join(' '),
    { input: { url: profile.profileUrl, action: 'get', category: undefined } },
    profile
  )
  put(`${D}ListFanslyProfiles ${D}ListOnlyFansProfiles`, undefined, [profile])
  put(
    `${D}DownloadFanslyProfile ${D}DownloadOnlyFansProfile`,
    { input: { url: profile.profileUrl, itemIds: ['1'], customDownloadPath: undefined } },
    { count: 1 }
  )
  put(
    `${D}InspectSocialMedia`,
    { url: options.url },
    {
      source: {
        platform: 'x',
        url: 'https://x.com/fixture/status/1',
        kind: 'post',
        category: 'posts',
        owner: 'fixture',
        supportsThread: true,
        requiresAuth: true,
        categories: []
      },
      preview: { posts: 1, images: 0, videos: 1, limited: false }
    }
  )
  put(`${D}OpenSocialProfileLogin`, { url: social.profileUrl }, undefined)
  put(`${D}GetSocialProfile ${D}StopSocialProfile`, { url: social.profileUrl }, social)
  put(`${D}ListSocialProfiles`, undefined, [social])
  put(`${D}MapSocialProfile`, { url: social.profileUrl, category: 'posts' }, social)
  put(`${D}ResolveUrl`, { url: options.url }, options.url)
  put(`${D}GetVideoInfo`, { url: options.url }, info)
  put(`${D}GetVideoInfoWithCommand`, { url: options.url }, { info, ytDlpCommand: 'yt-dlp' })
  put(`${D}GetPlaylistInfo`, { url: options.url }, playlist)
  put(`${D}CancelInstagramProfileMapping`, { url: options.url }, false)
  put(
    `${D}DownloadSocialProfileItems`,
    { url: social.profileUrl, category: 'posts', ids: ['1'], destination: undefined },
    { count: 1 }
  )
  put(
    `${D}DownloadSocialMedia`,
    { request: { url: social.profileUrl } },
    { groupId: 'g', ids: ['t'] }
  )
  put(`${D}ListInstagramProfiles`, undefined, [
    {
      inspectionId: 'i',
      profile: inspection.profile,
      totalSourceCount: 0,
      totalAssetCount: 0,
      mapping: undefined
    }
  ])
  put(
    `${D}InspectInstagramProfile`,
    { url: inspection.profile.profileUrl, categories: undefined },
    inspection
  )
  put(`${D}StartDownload`, { id: 't', options }, false)
  put(
    `${D}CancelDownload ${D}PauseDownload ${D}ResumeDownload ${D}RetryDownload`,
    { id: 't' },
    true
  )
  put(`${D}CancelAllDownloads`, undefined, { cancelled: 1, failed: 0 })
  put(`${D}GetQueueStatus`, undefined, { active: 1, pending: 0 })
  put(`${D}GetActiveDownloads`, { token }, [active])
  put(
    `${D}UpdateDownloadInfo`,
    { id: 't', updates: { thumbnail: undefined, selectedFormat: format } },
    undefined
  )
  put(`${D}StartPlaylistDownload`, { options: { url: options.url, type: 'video' } }, result)
  put(
    `${D}StartInstagramProfileDownload`,
    { input: { inspectionId: 'i', categories: ['posts'] } },
    { groupId: 'g', username: 'fixture', totalSourceCount: 0, totalAssetCount: 0, tasks: [] }
  )
  put('History.GetHistory', { token }, [history])
  put('History.GetHistoryById', { id: 't' }, history)
  put('History.AddHistoryItem', { item: history }, undefined)
  put('History.RemoveHistoryItem', { id: 't' }, true)
  put('History.RemoveHistoryItems', { ids: ['t'] }, 1)
  put('History.RemoveHistoryByPlaylistId', { playlistId: 'p' }, 1)
  put('History.ClearHistory', undefined, undefined)
  put('History.GetHistoryCount', undefined, {
    active: 0,
    completed: 1,
    error: 0,
    cancelled: 0,
    total: 1
  })
  put('Thumbnail.GetThumbnailPath', { url: null }, null)
  put('Thumbnail.GetLocalPoster', { request: { filePath: null, directory: undefined } }, null)
  put(
    'Player.Attach',
    { input: { filePath: '/fixture/v' } },
    { playablePath: '/fixture/v', reason: undefined }
  )
  put('Player.Detach', undefined, undefined)
  put('Player.SyncIconMenu', { state: samples.AppIconMenuState }, undefined)
  put('Files.ReadClipboardFilePaths', undefined, [])
  put('Files.SelectDirectory Files.SelectFile', undefined, null)
  put('Files.SelectMediaFiles', undefined, [])
  put('Files.GetDefaultDownloadPath', undefined, '/fixture/downloads')
  put('Files.OpenMacFilesAndFoldersSettings', undefined, false)
  put(
    'Files.OpenFileLocation Files.OpenFile Files.CopyFileToClipboard Files.FileExists',
    { filePath: '/fixture/v' },
    false
  )
  put('Files.DeleteFile', { filePath: '/fixture/v', allowMissing: undefined }, false)
  put('Files.OpenExternal', { url: options.url }, true)
  put(
    'Files.ValidateCookiesFile',
    { filePath: '/fixture/c' },
    { valid: false, reason: 'not-found' }
  )
  put(
    'Files.SaveTextFile',
    {
      options: {
        content: 'x',
        defaultFileName: 'x.md',
        source: { url: options.url, label: undefined }
      }
    },
    { path: '/fixture/x.md' }
  )
  put(
    'Files.SaveMarkdownPdf',
    { options: { markdown: 'x', defaultFileName: 'x.pdf', title: undefined } },
    null
  )
  put(
    'Files.SaveBinaryFile',
    { options: { data: new Uint8Array([0, 1, 255]), defaultFileName: 'x.png' } },
    null
  )
  put(
    'Files.SaveSplitShareImage',
    { options: { payload: caption, defaultFileName: 'x.png', imageCount: undefined } },
    { path: '/fixture/x', count: 1 }
  )
  put(
    'Files.ShareFile',
    { options: { data: new Uint8Array([0, 1, 255]), fileName: 'x.png' } },
    false
  )
  put(
    'Files.ShowDownloadCompletedNotification',
    { title: 't', body: 'b', filePaths: [], downloadPath: '/fixture' },
    true
  )
  put('BrowserCookies.ListInstalledBrowsers', undefined, [{ id: 'chrome', supported: true }])
  put('BrowserCookies.GetExtensionConnection', undefined, connection)
  put('BrowserCookies.SetExtensionSourceOrder', { sourceIds: ['s'] }, connection)
  put('BrowserCookies.RemoveExtensionSource', { sourceId: 's' }, connection)
  put(
    'BrowserCookies.InspectCookieHealth',
    { input: { browser: 'none', profile: '', cookiesPath: '' } },
    { status: 'unconfigured', source: 'none', sites: [], reason: undefined }
  )
  put('BrowserCookies.GetBrowserProfilePath', { browser: 'none' }, '')
  put(
    'BrowserCookies.ValidateBrowserProfilePath',
    { browser: 'chrome', profilePath: '' },
    { valid: false, reason: undefined }
  )
  put(
    'ShareCapture.Ready',
    {
      message: ready,
      tokens: [
        { ...token, family: 'capture-card' },
        { ...token, family: 'capture-mermaid' }
      ]
    },
    undefined
  )
  const streams = {
    'Downloads.WatchDeeplink': { url: options.url, type: 'single' },
    'Downloads.Watch': { _tag: 'Queued', item: active },
    'Player.WatchIconMenu': 'toggle',
    'ShareCapture.Watch': { requestId: 1, payload: prompt },
    'ShareCapture.WatchMermaid': { requestId: 1, payload: samples.MermaidPayload }
  }
  for (const value of [
    { _tag: 'Updated', id: 't', updates: { thumbnail: undefined, selectedFormat: format } },
    { _tag: 'Started', id: 't' },
    { _tag: 'Progress', id: 't', progress: { percent: 0, indeterminate: undefined } },
    { _tag: 'Log', id: 't', chunk: 'one\ntwo\n' },
    { _tag: 'Completed', id: 't' },
    { _tag: 'Error', id: 't', error: 'Download failed' },
    { _tag: 'Cancelled', id: 't' },
    { _tag: 'Removed', id: 't' }
  ]) {
    compare(value, await round(C.DownloadEvent, value))
  }
  compare(
    {
      requestId: 1,
      width: 1,
      height: 1,
      diagram: samples.MermaidImage,
      error: undefined,
      layout: {
        width: 1,
        height: 1,
        padding: 0,
        safeBreaks: [],
        preferredBreaks: [],
        footerTop: undefined
      }
    },
    await round(C.ShareReady, {
      requestId: 1,
      width: 1,
      height: 1,
      diagram: samples.MermaidImage,
      error: undefined,
      layout: {
        width: 1,
        height: 1,
        padding: 0,
        safeBreaks: [],
        preferredBreaks: [],
        footerTop: undefined
      }
    })
  )
  let count = 0
  const fail = []
  for (const group of Object.values(C).filter((v) => v?.requests)) {
    for (const [tag, rpc] of group.requests) {
      try {
        const stream = RS.getStreamSchemas(rpc.successSchema)
        const err = C.DownloadsFailure.make({
          operation: tag,
          kind: 'metadata',
          message: 'Failed to parse video info: fixture'
        })
        if (O.isSome(stream)) {
          compare(undefined, await round(rpc.payloadSchema, undefined))
          const sch = stream.value.success
          for (const value of [
            { _tag: 'Registered', token, epoch: 'app' },
            { _tag: 'Observation', token, epoch: 'app', sequence: 1, value: streams[tag] }
          ]) {
            compare(value, await round(sch, value), tag)
          }
          await round(Rpc.exitSchema(rpc), X.void)
          await round(Rpc.exitSchema(rpc), X.fail(failure('StreamOverflow')))
        } else {
          assert.ok(Object.hasOwn(cases, tag), `${tag} missing corpus`)
          const [payload, value] = cases[tag]
          compare(payload, await round(rpc.payloadSchema, payload), `${tag} payload`)
          for (const completion of [
            { exit: { _tag: 'Success', value }, cuts: [cut] },
            { exit: { _tag: 'Failure', error: err }, cuts: [cut] }
          ]) {
            const out = await round(rpc.successSchema, completion)
            if (completion.exit._tag === 'Success') {
              compare(value, out.exit.value, `${tag} success`)
            } else {
              assert.equal(out.exit.error.message, err.message)
            }
            assert.deepEqual(out.cuts, [cut])
            await round(Rpc.exitSchema(rpc), X.succeed(completion))
          }
          await round(Rpc.exitSchema(rpc), X.fail(failure('RegistrationClosed')))
        }
        count++
      } catch (e) {
        fail.push([tag, String(e)])
      }
    }
  }
  assert.deepEqual(fail, [])
  assert.equal(count, 77)
  compare(
    [unusual],
    (
      await round(C.DownloadsRpcs.requests.get('Downloads.GetActiveDownloads').successSchema, {
        exit: { _tag: 'Success', value: [unusual] },
        cuts: []
      })
    ).exit.value
  )
  // More than nominal variants: presence, null and unusual successful metadata roots.
  for (const value of [
    undefined,
    null,
    false,
    0,
    -0,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    '',
    [],
    { x: undefined, z: -0, n: null, extra: { _tag: 'RpcUndefined' } }
  ]) {
    compare(
      value,
      await round(C.DownloadsRpcs.requests.get('Downloads.GetVideoInfo').successSchema, {
        exit: { _tag: 'Success', value },
        cuts: []
      }).then((x) => x.exit.value)
    )
  }
  for (const value of [undefined, history]) {
    compare(
      value,
      (
        await round(C.HistoryRpcs.requests.get('History.GetHistoryById').successSchema, {
          exit: { _tag: 'Success', value },
          cuts: []
        })
      ).exit.value
    )
  }
  for (const variant of [{}, { url: undefined }, { url: null }, { url: '' }]) {
    compare(
      variant,
      await round(C.ThumbnailRpcs.requests.get('Thumbnail.GetThumbnailPath').payloadSchema, variant)
    )
  }
  for (const name of ['VideoFormat', 'VideoInfo', 'DownloadItem', 'DownloadHistoryItem']) {
    assert.throws(() => compare(samples[name], { id: samples[name].id }))
  }
  await assert.rejects(() => round(ObservedValue, new Array(1)))
  await assert.rejects(() => round(ObservedValue, Object.assign([], { extra: 1 })))
  // Actual tested operation mutation, not a wrapper-level negative control.
  const order = (a, b) => {
    if (a === null || typeof a !== 'object' || a instanceof Uint8Array) {
      return
    }
    assert.deepEqual(Object.keys(a), Object.keys(b))
    for (const key of Object.keys(a)) {
      order(a[key], b[key])
    }
  }
  for (const [tag, value] of [
    ['Downloads.GetActiveDownloads', [active]],
    ['History.GetHistory', [history]],
    ['Downloads.GetVideoInfo', info],
    ['Downloads.GetVideoInfoWithCommand', { info, ytDlpCommand: 'yt-dlp' }]
  ]) {
    const group = tag.startsWith('History') ? C.HistoryRpcs : C.DownloadsRpcs
    const out = await round(group.requests.get(tag).successSchema, {
      exit: { _tag: 'Success', value },
      cuts: []
    })
    order(value, out.exit.value)
  }
  const mutated = S.Struct({
    exit: S.TaggedStruct('Success', { value: S.Array(S.Struct({ id: S.String })) }),
    cuts: S.Array(S.Unknown)
  })
  const mutatedRpc = Rpc.make('Downloads.GetActiveDownloads', {
    payload: C.DownloadsRpcs.requests.get('Downloads.GetActiveDownloads').payloadSchema,
    success: mutated,
    error: C.DownloadsRpcs.requests.get('Downloads.GetActiveDownloads').errorSchema
  })
  const stripped = await round(mutatedRpc.successSchema, {
    exit: { _tag: 'Success', value: [active] },
    cuts: []
  })
  assert.throws(() => compare([active], stripped.exit.value))
  // Default-bearing Start input is transported intact; existing admission supplies defaults.
  for (const socialMedia of [{}, { media: 'images' }]) {
    const input = {
      id: 'partial',
      options: { url: 'https://x.com/fixture/status/1', type: 'video', socialMedia }
    }
    const out = await round(
      C.DownloadsRpcs.requests.get('Downloads.StartDownload').payloadSchema,
      input
    )
    compare(input, out)
    const admitted = await E.runPromise(
      S.decodeUnknownEffect(SocialMediaOptionsSchema)(out.options.socialMedia)
    )
    assert.deepEqual(admitted, {
      media: socialMedia.media ?? 'all',
      scope: 'post',
      authorOnly: false,
      expandThreads: false,
      linkedMedia: true,
      slideshowAudio: false
    })
  }
  console.log(
    'PASS StartDownload socialMedia {} and {media:"images"} preserve input without defaults; admission parser then supplies all six defaults'
  )
  console.log(
    JSON.stringify({
      schemas: Object.keys(samples).length,
      rpcs: count,
      streams: 5,
      unaries: 72,
      metadataInflationPreserved: info.formats[0].filesize_approx === Number.POSITIVE_INFINITY,
      presence: true,
      negativeControls: true
    })
  )
})
