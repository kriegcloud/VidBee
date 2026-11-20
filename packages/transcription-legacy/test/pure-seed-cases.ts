const words = [
  { startMs: 0, endMs: 300, text: 'Hello' },
  { startMs: 300, endMs: 600, text: ' world.' },
  { startMs: 2100, endMs: 2400, text: 'Again' }
]
const speakers = [
  { id: 'speaker-a', speakerKey: 'speaker-1', displayName: 'First', sortIndex: 0 },
  { id: 'speaker-b', speakerKey: 'speaker-2', displayName: 'Second', sortIndex: 1 }
]
const segments = [
  { id: 'segment-a', speakerId: 'speaker-a', startMs: 0, endMs: 2400, text: 'Hello world. Again', words, confidence: .7, sortIndex: 0 },
  { id: 'segment-b', speakerId: 'speaker-b', startMs: 3000, endMs: 9000, text: '你好。下一句！Price 3.5 is valid. "Quoted!"\nLast line?', words: [], confidence: null, sortIndex: 1 }
]
const record = {
  id: 'transcript-a', downloadTaskId: 'download-a', transcriptionTaskId: 'captions:fixture:en',
  resultKind: 'transcript', modelVersion: 'fixture-v1', asrTier: 'minimal', language: 'en',
  sourceFilePath: '/fixture/media.wav', sourceKind: 'captions', supersededAt: null,
  createdAt: 10, updatedAt: 20, speakers, segments
}
const pipelineSegments = segments.map(segment => ({
  speakerKey: segment.speakerId === 'speaker-a' ? 'speaker-1' : 'speaker-2',
  startMs: segment.startMs, endMs: segment.endMs, text: segment.text, words: segment.words, confidence: segment.confidence
}))
const seed = {
  language: 'en', modelVersion: 'fixture-v1', asrTier: 'minimal', sourceKind: 'captions',
  speakers: speakers.map(speaker => ({speakerKey: speaker.speakerKey, displayName: speaker.displayName})),
  segments: pipelineSegments
}
const turns = [
  { speakerKey: 'speaker-1', startMs: 0, endMs: 1000 },
  { speakerKey: 'speaker-2', startMs: 1800, endMs: 5000 },
  { speakerKey: 'unknown', startMs: 5000, endMs: 10000 }
]

/** Data-first pure speaker assignment calls with rich stored and pipeline shapes. */
export const seedSeeds: Record<string, Record<string, unknown[][]>> = {
  'speaker-assign': {
    singleSpeakerTurns: [[9000], [0], [-50]],
    captionRecordNeedsSpeakers: [[record], [{...record, speakers: []}], [{...record, speakers: [], transcriptionTaskId: 'worker:overlay'}], [{...record, resultKind: 'future-kind'}], [null]],
    pipelineSeedFromRecord: [[record], [{...record, resultKind: 'future-kind'}], [{...record, segments: [{...segments[0], speakerId: 'missing'}]}], [{...record, speakers: [{...speakers[0], id: 'speaker-a'}, {...speakers[1], id: 'speaker-a'}]}], [null]],
    seedDurationMs: [[seed], [{...seed, segments: [...pipelineSegments, {...pipelineSegments[0], endMs: 20000}]}]],
    assignSpeakersToSegments: [
      [pipelineSegments, turns],
      [[{speakerKey: null, startMs: 0, endMs: 70000, text: '甲，乙；丙：丁。'.repeat(60), words: [], confidence: null}], [{speakerKey: 'speaker-1', startMs: 0, endMs: 35000}, {speakerKey: 'speaker-2', startMs: 35000, endMs: 70000}]],
      [[{speakerKey: null, startMs: 0, endMs: 65000, text: 'abcdefghijklmnopqrstuvwxyz'.repeat(16), confidence: null}], turns],
      [pipelineSegments, []],
      [[{speakerKey: 'speaker-old', startMs: 0, endMs: 2000, text: 'timed plus plain', words: [{startMs: 0,endMs: 500,text: 'timed'}], confidence: .8}, {speakerKey: 'speaker-old',startMs: 600,endMs: 1000,text: 'plain',words: [],confidence: null}], [{speakerKey: 'speaker-1',startMs: 0,endMs: 2000}]]
    ]
  }
}
