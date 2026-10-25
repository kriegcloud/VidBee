/** What the renderer asks main to render a poster from. */
export interface LocalPosterInput {
  /** The task's own saved file, when one was resolved on disk. */
  filePath?: string | null
  /** A collection's output directory, used when there is no single file. */
  directory?: string | null
}

export interface LocalPosterRowFacts {
  /** Remote thumbnail URL; when present no local poster is needed. */
  readonly thumbnail?: string | null
  /** Directory the task wrote into. Shared by many posts for mapped profiles. */
  readonly outputDirectory?: string | null
  /** Present only on collection rows. */
  readonly collectionSummary?: unknown
  /** Files the task saved. */
  readonly fileCount?: number | null
  /**
   * Result of the row's file-existence check: `undefined` while checking,
   * `null` when nothing was found, the path when it was.
   */
  readonly existingFilePath: string | null | undefined
}

/**
 * Decide what, if anything, a row should ask main to render a poster from.
 *
 * Single mapped posts (VSCO `VSCO/<user>/Gallery`, Pinterest `Pinterest/Pins`)
 * write into a directory shared with every other post, so scanning it would
 * cost O(files) and could render another post's media. Only collection rows
 * own their directory, so only they send it. Nothing is requested until the
 * file check settles, so a mount never fires a speculative directory scan.
 *
 * @param row The row facts the decision depends on.
 */
export const selectLocalPosterInput = (row: LocalPosterRowFacts): LocalPosterInput | null => {
  if (row.thumbnail || row.existingFilePath === undefined) {
    return null
  }
  const isCollection = Boolean(row.collectionSummary) || (row.fileCount ?? 0) > 1
  const directory = isCollection ? (row.outputDirectory ?? null) : null
  const filePath = row.existingFilePath
  if (!(filePath || directory)) {
    return null
  }
  return { directory, filePath }
}
