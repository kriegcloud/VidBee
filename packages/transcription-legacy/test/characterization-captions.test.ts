import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import * as T from '@vidbee/transcription-legacy'
const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
const vtt = '\uFEFFWEBVTT\r\n\r\n1\r\n00:01.2 --> 00:03.456 align:start\r\n<v.Alice Alice  Smith>Hello <b>world</b>\\N next\r\n\r\n00:04,00 --> 00:05,999\r\n<v Bob>Second &amp; literal\r\n\r\n00:09.0 --> 00:08.0\r\nreverse\r\n\r\nbad --> stamp\r\nignored\r\n\r\n00:61.1 --> 01:02.2\r\nnoncanonical clock'
it('caption parsers preserve ordering, speakers, malformed clocks and literal entities', { timeout: 30000 }, () => {
  const ass = '\uFEFF[Events]\nDialogue: 0,0:00:01.00,0:00:02.50,Default,Alice,0,0,0,,{\\b1}Hello, comma\\N next\n Dialogue: 0,0:00:03.00,0:00:04.00,Default,,0,0,0,,ignored leading space\nDialogue: 0,0:61:01.0,0:62:02.00,Default,,0,0,0,,wide clock'
  expect({ vtt: T.parseCaptionCues(vtt), ass: T.parseAssCues(ass), routed: T.parseCaptionTrack(ass, 'ass'), result: T.pipelineResultFromCues(T.parseCaptionCues(vtt), 'eng'), empty: T.pipelineResultFromCues([], null), clean: T.cleanCaptionText('  a{literal}<tag>b\\h c &amp; ') }).toMatchSnapshot()
})
it('language, AI/chat/path classification and tie preference matrices', { timeout: 30000 }, () => {
  const tags = [null, '', 'eng', 'AI_zh', 'automatic-en', 'en-auto', 'chat', 'live_chat', 'danmaku', 'zh-TW', 'zho', 'fr-CA']
  expect(T.isHumanCaptionTrack).toBe(T.isImportableCaptionTrack)
  expect(tags.map(tag => ({ tag, key: T.captionLanguageKey(tag), ai: T.isPlatformAiCaptionTag(tag), machine: T.isMachineCaptionTag(tag), chat: T.isChatCaptionTag(tag), importable: T.isImportableCaptionTrack({ language: tag }), score: T.captionLanguageScore(tag, ['zh-Hant', 'en']), preferred: T.preferredCaptionLanguages(tag ?? ''), match: T.captionLanguageForMatch(tag ?? '') }))).toMatchSnapshot()
  expect(['movie.en.vtt', 'movie.vtt', 'movie.EN.SRT', 'other.en.vtt', 'movie.chat.ass', 'movie.ai-zh.vtt'].map(name => ({ name, language: T.languageFromSidecarName(name, 'movie'), machine: T.isMachineCaptionPath(name) }))).toMatchSnapshot()
  const first = { language: 'en', text: 'first' }; const second = { language: 'eng', text: 'second' }
  expect(T.pickCaptionTrack([first, second], ['en'])).toBe(first)
  expect(T.pickCaptionTrack([{ language: 'ai-fr', text: 'only' }], [])).toEqual({ language: 'ai-fr', text: 'only' })
  expect(['你好世界', '繁體國學說話', '简体国学说话', 'English'].map(text => T.refineCaptionLanguage('ai-en', text))).toMatchSnapshot('script refinement')
})
it('sidecar discovery gates media existence, skips chat/empty/directory and exposes enumeration', { timeout: 30000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'caption-sidecars-')); dirs.push(dir); const media = join(dir, 'movie.mp4')
  for (const name of ['movie.en.vtt', 'movie.ai-zh.vtt', 'movie.chat.ass', 'movie.vtt', 'other.en.vtt']) writeFileSync(join(dir, name), '00:00.0 --> 00:01.0\nhello')
  writeFileSync(join(dir, 'movie.fr.srt'), '  '); mkdirSync(join(dir, 'movie.de.vtt'))
  expect(T.findSidecarCaptionTracks(media)).toEqual([]); writeFileSync(media, '')
  expect(T.findSidecarCaptionTracks(media).map(({ path, ...track }) => ({ ...track, path: basename(path ?? '') }))).toMatchSnapshot()
})
it('import completion timing and multiple language history/activation', { timeout: 30000 }, async () => {
  let clock = 0; const store = new T.MemoryTranscriptStore({ clock: () => ++clock }); const markers: string[] = []
  const pending = T.importCaptionsForDownload({ store, downloadTaskId: 'd', sourceFilePath: '/__vidbee_characterization_absent__/movie.mp4', preferredLanguages: ['en'], extractEmbedded: () => { markers.push('extract'); return Promise.resolve([{ language: 'fr', text: '00:00.0 --> 00:01.0\nbonjour' }, { language: 'en', text: '00:00.0 --> 00:01.0\nhello' }]) } }).then(result => { markers.push('settled'); return result })
  markers.push(`immediate:${store.listForDownload('d').length}`); await Promise.resolve(); markers.push(`microtask:${store.listForDownload('d').length}`)
  const result = await pending
  const ids: string[] = []
  const frozen = JSON.parse(JSON.stringify({ result, history: store.listForDownload('d') }).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, value => { let index = ids.indexOf(value); if (index < 0) { index = ids.length; ids.push(value) }; return `generated-id-${index}` }))
  expect(frozen).toMatchSnapshot('complete import records with generated IDs normalized')
  expect(markers).toMatchSnapshot(); expect(result?.language).toBe('en')
  expect(store.listForDownload('d').map(({ language, transcriptionTaskId, createdAt, updatedAt, supersededAt, segments }) => ({ language, transcriptionTaskId, createdAt, updatedAt, supersededAt, text: segments.map(s => s.text) }))).toMatchSnapshot()
  const switched = T.switchToCaptionLanguage({ store, downloadTaskId: 'd', sourceFilePath: '/absent', language: 'fra' }); expect(switched?.language).toBe('fr')
  expect(await T.importCaptionsForDownload({ store: new T.MemoryTranscriptStore(), downloadTaskId: 'x', sourceFilePath: '/absent', extractEmbedded: () => Promise.reject(new Error('hidden')) })).toBeNull()
})

it('embedded language commits are separate: a later store failure rejects with earlier language retained', {timeout:30000}, async () => {
  class FailingStore extends T.MemoryTranscriptStore {
    calls=0
    override commit(input: Parameters<T.MemoryTranscriptStore['commit']>[0]): T.TranscriptRecord {
      this.calls+=1
      if(this.calls===2) throw new Error('fixture second commit')
      return super.commit(input)
    }
  }
  const store=new FailingStore({clock:()=>100})
  const promise=T.importCaptionsForDownload({store,downloadTaskId:'partial',sourceFilePath:'/__vidbee_characterization_absent__/media',preferredLanguages:['en'],extractEmbedded:()=>Promise.resolve([{language:'fr',text:'00:00.0 --> 00:01.0\nbonjour'},{language:'en',text:'00:00.0 --> 00:01.0\nhello'}])})
  expect(store.calls).toBe(0)
  await expect(promise).rejects.toThrow('fixture second commit')
  expect(store.listForDownload('partial').map(row=>({language:row.language,task:row.transcriptionTaskId,supersededAt:row.supersededAt,text:row.segments.map(segment=>segment.text)}))).toEqual([{language:'fr',task:'captions:partial:fr',supersededAt:null,text:['bonjour']}])
})
