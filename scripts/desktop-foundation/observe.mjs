import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { settingsHarness, sourceLoader, SourceImportError } from './source-harness.mjs'

export function observe(selection = 'all') {
  const temporary = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'foundation-'))
  const observations = {}
  try {
    if (selection === 'all' || selection === 'base') {
    const cases = {
      missing: undefined, empty: '', partial: '{"language":"fr"}', malformed: '{',
      unknown: JSON.stringify({ future: { nested: [1, null, 'x'] }, extensionCookieSources: [{ id: 'x', browser: 'test', future: 7 }] }),
      wrong: JSON.stringify({ theme: 42, language: false, launchAtLogin: null, asrTier: 'invalid',
        agentManagementTools: 'legacy', subtitleLanguages: [' en ', 3, 'en', 'fr'],
        ttsModelId: 'unknown-family-v1', transcriptionProvider: 'invalid', downloadMirror: 'invalid' }),
      nulls: JSON.stringify({ proxy: null, downloadPath: null, subtitleLanguages: null }),
      oldPath: JSON.stringify({ downloadPath: '/synthetic/home/Downloads' }),
      customPath: JSON.stringify({ downloadPath: '/external/media' }),
      current: JSON.stringify({ language: 'fr', lastSeenWhatsNew: 'ai-transcripts' }),
      stale: JSON.stringify({ language: 'fr', lastSeenWhatsNew: 'old' })
    }
    for (const [name, input] of Object.entries(cases)) {
      const directory = path.join(temporary, name)
      fs.mkdirSync(directory)
      if (input !== undefined) fs.writeFileSync(path.join(directory, 'config.json'), input)
      try {
        const h = settingsHarness(directory)
        const before = h.raw()
        const getAll = h.manager.getAll()
        const individual = Object.fromEntries(Object.keys(getAll).map((key) => [key, h.manager.get(key)]))
        const prompt = h.manager.shouldPromptWhatsNew()
        h.manager.applyFreshInstallLocale()
        h.manager.set('cookiesPath', '/synthetic/cookies.txt')
        const single = h.raw()
        h.manager.setAll({ proxy: 'http://fixture.invalid', 'future.deep': 9 })
        observations[name] = { before, getAll, individual, prompt, single, batch: h.raw(), trace: h.trace }
      } catch (error) { if (error instanceof SourceImportError) throw error; observations[name] = { error: { name: error.name, message: error.message } } }
    }
    for (const [name, options] of Object.entries({ portable: { portable: true }, mkdirFailure: { failMkdir: true },
      repairFailure: { failKey: 'agentManagementTools' } })) {
      const directory = path.join(temporary, name)
      fs.mkdirSync(directory)
      fs.writeFileSync(path.join(directory, 'config.json'), JSON.stringify({ downloadPath: '/portable/old/media',
        agentManagementTools: 'invalid', asrTier: 'invalid', subtitleLanguages: null, launchAtLogin: true }))
      const h = settingsHarness(directory, options)
      observations[name] = { raw: h.raw(), all: h.manager.getAll(), trace: h.trace }
    }
    const directory = path.join(temporary, 'writes')
    fs.mkdirSync(directory)
    const h = settingsHarness(directory)
    h.trace.length = 0
    h.manager.setAll({ launchAtLogin: false, hideDockIcon: false, language: 'de' })
    const ordered = h.trace.slice()
    h.options.failKey = 'hideDockIcon'
    let failure
    try { h.manager.setAll({ launchAtLogin: true, hideDockIcon: true, language: 'fr' }) }
    catch (error) { failure = error.message }
    const partial = h.raw()
    h.options.failKey = undefined
    const serialization = []
    for (const value of [undefined, null, NaN, 1n]) {
      try { h.manager.set('proxy', value); serialization.push({ ok: true, raw: h.raw().proxy ?? null }) }
      catch (error) { serialization.push({ error: error.name, message: error.message }) }
    }
    const cycle = {}; cycle.self = cycle
    try { h.manager.set('proxy', cycle) } catch (error) { serialization.push({ error: error.name }) }
    h.options.failClear = true
    try { h.manager.reset() } catch (error) { serialization.push({ resetClear: error.message }) }
    h.options.failClear = false
    h.options.failObject = true
    try { h.manager.reset() } catch (error) { serialization.push({ resetSet: error.message }) }
    h.options.failObject = false
    h.manager.reset()
    observations.writes = { ordered, failure, partial, serialization, reset: h.raw() }
    const effects = sourceLoader()('apps/desktop/src/main/lib/settings-effects.ts')
    const calls = []
    effects.applyBatchSettingSideEffects({ launchAtLogin: 'false', hideDockIcon: 0, language: undefined,
      maxConcurrentDownloads: '7', maxConcurrentTranscriptions: null }, {
      onLaunchAtLogin: (v) => calls.push(['login', v]), onHideDockIcon: (v) => calls.push(['dock', v]),
      onLanguage: () => calls.push(['language']), onMaxConcurrentDownloads: (v) => calls.push(['downloads', v]),
      onMaxConcurrentTranscriptions: (v) => calls.push(['transcriptions', v]) })
    observations.effects = calls
    h.trace.length = 0
    for (const [key, value] of Object.entries(h.manager.getAll())) h.manager.set(key, value)
    const singles = h.trace.slice()
    h.trace.length = 0
    h.manager.setAll(h.manager.getAll())
    observations.fieldFamilies = { singles, batch: h.trace.slice(), raw: h.raw() }
    observations.normalization = []
    for (const key of ['agentManagementTools', 'asrTier', 'ttsModelId', 'transcriptionProvider', 'downloadMirror']) {
      for (const value of [undefined, null, false, true, 0, '', 'legacy', 'auto', 'full', 'minimal', 'tiny', 'small',
        'local', 'cloud', 'cn', 'global', 'unknown-family-v1']) {
        try {
          h.manager.set(key, value)
          observations.normalization.push({ key, input: value === undefined ? '<undefined>' : value,
            raw: h.raw()[key], get: h.manager.get(key), all: h.manager.getAll()[key] })
        } catch (error) {
          observations.normalization.push({ key, input: value === undefined ? '<undefined>' : value,
            error: { name: error.name, message: error.message } })
        }
      }
    }
    }
    if (selection !== 'base') observations.audit = auditSettings(temporary, selection === 'audit' ? 'all' : selection)
    return JSON.parse(JSON.stringify(observations).split(temporary).join("<profile-root>"))
  } finally { fs.rmSync(temporary, { recursive: true, force: true }) }
}
if (process.argv.includes('--record')) process.stdout.write(`${JSON.stringify(observe(), null, 2)}\n`)

