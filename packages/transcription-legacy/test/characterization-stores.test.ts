import { expect, it } from 'vitest'
import * as T from '@vidbee/transcription-legacy'
const segment = (id: string, startMs = 100, endMs = 200): T.TranscriptSegment => ({ id, startMs, endMs, speakerId: 'speaker', text: 'hello', words: [{ text: 'hello', startMs, endMs }], confidence: 0.8, sortIndex: 0 })
const result = (): T.PipelineResult => ({ resultKind: 'transcript', modelVersion: 'v', asrTier: null, language: 'en', speakers: [], segments: [{ speakerKey: null, startMs: 100, endMs: 200, text: 'hello', words: [{ text: 'hello', startMs: 100, endMs: 200 }], confidence: null }] })
it('memory identity, word aliasing, idempotence clock placement and supersession', { timeout: 30000 }, () => {
  let now = 0; const store = new T.MemoryTranscriptStore({ clock: () => ++now }); store.applySchema()
  const original = result(); const input = { downloadTaskId: 'd', transcriptionTaskId: 't', transcriptId: 'one', sourceFilePath: null, result: original }
  const one = store.commit(input); expect(store.getById('one')).toBe(one); expect(one.segments[0]?.words).toBe(original.segments[0]?.words)
  expect(store.commit(input)).toBe(one); expect(now).toBe(1)
  one.language = 'external'; expect(store.getLatestForDownload('d')?.language).toBe('external')
  const two = store.commit({ ...input, transcriptId: 'two', transcriptionTaskId: 't2', activate: false }); expect(two.supersededAt).toBe(2); expect(store.getLatestForDownload('d')).toBe(one)
  expect(store.activate('wrong', 'two')).toBeNull(); expect(store.activate('d', 'two')).toBe(two); expect(one.supersededAt).toBe(3)
  expect(store.commit({ ...input, transcriptId: 'three' }).id).toBe('three')
  expect(store.listForDownload('d').map(({ id, createdAt, updatedAt, supersededAt }) => ({ id, createdAt, updatedAt, supersededAt }))).toMatchSnapshot()
  const before = now; expect(store.deleteSegments('three', ['missing'])).toBe(store.getById('three')); expect(now).toBe(before)
  expect(store.updateSegment('three', 'missing', {})).toBeNull(); expect(store.insertSegment('missing', {})).toBeNull()
  expect(() => store.appendCaptionCues('three', [])).toThrow('Caption transcript is unavailable')
  store.deleteByDownload('d'); expect(store.listLatest()).toEqual([]); expect(store.getByTranscriptionTaskId('t')).toBeNull()
})
it('editing clamps times but preserves words until any explicit text patch; insertion tie order', { timeout: 30000 }, () => {
  const a = segment('a'); const b = { ...segment('b', 500, 800), sortIndex: 1 }
  const edits = [{}, { text: 'hello' }, { startMs: -1.5, endMs: -9 }, { startMs: NaN, endMs: Infinity }, { startMs: 300, endMs: 250 }, { speakerId: null }]
  expect(edits.map(patch => T.applyTranscriptSegmentPatch(a, patch))).toMatchSnapshot()
  expect(T.applyTranscriptSegmentPatch(a, { startMs: 1000 }).words).toBe(a.words)
  expect(T.updateTranscriptSegmentList([a,b], 'missing', {})).toBeNull()
  expect([{ afterId: 'a' }, { beforeId: 'a' }, { beforeId: 'b' }, { afterId: 'absent', atMs: 300 }, { startMs: 100, endMs: 100 }, { atMs: NaN }, { afterId: 'a', beforeId: 'b', text: 'insert' }].map(input => T.insertTranscriptSegmentInList([a,b], input, () => 'new'))).toMatchSnapshot()
  expect(T.deleteTranscriptSegmentsFromList([b,a], ['missing'])).toMatchSnapshot()
})
it('source selection, grouping identity and seed literal predicates', { timeout: 30000 }, () => {
  const store = new T.MemoryTranscriptStore({ clock: () => 1 })
  const asr = store.commit({ downloadTaskId: 'd', transcriptionTaskId: 'asr', transcriptId: 'asr', sourceFilePath: null, result: result() })
  const caption = store.commit({ downloadTaskId: 'd', transcriptionTaskId: 'captions:d:en', transcriptId: 'caption', sourceFilePath: null, result: { ...result(), sourceKind: 'captions' } })
  const heads = store.listForDownload('d'); const grouped = T.groupTranscriptHeads(heads); expect(grouped.get('d')?.[0]).toBe(asr)
  expect([undefined, 'asr', 'captions:en', 'missing'].map(preferredKey => T.resolveTranscriptHeads({ asrActive: false, heads, latestTaskId: 'asr', preferredKey, tracks: [{ language: 'ai-en' }, { language: 'en' }] }).sources)).toMatchSnapshot()
  expect(T.pipelineSeedFromRecord(asr)?.segments[0]?.words).toBe(asr.segments[0]?.words)
  expect(T.latestTranscriptSeed(store, 'd')).toEqual(T.pipelineSeedFromRecord(caption)); expect(T.latestAsrSeed(store, 'd')).toEqual(T.pipelineSeedFromRecord(asr))
  expect(T.captionRecordNeedsSpeakers(caption)).toBe(true)
  expect(T.buildTranscriptSources({ current: null, stored: [], tracks: [] })).toEqual([])
})
it('speaker assignment pins wordless synthetic timing, soft caps, overlap end rewind and nearest tie', { timeout: 30000 }, () => {
  const pieces: T.PipelineSegment[] = [{ startMs: 0, endMs: 6000, text: 'Value 3.5. Next! 最後。', words: [], speakerKey: null, confidence: 0.7 }]
  const turns = [{ startMs: 0, endMs: 3000, speakerKey: 'a' }, { startMs: 3000, endMs: 6000, speakerKey: 'b' }]
  expect(T.assignSpeakersToSegments(pieces, turns)).toMatchSnapshot('sentences')
  expect(T.assignSpeakersToSegments([{ ...pieces[0]!, text: 'x'.repeat(301), endMs: 60001 }], [])).toMatchSnapshot('giant')
  expect(T.assignSpeakersToSegments([{ ...pieces[0]!, text: 'ignored', words: [{ startMs: 0, endMs: 500, text: 'long' }, { startMs: 100, endMs: 200, text: 'short' }] }], [])).toMatchSnapshot('rewind')
  const vector = new Float32Array([3,4]); expect(T.l2Normalize(vector)).toBe(vector)
  const vectors = [vector, new Float32Array([0,0]), new Float32Array([-1,0]), new Float32Array([1,0])]
  expect({ normalized: [...vector], zero: [...T.l2Normalize(new Float32Array(2))], labels: [1,2,3,4,NaN].map(k => T.agglomerativeLabels(vectors,k)), threshold: [0,0.5,1,2].map(k => T.agglomerativeLabelsByThreshold(vectors,k)), distances: vectors.map(v => T.cosineDistance(vector,v)), windows: [0,1,600000,600001,1220000].map(T.diarizeChunkWindows), folds: [0,100000,1200000,2000000].map(T.shortClusterFoldMs) }).toMatchSnapshot('vector and chunk boundaries')
})
it('speaker refinement and bridging preserve ignored masks, threshold ties, fold/cap identity and missing embeds', { timeout: 30000 }, () => {
  const turns: T.TimedTurn[] = [{startMs:0,endMs:5000,speakerKey:'a'},{startMs:5000,endMs:5300,speakerKey:'b'},{startMs:8000,endMs:13000,speakerKey:'a'},{startMs:14000,endMs:18000,speakerKey:'c'}]
  expect({ merged:T.mergeAdjacentTurns(turns), refined:T.refineSpeakerTurns(turns,[],20000), masked:T.refineSpeakerTurns(turns,[{startMs:0,endMs:1}],1), filled:T.fillUncoveredTurns(turns,22001), asr:T.turnsForAsr(turns,[],22001), interval:T.intervalDurationMs([{startMs:0,endMs:5},{startMs:3,endMs:8},{startMs:9,endMs:2}]), trust:[0,199,200,201].map(n=>T.shouldTrustSpeechIntervals(n,1000)), picked:T.pickSpeakerEmbedTurns(turns,'a',6000), shifted:T.shiftTurns(turns,100), stitched:T.stitchTurnsAtMidpoint(turns,turns,7000), overlap:T.mergeChunkTurns(turns,turns,5000,9000) }).toMatchSnapshot()
  const embeds=[{speakerKey:'a',vector:new Float32Array([1,0])},{speakerKey:'b',vector:new Float32Array([1,0])},{speakerKey:'c',vector:new Float32Array([-1,0])}]
  const clusters=T.clusterSpeakerEmbeddings(embeds.map(e=>({id:`0:${e.speakerKey}`,vector:e.vector})))
  const folded=T.foldShortClusters(clusters,[turns],[embeds]); const capped=T.capExcessClusters(folded,[turns],[embeds],8); expect(capped).toBe(folded)
  expect({clusters:[...clusters],folded:[...folded],capped:[...T.capExcessClusters(folded,[turns],[embeds],1)],missing:T.mergeChunkTurnsByEmbeddings([{startMs:0,endMs:20000}], [turns], [[]]),bridged:T.mergeChunkTurnsByEmbeddings([{startMs:0,endMs:20000}], [turns], [embeds]),fixed:T.mergeChunkTurnsByEmbeddings([{startMs:0,endMs:20000}], [turns], [embeds],{k:1})}).toMatchSnapshot()
})
it('short cluster folding distance and five-second duration boundaries are inclusive and retain order', {timeout:30000}, () => {
  const own=new Float32Array([0.35,Math.sqrt(1-0.35**2)]); const main=new Float32Array([1,0]); const distance=T.cosineDistance(main,own)
  const embeddings=[{speakerKey:'main',vector:main},{speakerKey:'short',vector:own}]
  const clusters=T.clusterSpeakerEmbeddings(embeddings.map(e=>({id:`0:${e.speakerKey}`,vector:e.vector})),{k:2})
  expect([4999,5000,5001].flatMap(duration=>[distance-0.000001,distance,distance+0.000001].map(threshold=>{
    const turns=[{startMs:0,endMs:100000,speakerKey:'main'},{startMs:100000,endMs:100000+duration,speakerKey:'short'}]
    return {duration,threshold,folded:[...T.foldShortClusters(clusters,[turns],[embeddings],threshold)],missing:[...T.foldShortClusters(clusters,[turns],[[embeddings[0]!]],threshold)],capped:[...T.capExcessClusters(clusters,[turns],[embeddings],1,threshold)]}
  }))).toMatchSnapshot()
})
