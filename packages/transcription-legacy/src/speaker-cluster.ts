import * as HashMap from 'effect/HashMap'
import * as Option from 'effect/Option'
import * as Core from '../../transcription/src/speaker-cluster'
export {MAX_BRIDGED_SPEAKERS,CLUSTERING_THRESHOLD} from '../../transcription/src/speaker-cluster'
export type { SpeakerEmbedItem } from '../../transcription/src/speaker-cluster'
export const clusterSpeakerEmbeddings = (items: readonly Core.SpeakerEmbedItem[], opts?: {threshold?: number; k?: number}): Map<string, number> => {
  const result = Core.clusterSpeakerEmbeddings(items, opts)
  const ordered = new Map<string, number>()
  for (const item of items) ordered.set(item.id, Option.getOrElse(HashMap.get(result, item.id), () => 0))
  return ordered
}

export const l2Normalize: (vector: Float32Array) => Float32Array=Core.l2Normalize

export const cosineDistance: (left: Float32Array, right: Float32Array) => number=Core.cosineDistance

export const agglomerativeLabels: (vectors: readonly Float32Array[], k: number) => number[]=Core.agglomerativeLabels

export const agglomerativeLabelsByThreshold: (vectors: readonly Float32Array[], threshold: number) => number[]=Core.agglomerativeLabelsByThreshold
