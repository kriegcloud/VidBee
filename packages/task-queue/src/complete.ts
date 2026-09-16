/**
 * Kind-specific success guards for `running/processing → completed`.
 *
 * Download tasks still require a non-empty output file. Transcription tasks
 * require a committed transcript or explicit no-speech result — never a
 * media file check.
 */
import type { TaskKind, TaskOutput } from './types'

export interface OutputCompleteCheck {
  filePresent: (path: string) => boolean
}

export function isOutputComplete(
  kind: TaskKind,
  output: TaskOutput,
  check: OutputCompleteCheck
): boolean {
  if (
    kind === 'instagram-profile-category' ||
    kind === 'vsco-gallery' ||
    kind === 'facebook-gallery' ||
    kind === 'tiktok-photo'
  ) {
    return Boolean(
      output.outputDirectory &&
        output.fileCount &&
        output.fileCount > 0 &&
        output.size > 0 &&
        (output.failedCount ?? 0) === 0 &&
        check.filePresent(output.outputDirectory)
    )
  }
  if (kind === 'transcription') {
    const result = output.transcript
    return Boolean(
      result?.transcriptId &&
        (result.resultKind === 'transcript' || result.resultKind === 'no-speech')
    )
  }
  return Boolean(output.filePath) && output.size > 0 && check.filePresent(output.filePath)
}
