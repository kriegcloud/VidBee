import { applyChineseScriptToResult, chineseScriptOf } from './chinese-script'
import { modelVersion } from './model-catalog'
import { type PipelineRunInput, report, type TranscriptionPipeline } from './pipeline'
import { assignSpeakersToSegments, singleSpeakerTurns } from './speaker-assign'
import { DEFAULT_SPEAKER_COUNT, parseSpeakerCount } from './speaker-count'
import type { PipelineResult } from './types'

export interface FakePipelineOptions {
  result?: PipelineResult
  speech?: boolean
  delayMs?: number
}

const spokenResult = (): PipelineResult => ({
  resultKind: 'transcript',
  language: 'en',
  modelVersion,
  asrTier: 'minimal',
  speakers: [
    { speakerKey: 'speaker-1', displayName: 'Speaker 1' },
    { speakerKey: 'speaker-2', displayName: 'Speaker 2' }
  ],
  segments: [
    {
      speakerKey: 'speaker-1',
      startMs: 0,
      endMs: 1800,
      text: 'Hello, this is a fixture transcript.',
      words: [
        { text: 'Hello,', startMs: 0, endMs: 400 },
        { text: ' this', startMs: 400, endMs: 700 },
        { text: ' is', startMs: 700, endMs: 900 },
        { text: ' a', startMs: 900, endMs: 1050 },
        { text: ' fixture', startMs: 1050, endMs: 1400 },
        { text: ' transcript.', startMs: 1400, endMs: 1800 }
      ],
      confidence: 0.9
    },
    {
      speakerKey: 'speaker-2',
      startMs: 1900,
      endMs: 3600,
      text: 'And this is the second speaker.',
      words: [
        { text: 'And', startMs: 1900, endMs: 2100 },
        { text: ' this', startMs: 2100, endMs: 2300 },
        { text: ' is', startMs: 2300, endMs: 2450 },
        { text: ' the', startMs: 2450, endMs: 2600 },
        { text: ' second', startMs: 2600, endMs: 3000 },
        { text: ' speaker.', startMs: 3000, endMs: 3600 }
      ],
      confidence: 0.88
    }
  ]
})

const silentResult = (): PipelineResult => ({
  resultKind: 'no-speech',
  language: null,
  modelVersion,
  asrTier: 'minimal',
  speakers: [],
  segments: []
})

export class FakeTranscriptionPipeline implements TranscriptionPipeline {
  constructor(private readonly opts: FakePipelineOptions = {}) {}

  async run(input: PipelineRunInput): Promise<PipelineResult> {
    if (input.signal?.aborted) {
      throw new Error('cancelled')
    }
    report(input, 'detecting-speech', 0.2)
    if (this.opts.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, this.opts.delayMs))
    }
    if (input.signal?.aborted) {
      throw new Error('cancelled')
    }
    if (this.opts.result) {
      report(input, 'committing', 1)
      return this.opts.result
    }
    const seed = input.existingTranscript
    if (seed?.segments.length) {
      report(input, 'diarizing', 0.5)
      const speakerCount = parseSpeakerCount(input.speakerCount, DEFAULT_SPEAKER_COUNT)
      const endMs = seed.segments.reduce((max, segment) => Math.max(max, segment.endMs), 1)
      const turns =
        speakerCount === 1
          ? singleSpeakerTurns(endMs)
          : [
              { startMs: 0, endMs: Math.ceil(endMs / 2), speakerKey: 'speaker-1' },
              { startMs: Math.ceil(endMs / 2), endMs, speakerKey: 'speaker-2' }
            ]
      const assigned = assignSpeakersToSegments(seed.segments, turns)
      const converted = applyChineseScriptToResult(
        {
          resultKind: 'transcript',
          language: seed.language,
          modelVersion: seed.modelVersion || modelVersion,
          asrTier:
            seed.sourceKind === 'captions'
              ? seed.asrTier
              : (seed.asrTier ?? input.asrTier ?? 'minimal'),
          sourceKind: seed.sourceKind,
          speakers: assigned.speakers,
          segments: assigned.segments
        },
        chineseScriptOf(input.language ?? '')
      )
      for (const segment of converted.segments) {
        input.onPartial?.(segment)
      }
      report(input, 'committing', 1)
      return { ...converted, language: seed.language }
    }
    const hasSpeech = this.opts.speech ?? input.skipVad
    if (!hasSpeech && input.autoSkipAllowed) {
      report(input, 'committing', 1, 'no-speech')
      return silentResult()
    }
    report(input, 'recognizing', 0.6)
    const result = spokenResult()
    if (input.asrTier) {
      result.asrTier = input.asrTier
    }
    const converted = applyChineseScriptToResult(result, chineseScriptOf(input.language ?? ''))
    for (const segment of converted.segments) {
      input.onPartial?.(segment)
    }
    report(input, 'diarizing', 0.9)
    report(input, 'committing', 1)
    return converted
  }
}
