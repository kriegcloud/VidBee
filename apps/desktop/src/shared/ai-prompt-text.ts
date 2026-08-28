/**
 * Join speaker-labeled transcript lines for an LLM prompt.
 *
 * @param segments Transcript rows with speaker labels and text.
 * @param resolveSpeaker Display name for a speaker id.
 */
export const buildPromptTranscriptText = (
  segments: ReadonlyArray<{ speakerId: string | null; text: string }>,
  resolveSpeaker: (speakerId: string | null) => string
): string =>
  segments
    .map((segment) => {
      const speaker = resolveSpeaker(segment.speakerId).trim()
      const text = segment.text.trim()
      if (!text) {
        return ''
      }
      return speaker ? `${speaker}: ${text}` : text
    })
    .filter((line) => line.length > 0)
    .join('\n')
