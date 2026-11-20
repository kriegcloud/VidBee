import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { settingsHarness, sourceLoader } from './source-harness.mjs'

export function observe() {
  const temporary = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'foundation-'))
  const observations = {}
  try {
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
        h.manager.set('theme', 'dark')
        const single = h.raw()
        h.manager.setAll({ proxy: 'http://fixture.invalid', 'future.deep': 9 })
        observations[name] = { before, getAll, individual, prompt, single, batch: h.raw(), trace: h.trace }
      } catch (error) { observations[name] = { error: { name: error.name, message: error.message } } }
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
    return JSON.parse(JSON.stringify(observations).split(temporary).join("<profile-root>"))
  } finally { fs.rmSync(temporary, { recursive: true, force: true }) }
}
if (process.argv.includes('--record')) process.stdout.write(`${JSON.stringify(observe(), null, 2)}\n`)
