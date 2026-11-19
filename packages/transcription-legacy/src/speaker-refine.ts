import * as Core from '../../transcription/src/speaker-refine'
import type {TimedTurn,TimeInterval,RefineSpeakerOptions} from '../../transcription/src/speaker-refine'
export type {TimedTurn,TimeInterval,RefineSpeakerOptions} from '../../transcription/src/speaker-refine'
export const MIN_CLUSTER_TURN_MS=Core.MIN_CLUSTER_TURN_MS
export const MIN_CLUSTER_DURATION_MS=Core.MIN_CLUSTER_DURATION_MS
export const MAX_MERGE_GAP_MS=Core.MAX_MERGE_GAP_MS
export const MIN_VAD_COVERAGE=Core.MIN_VAD_COVERAGE
export const MAX_UNCOVERED_GAP_MS=Core.MAX_UNCOVERED_GAP_MS

export const mergeAdjacentTurns: (turns: TimedTurn[]) => TimedTurn[]=Core.mergeAdjacentTurns

export const refineSpeakerTurns: (raw: TimedTurn[], _speech: TimeInterval[], _totalDurationMs: number, options?: RefineSpeakerOptions) => TimedTurn[]=Core.refineSpeakerTurns

export const intervalDurationMs: (intervals: TimeInterval[]) => number=Core.intervalDurationMs

export const shouldTrustSpeechIntervals: (speechMs: number, totalDurationMs: number) => boolean=Core.shouldTrustSpeechIntervals

export const fillUncoveredTurns: (turns: TimedTurn[], totalDurationMs: number, maxGapMs?: number) => TimedTurn[]=Core.fillUncoveredTurns

export const turnsForAsr: (raw: TimedTurn[], _speech: TimeInterval[], totalDurationMs: number, options?: RefineSpeakerOptions) => TimedTurn[]=Core.turnsForAsr
