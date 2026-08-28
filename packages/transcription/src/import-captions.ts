import type { CaptionTrack } from './captions'
import {
  captionLanguageKey,
  captionsTaskId,
  findSidecarCaptionTracks,
  isImportableCaptionTrack,
  isPlatformAiCaptionTag,
  parseCaptionTrack,
  pickCaptionTrack,
  pipelineResultFromCues,
  refineCaptionLanguage
} from './captions'
import { applyChineseScriptToResult, chineseScriptOf } from './chinese-script'
import type { ExtractedCaptionTrack } from './extract-captions'
import type { MemoryTranscriptStore } from './memory-store'
import type { TranscriptStore } from './transcript-store'
import type { TranscriptRecord } from './types'

export interface ImportCaptionsInput {
  downloadTaskId: string
  extractEmbedded?: () => Promise<ExtractedCaptionTrack[]>
  preferredLanguages?: string[]
  sourceFilePath: string
  store: TranscriptStore | MemoryTranscriptStore
}

/**
 * Persist cues from one caption track when the download has no transcript yet.
 *
 * @param input Store, download id, and a parsed track.
 */
export const commitCaptionTrack = (
  input: Omit<ImportCaptionsInput, 'extractEmbedded'> & {
    convertScript?: boolean
    replace?: boolean
    track: CaptionTrack
  }
): TranscriptRecord | null => {
  const existing = input.store.getLatestForDownload(input.downloadTaskId)
  if (!input.replace && existing) {
    return existing.sourceKind === 'captions' ? existing : null
  }
  if (!isImportableCaptionTrack(input.track)) {
    return null
  }
  const cues = parseCaptionTrack(input.track.text, input.track.format)
  const language = refineCaptionLanguage(
    input.track.language,
    cues.map((cue) => cue.text).join('\n')
  )
  const parsed = pipelineResultFromCues(cues, language)
  if (!parsed) {
    return null
  }
  const converted =
    input.convertScript === false
      ? parsed
      : applyChineseScriptToResult(parsed, chineseScriptOf(input.preferredLanguages?.[0] ?? ''))
  const result = isPlatformAiCaptionTag(input.track.language)
    ? { ...converted, language: input.track.language }
    : converted
  return input.store.commit({
    downloadTaskId: input.downloadTaskId,
    result,
    sourceFilePath: input.sourceFilePath,
    transcriptionTaskId: captionsTaskId(input.downloadTaskId, result.language)
  })
}

/**
 * Store every caption language, then activate the track that matches the UI.
 *
 * Extra languages stay in history so the transcript page can switch without sidecars.
 *
 * @param input Store, download id, and parsed tracks.
 */
const commitCaptionTracks = (
  input: Omit<ImportCaptionsInput, 'extractEmbedded'> & { tracks: CaptionTrack[] }
): TranscriptRecord | null => {
  const existing = input.store.getLatestForDownload(input.downloadTaskId)
  if (existing) {
    return existing.sourceKind === 'captions' ? existing : null
  }
  const refined: CaptionTrack[] = []
  const seen = new Set<string>()
  for (const track of input.tracks) {
    if (!(track.text.trim() && isImportableCaptionTrack(track))) {
      continue
    }
    const language = refineCaptionLanguage(track.language, track.text)
    const key = captionLanguageKey(language)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    refined.push({ ...track, language })
  }
  const picked = pickCaptionTrack(refined, input.preferredLanguages ?? [])
  if (!picked) {
    return null
  }
  const pickedKey = captionLanguageKey(picked.language)
  for (const track of refined) {
    if (captionLanguageKey(track.language) === pickedKey) {
      continue
    }
    commitCaptionTrack({ ...input, convertScript: false, replace: true, track })
  }
  return commitCaptionTrack({ ...input, convertScript: true, replace: true, track: picked })
}

/**
 * Activate a stored captions language, or import that sidecar now.
 *
 * @param input Store, media path, and language key such as `ai-zh`.
 */
export const switchToCaptionLanguage = (
  input: Omit<ImportCaptionsInput, 'extractEmbedded'> & { language: string }
): TranscriptRecord | null => {
  const want = captionLanguageKey(input.language)
  const stored = input.store
    .listForDownload(input.downloadTaskId)
    .find(
      (row) =>
        row.sourceKind === 'captions' &&
        row.resultKind === 'transcript' &&
        captionLanguageKey(row.language) === want
    )
  if (stored) {
    return input.store.activate(input.downloadTaskId, stored.id)
  }
  const track = findSidecarCaptionTracks(input.sourceFilePath).find(
    (item) => captionLanguageKey(item.language) === want
  )
  if (!track) {
    return null
  }
  return commitCaptionTrack({ ...input, replace: true, track })
}

/**
 * Import sidecar subtitle files next to the video. Safe to call from a sync snapshot.
 *
 * @param input Store, download id, and media path.
 */
export const importSidecarCaptionsIfPresent = (
  input: Omit<ImportCaptionsInput, 'extractEmbedded'>
): TranscriptRecord | null => {
  const existing = input.store.getLatestForDownload(input.downloadTaskId)
  if (existing) {
    return existing.sourceKind === 'captions' ? existing : null
  }
  const track = pickCaptionTrack(
    findSidecarCaptionTracks(input.sourceFilePath),
    input.preferredLanguages ?? []
  )
  if (!track) {
    return null
  }
  return commitCaptionTrack({ ...input, track })
}

/**
 * Import sidecar captions, then fall back to embedded text subtitle streams.
 *
 * @param input Store, media path, and optional embedded extractor.
 */
export const importCaptionsForDownload = async (
  input: ImportCaptionsInput
): Promise<TranscriptRecord | null> => {
  const sidecar = importSidecarCaptionsIfPresent(input)
  if (sidecar) {
    return sidecar
  }
  if (input.store.getLatestForDownload(input.downloadTaskId)) {
    return null
  }
  if (!input.extractEmbedded) {
    return null
  }
  let extracted: ExtractedCaptionTrack[]
  try {
    extracted = await input.extractEmbedded()
  } catch {
    return null
  }
  return commitCaptionTracks({
    ...input,
    tracks: extracted.map((item) => ({
      format: 'vtt' as const,
      language: item.language,
      text: item.text,
      title: item.title
    }))
  })
}
