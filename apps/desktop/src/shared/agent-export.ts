import { applyViaVidBeeFilename } from '@vidbee/downloader-core/filename-style'
import { dual } from 'effect/Function'
import * as Str from 'effect/String'

/**
 * Build a filesystem-safe base name from a media title.
 *
 * @param title Source title shown on the share card or export dialog.
 *
 * **Example** (Access the exportBaseFileName contract)
 *
 * ```ts
 * import { exportBaseFileName } from './agent-export.js'
 * void exportBaseFileName
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const exportBaseFileName = (title?: string | null): string => {
  const cleaned = Str.slice(
    0,
    80
  )(
    Str.replace(
      /[. ]+$/g,
      ''
    )(
      Str.trim(
        Str.replace(
          /\s+/g,
          ' '
        )(
          Str.replace(
            /[<>:"/\\|?*]+/g,
            ' '
          )((title === undefined || title === null ? undefined : Str.trim(title)) || 'VidBeep')
        )
      )
    )
  )
  return cleaned || 'VidBeep'
}

/**
 * Build a filesystem-safe PNG name from a media title.
 *
 * The name ends with `via VidBeep` before the extension.
 *
 * @param title Source title shown on the share card.
 *
 * **Example** (Access the shareImageFileName contract)
 *
 * ```ts
 * import { shareImageFileName } from './agent-export.js'
 * void shareImageFileName
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const shareImageFileName = (title?: string | null): string =>
  applyViaVidBeeFilename(`${exportBaseFileName(title)}.png`)

/**
 * Build a filesystem-safe export name with the given extension.
 *
 * The name ends with `via VidBeep` before the extension.
 *
 * @param title Source title used as the default file name.
 * @param extension File extension without a leading dot.
 */
const exportFileNameBody = (title: string | null | undefined, extension: string): string =>
  applyViaVidBeeFilename(`${exportBaseFileName(title)}.${Str.replace(/^\./, '')(extension)}`)

/** Data-first and pipeable exportFileName.
 *
 * **Example** (Access the exportFileName contract)
 *
 * ```ts
 * import { exportFileName } from './agent-export.js'
 * void exportFileName
 * ```
 *
 * @category rules
 * @since 0.0.0
 */
export const exportFileName: {
  (title: string | null | undefined, extension: string): string
  (extension: string): (value: string | null | undefined) => string
} = dual(2, exportFileNameBody)
