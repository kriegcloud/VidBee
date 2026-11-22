import { $DesktopId } from '@vidbee/identity/packages'
import * as A from 'effect/Array'
import { pipe } from 'effect/Function'
import * as HashSet from 'effect/HashSet'
import * as P from 'effect/Predicate'
import * as S from 'effect/Schema'
import * as Str from 'effect/String'
import { recordFunction } from '../RecordFunction.js'

const $I = $DesktopId.create('shared/utils/download-file')
/** Filename selection options; structural for legacy construction.
 * **Example** (Reject invalid FileNameOptions input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { FileNameOptions } from './download-file.js'
 * strictEqual(S.is(FileNameOptions)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const FileNameOptions = S.Struct({
  title: S.String,
  format: S.String,
  savedFileName: S.String.pipe(S.UndefinedOr, S.optionalKey)
}).pipe(
  $I.annoteSchema('FileNameOptions', {
    description: 'Ordered saved-name fallback selection.'
  })
)
/** FileNameOptions shared contract.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the FileNameOptions contract)
 *
 * ```ts
 * import { FileNameOptions } from './download-file.js'
 * void FileNameOptions
 * ```
 *
 */
export type FileNameOptions = typeof FileNameOptions.Type
/** Path selection options; structural for legacy construction.
 * **Example** (Reject invalid FilePathOptions input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { FilePathOptions } from './download-file.js'
 * strictEqual(S.is(FilePathOptions)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const FilePathOptions = S.Struct({
  ...FileNameOptions.fields,
  downloadPath: S.String,
  filePath: S.String.pipe(S.UndefinedOr, S.optionalKey)
}).pipe(
  $I.annoteSchema('FilePathOptions', {
    description: 'Recorded path followed by ordered filename candidates.'
  })
)
/** FilePathOptions shared contract.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the FilePathOptions contract)
 *
 * ```ts
 * import { FilePathOptions } from './download-file.js'
 * void FilePathOptions
 * ```
 *
 */
export type FilePathOptions = typeof FilePathOptions.Type
/** Remove yt-dlp format suffixes while preserving absent and blank names.
 * @category normalization
 * @since 0.0.0
 *
 * **Example** (Access the normalizeSavedFileName contract)
 *
 * ```ts
 * import { normalizeSavedFileName } from './download-file.js'
 * void normalizeSavedFileName
 * ```
 *
 */
export const normalizeSavedFileName = (fileName?: string): string | undefined => {
  const hasName = P.isTruthy(fileName)
  if (fileName === undefined || !hasName) {
    return undefined
  }
  const trimmed = Str.trim(fileName)
  if (trimmed.length === 0) {
    return undefined
  }
  return pipe(trimmed, Str.replace(/\.f[a-z0-9-]+(?=\.[^.]+$)/gi, ''))
}
/** Saved name candidates precede product-branded title fallbacks.
 * @category queries
 * @since 0.0.0
 *
 * **Example** (Access the buildFileNameCandidates contract)
 *
 * ```ts
 * import { buildFileNameCandidates } from './download-file.js'
 * void buildFileNameCandidates
 * ```
 *
 */
export const buildFileNameCandidates: {
  (): (options: FileNameOptions) => string[]
  (options: FileNameOptions): string[]
} = recordFunction((options: FileNameOptions): string[] => {
  const { title, format, savedFileName } = options
  const safeTitle = Str.trim(title) || 'Unknown'
  const savedNameCandidates: string[] = []
  const trimmed =
    savedFileName === undefined || savedFileName === null ? undefined : Str.trim(savedFileName)
  const hasSaved = P.isTruthy(trimmed)
  if (trimmed !== undefined && hasSaved) {
    const normalized = normalizeSavedFileName(trimmed)
    const hasNormalized = P.isTruthy(normalized)
    if (normalized !== undefined && hasNormalized) {
      savedNameCandidates.push(normalized)
    }
    if (!hasNormalized || normalized !== trimmed) {
      savedNameCandidates.push(trimmed)
    }
  }
  return savedNameCandidates.length > 0
    ? savedNameCandidates
    : [
        `${safeTitle} via VidBeep.${format}`,
        `${safeTitle} via VidBee.${format}`,
        `${safeTitle}.${format}`
      ]
})
/** Recorded path is first; stable deduplication never iterates the hash set.
 * @category queries
 * @since 0.0.0
 *
 * **Example** (Access the buildFilePathCandidates contract)
 *
 * ```ts
 * import { buildFilePathCandidates } from './download-file.js'
 * void buildFilePathCandidates
 * ```
 *
 */
export const buildFilePathCandidates: {
  (): (options: FilePathOptions) => string[]
  (options: FilePathOptions): string[]
} = recordFunction((options: FilePathOptions): string[] => {
  const normalizedPath = pipe(options.downloadPath, Str.replace(/\\/g, '/'))
  const names = buildFileNameCandidates(options)
  const paths = [
    ...(P.isTruthy(options.filePath) && options.filePath !== undefined ? [options.filePath] : []),
    ...A.map(names, (name) => `${normalizedPath}/${name}`)
  ]
  let seen = HashSet.empty<string>()
  return A.filter(paths, (path) => {
    if (HashSet.has(seen, path)) {
      return false
    }
    seen = HashSet.add(seen, path)
    return true
  })
})
/** Normalize a title for matching historical media filenames.
 * @category normalization
 * @since 0.0.0
 *
 * **Example** (Access the normalizeFilenameKey contract)
 *
 * ```ts
 * import { normalizeFilenameKey } from './download-file.js'
 * void normalizeFilenameKey
 * ```
 *
 */
export const normalizeFilenameKey = (value: string): string =>
  pipe(
    value,
    Str.normalize('NFKC'),
    Str.toLowerCase,
    Str.replace(/via\s*vidbee/gi, ''),
    Str.replace(/[^a-z0-9\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]+/g, '')
  )
/** Preserve the empty key for missing and falsy input.
 * @category normalization
 * @since 0.0.0
 *
 * **Example** (Access the buildFilenameKey contract)
 *
 * ```ts
 * import { buildFilenameKey } from './download-file.js'
 * void buildFilenameKey
 * ```
 *
 */
export const buildFilenameKey = (value?: string): string => {
  const hasValue = P.isTruthy(value)
  return value === undefined || !hasValue ? '' : normalizeFilenameKey(value)
}
