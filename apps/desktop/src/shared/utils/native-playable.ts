import { pipe } from 'effect/Function'
import * as HashSet from 'effect/HashSet'
import * as O from 'effect/Option'
import * as Str from 'effect/String'

const NATIVE_AUDIO_CONTAINERS = HashSet.fromIterable([
  '.aac',
  '.flac',
  '.mp3',
  '.ogg',
  '.opus',
  '.wav'
])

/**
 * Return the lowercase file extension, including the leading dot.
 */
const extensionOf = (filePath: string): string => {
  const normalized = pipe(filePath, Str.replace(/\\/g, '/'))
  const slash = pipe(
    normalized,
    Str.lastIndexOf('/'),
    O.getOrElse(() => -1)
  )
  const base = slash >= 0 ? Str.slice(slash + 1)(normalized) : normalized
  const dot = pipe(
    base,
    Str.lastIndexOf('.'),
    O.getOrElse(() => -1)
  )
  if (dot <= 0 || dot === base.length - 1) {
    return ''
  }
  return pipe(base, Str.slice(dot), Str.toLowerCase)
}

/**
 * True when Chromium can play this path as audio without remuxing or transcoding.
 *
 * **Example** (Access the isNativelyPlayableAudio contract)
 *
 * ```ts
 * import { isNativelyPlayableAudio } from './native-playable.js'
 * void isNativelyPlayableAudio
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const isNativelyPlayableAudio = (filePath: string): boolean =>
  HashSet.has(NATIVE_AUDIO_CONTAINERS, extensionOf(filePath))