// Literal inputs are independent of the implementation's returned defaults.
function auditSettings(temporary, selection = 'all') {
  const encode = (value, ancestors = []) => {
    if (typeof value === 'bigint') return '<BigInt>'
    if (ancestors.includes(value)) return '<cycle>'
    if (Array.isArray(value)) return value.map(v => encode(v, [...ancestors, value]))
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, encode(v, [...ancestors, value])]))
    return value
  }
  const out = {}, make = (name, seed, options = {}) => {
    const dir = path.join(temporary, `audit-${name}`); fs.mkdirSync(dir)
    if (seed !== undefined) fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(seed))
    return settingsHarness(dir, options)
  }
  const snapshot = h => ({ raw: h.raw(), individual: Object.fromEntries(Object.keys(h.raw()).map(k => [k, h.manager.get(k)])), all: h.manager.getAll(), trace: encode(h.trace) })
  const malformed = { theme: 42, proxy: null, launchAtLogin: true, asrTier: 'paraformer-zh',
    agentManagementTools: 'legacy', subtitleLanguages: ['EN', 'en', 'all', '??', 'fr', 'de', 'es', 'ja', 'ko'],
    downloadMirror: 'bad', transcriptionProvider: 'bad', future: { keep: [7, { nested: true }] } }
  if (selection === 'all' || selection === 'malformed') {
  for (const portable of [false, true]) {
    const h = make(`malformed-${portable}`, malformed, { portable })
    const constructor = snapshot(h); h.trace.length = 0
    h.manager.set('cookiesPath', '/synthetic/cookies'); const single = snapshot(h); h.trace.length = 0
    h.manager.setAll({ configPath: '/synthetic/config', preferredAudioLanguage: 'fr' })
    out[`malformed-${portable}`] = { constructor, single, batch: snapshot(h) }
  }
  }
  const matrix = {
    downloadPath: ['/synthetic/nondefault'], maxConcurrentDownloads: [2, 2.5, '7'], maxConcurrentTranscriptions: [3, 1.5, '4'],
    browserForCookies: ['firefox'], cookiesPath: ['/synthetic/cookies'], proxy: ['http://fixture.invalid'], configPath: ['/synthetic/config'],
    extensionCookieSources: [[{ id: 'fixture', browser: 'test', variant: 'one', lastConnectedAt: 7, future: { keep: true } }]],
    language: ['fr'], theme: ['dark', 'future-theme'], oneClickDownloadType: ['audio'], oneClickQuality: ['720p'], oneClickContainer: ['mkv'],
    preferredAudioLanguage: ['fr'], subtitleLanguages: [['fr', 'de']], filenameStyle: ['classic'], asrTier: ['quality'],
    ttsModelId: ['unknown-family-v1'], transcriptionProvider: ['cloud'], cloudTranscriptionModelId: ['fixture-model'],
    downloadMirror: ['cn', 'global'], lastSeenWhatsNew: ['fixture-marker'], agentManagementTools: ['ask', 'auto', 'full']
  }
  for (const key of ['downloadWithoutChannelSubfolders','oneClickDownload','closeToTray','hideDockIcon','launchAtLogin',
    'subscriptionOnlyLatestDefault','enableDownloadNotifications','rememberLastAudioLanguage','downloadSubtitles','embedSubs',
    'writeAutoSubs','embedThumbnail','embedMetadata','embedChapters','filenameViaVidBee','shareWatermark','sequentialFilenames','autoTranscribeAfterDownload']) matrix[key] = [false, true]
  if (selection === 'all' || selection.startsWith('fields:')) {
  out.fields = []
  const fieldManagers = { set: make('literal-single'), setAll: make('literal-batch') }
  const previousField = {}
  for (const [key, values] of Object.entries(matrix).filter(([key]) => selection === 'all' || selection === `fields:${key}`)) for (const [i, value] of values.entries()) for (const operation of ['set', 'setAll']) {
    const h = fieldManagers[operation]
    if (previousField[operation] !== key) { h.manager.reset(); previousField[operation] = key }
    h.trace.length = 0
    if (operation === 'set') h.manager.set(key, value); else h.manager.setAll({ [key]: value })
    out.fields.push({ key, value, operation, ...snapshot(h) })
  }
  if (selection === 'all' || selection === 'fields:downloadPath') {
  const covered = Object.keys(matrix).sort(), actual = Object.keys(make('coverage').manager.getAll()).sort()
  if (JSON.stringify(covered) !== JSON.stringify(actual)) throw new Error('Literal field matrix must cover every settings key')
  }
  }
  if (selection === 'all' || selection === 'normalization') {
  const normalization = { asrTier: ['minimal','whisper-base','balanced','whisper-medium','whisper-turbo','sense-voice','sense-voice-2025',
    'fire-red-asr','parakeet-v2','parakeet-v3','orukeet','quality','qwen3-1.7b','paraformer-zh'],
    subtitleLanguages: [['EN','en','all','??','fr','de','es','ja','ko'], [], ['??','all',3]], ttsModelId: ['unknown-family-v1','bad / id'] }
  out.normalization = []
  const normalizedManagers = { set: make('normalization-single'), setAll: make('normalization-batch') }
  for (const [key, values] of Object.entries(normalization)) for (const [i, value] of values.entries()) for (const operation of ['startup','set','setAll']) {
    const h = operation === 'startup' ? make(`norm-${key}-${i}-${operation}`, { [key]: value }) : normalizedManagers[operation]
    if (operation !== 'startup') { h.manager.reset(); h.trace.length = 0 }
    if (operation === 'set') h.manager.set(key, value)
    if (operation === 'setAll') h.manager.setAll({ [key]: value })
    out.normalization.push({ key, value, operation, ...snapshot(h) })
  }
  }
  if (selection === 'all' || selection === 'failures') {
  out.failures = []
  const attempt = (name, h, run) => {
    h.trace.length = 0; let result
    try { result = { returned: run() ?? '<undefined>' } } catch (error) { result = { thrown: { name: error.name, message: error.message }, ...(h.options.lastFailure ? { sameInjectedError: error === h.options.lastFailure } : {}) } }
    out.failures.push({ name, result, ...snapshot(h), proxyPresent: Object.hasOwn(h.raw(), 'proxy') })
  }
  for (const operation of ['set','setAll']) {
    const h = make(`mkdir-${operation}`); h.options.failMkdir = true
    attempt(`mkdir-${operation}`, h, () => operation === 'set' ? h.manager.set('downloadPath', '/synthetic/new') : h.manager.setAll({ theme: 'dark', downloadPath: '/synthetic/new', language: 'fr' }))
  }
  for (const [flag, name] of [['failClear','clear'],['failObject','set']]) {
    const h = make(`reset-${name}`, { theme: 'dark', future: { keep: true } }); h.options[flag] = true
    attempt(`reset-${name}`, h, () => h.manager.reset())
  }
  const h = make('serializations')
  const cycle = {}; cycle.self = cycle
  for (const [i, value] of [undefined,null,NaN,1n,cycle].entries()) attempt(`serialization-${i}`, h, () => h.manager.set('proxy', value))
  const partial = make('partial'); partial.options.failKey = 'hideDockIcon'
  attempt('partial', partial, () => partial.manager.setAll({ launchAtLogin: false, hideDockIcon: false, language: 'fr' }))
  const reset = make('reset-success'); attempt('reset-success', reset, () => reset.manager.reset())
  out.repairs = []
  for (const key of ['agentManagementTools','launchAtLogin','asrTier','subtitleLanguages']) {
    const h = make(`repair-${key}`, malformed, { portable: true, failKey: key })
    out.repairs.push({ key, ...snapshot(h) })
  }
  }
  if (selection === 'all' || selection === 'portable') {
  out.portable = []
  for (const seed of [undefined, { downloadPath: '/portable/old/media' }, { downloadPath: '/external/media' }]) {
    const h = make(`portable-${out.portable.length}`, seed, { portable: true })
    const constructor = snapshot(h); h.trace.length = 0
    h.manager.set('launchAtLogin', true); const single = snapshot(h); h.trace.length = 0
    h.manager.setAll({ launchAtLogin: true }); const batch = snapshot(h); h.trace.length = 0
    h.manager.reset(); out.portable.push({ constructor, single, batch, reset: snapshot(h) })
  }
  }
  if (selection === 'all' || selection === 'effects') {
  out.effects = []
  const effects = sourceLoader()('apps/desktop/src/main/lib/settings-effects.ts')
  for (const operation of ['applySingleSettingSideEffects','applyBatchSettingSideEffects'])
    for (const key of ['language','hideDockIcon','launchAtLogin','maxConcurrentDownloads','maxConcurrentTranscriptions'])
      for (const value of [undefined,null,false,true,0,1,'','false','7','bad']) {
        const calls = [], handlers = Object.fromEntries(['Language','HideDockIcon','LaunchAtLogin','MaxConcurrentDownloads','MaxConcurrentTranscriptions'].map(name =>
          [`on${name}`, (...args) => calls.push([name, ...args.map(v => Number.isNaN(v) ? '<NaN>' : v)])]))
        if (operation === 'applySingleSettingSideEffects') effects[operation](key,value,handlers); else effects[operation]({[key]:value},handlers)
        out.effects.push({ operation,key,value: value === undefined ? '<undefined>' : value,calls })
      }
  }
  return out
}
