import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import {Seeds,SeedStore} from '../../transcription/src/Seeds.service'
import {SeedsLive} from '../../transcription/src/Seeds.layer'
import {HostFailure} from '../../transcription/src/Transcription.errors'
import {SeedFiles} from '../../transcription/src/SeedFiles.service'
import {runStateless} from './bridge/stateless'
import * as Core from '../../transcription/src/speaker-assign'
import type { TimedTurn } from './speaker-refine'
import type {
  PipelineSegment,
  PipelineSpeaker,
  TranscriptRecord,
  TranscriptSourceKind
} from './types'

export const SEED_TRANSCRIPT_FILE = 'seed-transcript.json'

export interface PipelineSeed {
  language: string | null
  modelVersion: string
  asrTier: string | null
  sourceKind?: TranscriptSourceKind
  speakers: PipelineSpeaker[]
  segments: PipelineSegment[]
}








/** Split when the next token starts after this much silence. */
export const PARAGRAPH_GAP_MS = 1500
/** Split when the open segment already has this many characters. */
export const MAX_SEGMENT_CHARS = 150
/** Split when the open segment already spans this duration. */
export const MAX_SEGMENT_MS = 30_000
/** Wordless pieces longer than this are split again so majority-vote stays local. */
export const GIANT_TOKEN_MS = 30_000
/** Wordless pieces with more than this many characters are split again. */
export const GIANT_TOKEN_CHARS = 300
/** Last-resort window size when a giant piece still has no usable punctuation. */
export const FALLBACK_TOKEN_CHARS = 50





/**
 * True when this caption line already closed a sentence.
 */


/**
 * Split a caption line on CJK/terminal punctuation so one speaker turn is not one wall of text.
 * ASCII '.' counts as a sentence end when it is followed by space, quotes, or end-of-text,
 * but not inside decimals such as 3.5.
 */


/**
 * Join two caption fragments, adding a space only when Latin words would otherwise jam.
 */


/**
 * Build a one-speaker turn covering the whole timeline.
 *
 * @param endMs Exclusive end of the last known word or segment.
 */
export const singleSpeakerTurns = (endMs: number): TimedTurn[] => { return Core.singleSpeakerTurns(endMs) }

/**
 * True when imported captions still need a speaker overlay pass.
 *
 * Rows committed by rediarize use the worker task id, so they are not retried
 * even if clustering found no named speakers.
 *
 * @param record Current transcript, if any.
 */
export const captionRecordNeedsSpeakers = (record: TranscriptRecord | null): boolean =>
  { return Core.captionRecordNeedsSpeakers(record) }

/**
 * Latest finished ASR transcript for a download, if one has words or segments.
 *
 * @param store Store that can list every transcript for a download.
 * @param downloadTaskId Parent download id.
 */
export const latestAsrSeed = (
  store: { listForDownload: (downloadTaskId: string) => TranscriptRecord[] },
  downloadTaskId: string
): PipelineSeed | null => {
  return runSeed(store,downloadTaskId,false)
}

/**
 * Seed speaker overlay from the current transcript, captions or ASR.
 *
 * Caption rediarize prefers the original subtitle-import row (`captions:` task
 * id) so a collapsed overlay cannot poison the next pass. ASR rediarize still
 * uses the latest ASR row.
 *
 * @param store Store that can read the current row and list history.
 * @param downloadTaskId Parent download id.
 */
export const latestTranscriptSeed = (
  store: {
    getLatestForDownload?: (downloadTaskId: string) => TranscriptRecord | null
    listForDownload: (downloadTaskId: string) => TranscriptRecord[]
  },
  downloadTaskId: string
): PipelineSeed | null => {
  return runSeed(store,downloadTaskId,true)
}

/**
 * Flatten a stored ASR record into the seed the pipeline overlays speakers on.
 *
 * @param record Latest ASR transcript, or null when nothing is reusable.
 */
export const pipelineSeedFromRecord = (record: TranscriptRecord | null): PipelineSeed | null => { return Core.pipelineSeedFromRecord(record) }

/**
 * Persist a seed next to the worker work dir.
 *
 * @param filePath Destination JSON path.
 * @param seed Existing ASR transcript.
 */
export const writePipelineSeed = (filePath: string, seed: PipelineSeed): void => {
  runStateless(SeedFiles.use(service=>service.write(filePath,seed)))
}

/**
 * Load a seed written for a rediarize worker job.
 *
 * @param filePath Seed JSON path.
 */
export const loadPipelineSeed = (filePath: string): PipelineSeed | null => {
  return runStateless(SeedFiles.use(service=>service.load(filePath)))
}

/**
 * Exclusive end of the last seed segment, used when audio is not extracted.
 *
 * @param seed Existing ASR transcript.
 */
export const seedDurationMs = (seed: PipelineSeed): number =>
  { return Core.seedDurationMs(seed) }

/**
 * Re-label an existing transcript with new diarization turns. Words are kept.
 *
 * @param segments Finished ASR segments.
 * @param turns Fresh speaker turns from diarization.
 */
export const assignSpeakersToSegments = (
  segments: PipelineSegment[],
  turns: TimedTurn[]
): { speakers: PipelineSpeaker[]; segments: PipelineSegment[] } => { return Core.assignSpeakersToSegments(segments, turns) }







/**
 * Last-resort split for a wordless giant piece: secondary punctuation, then
 * ~50-character windows (and extra slices if duration would still exceed 30s).
 */




/**
 * Turn stored segments into a time-ordered token stream (words, or the whole line).
 *
 * @param segments Existing ASR segments.
 */


/**
 * Pick the speaker whose turn overlaps this interval the most.
 *
 * @param turns Diarization turns.
 * @param startMs Token start.
 * @param endMs Token end.
 */


/**
 * True when this token should open a new display row instead of merging.
 */


/**
 * Merge consecutive same-speaker tokens back into display segments.
 *
 * @param tokens Words (or whole lines) with a speaker label.
 */


/**
 * Number speakers in first-appearance order for the transcript UI.
 *
 * @param segments Relabeled segments.
 */


const runSeed=(store:{getLatestForDownload?:(id:string)=>TranscriptRecord|null;listForDownload:(id:string)=>TranscriptRecord[]},id:string,transcript:boolean):PipelineSeed|null=>{
 const attempt=<A>(body:()=>A)=>Effect.try({try:body,catch:cause=>HostFailure.make({operation:'seedStore',cause,legacyMessage:cause instanceof Error?cause.message:String(cause)})})
 const source=Layer.succeed(SeedStore,{latest:id=>attempt(()=>store.getLatestForDownload?.(id)??null),list:id=>attempt(()=>store.listForDownload(id))})
 return runStateless(Seeds.use(service=>transcript?service.latestTranscript(id):service.latestAsr(id)).pipe(Effect.provide(SeedsLive.pipe(Layer.provide(source)))))
}
