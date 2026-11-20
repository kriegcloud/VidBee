import * as HashMap from 'effect/HashMap'
import * as Option from 'effect/Option'
import * as Core from '../../transcription/src/speaker-chunks'
import type { TimedTurn } from './speaker-refine'
export {DIARIZE_CHUNK_MS,DIARIZE_OVERLAP_MS,MERGE_MIN_OVERLAP_MS,SPEAKER_EMBED_MAX_MS,SPEAKER_EMBED_MIN_MS,SHORT_CLUSTER_MS,SHORT_CLUSTER_MAX_MS,SHORT_CLUSTER_SPEECH_FRACTION,SHORT_CLUSTER_FOLD_DISTANCE} from '../../transcription/src/speaker-chunks'
export type { DiarizeWindow, SpeakerEmbed } from '../../transcription/src/speaker-chunks'
export const foldShortClusters = (clusters: Map<string, number>, turns: readonly TimedTurn[][], embeds: readonly Core.SpeakerEmbed[][], distance = Core.SHORT_CLUSTER_FOLD_DISTANCE): Map<string, number | 'unknown'> => {
  const result = Core.foldShortClusters(HashMap.fromIterable(clusters.entries()), turns, embeds, distance)
  return new Map(Array.from(clusters, ([id, label]) => [id, Option.getOrElse(HashMap.get(result, id), () => label)]))
}
export const capExcessClusters = (clusters: Map<string, number | 'unknown'>, turns: readonly TimedTurn[][], embeds: readonly Core.SpeakerEmbed[][], max = 8, distance = Core.SHORT_CLUSTER_FOLD_DISTANCE): Map<string, number | 'unknown'> => {
  const input = HashMap.fromIterable(clusters.entries())
  const result = Core.capExcessClusters(input, turns, embeds, max, distance)
  if (result === input) return clusters
  return new Map(Array.from(clusters, ([id, label]) => [id, Option.getOrElse(HashMap.get(result, id), () => label)]))
}

export const shortClusterFoldMs: (totalSpeechMs: number) => number=Core.shortClusterFoldMs

export const diarizeChunkWindows: (durationMs: number) => Core.DiarizeWindow[]=Core.diarizeChunkWindows

export const shiftTurns: (turns: TimedTurn[], offsetMs: number) => TimedTurn[]=Core.shiftTurns

export const pickSpeakerEmbedTurns: (turns: readonly TimedTurn[], speakerKey: string, maxMs?: number) => TimedTurn[]=Core.pickSpeakerEmbedTurns

export const stitchTurnsAtMidpoint: (previous: TimedTurn[], next: TimedTurn[], midMs: number) => TimedTurn[]=Core.stitchTurnsAtMidpoint

export const mergeChunkTurns: (previous: TimedTurn[], next: TimedTurn[], overlapStartMs: number, overlapEndMs: number) => TimedTurn[]=Core.mergeChunkTurns

export const mergeChunkTurnsByEmbeddings: (windows: readonly Core.DiarizeWindow[], chunkTurns: readonly TimedTurn[][], chunkEmbeds: readonly Core.SpeakerEmbed[][], opts?: {
    threshold?: number;
    k?: number;
}) => TimedTurn[]=Core.mergeChunkTurnsByEmbeddings
