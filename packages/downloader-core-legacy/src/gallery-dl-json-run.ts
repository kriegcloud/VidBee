import * as Effect from 'effect/Effect'
import { runLegacyPromise } from '@vidbee/task-queue-legacy/runtime'
import { runGalleryDlJson as nativeRun } from '../../downloader-core/src/gallery-dl-json-run.js'
import { mapperRuntime } from './mapper-runtime.js'
import { argumentError } from './arguments-runtime.js'
import type { DownloadRuntimeSettings } from './types.js'
import type { SourceAdmission } from '@vidbee/task-queue-legacy/source-admission'
export interface GalleryDlProfileMapRuntime {
  admission?: SourceAdmission
  resolveGalleryDlPath: () => string
  resolveYtDlpPath: () => string
  resolveGalleryDlArgs?: (settings?: DownloadRuntimeSettings, url?: string) => readonly string[]
}
export type { GalleryDlJsonRun } from '../../downloader-core/src/gallery-dl-json-run.js'
export { GALLERY_DL_MAP_ARGS, galleryDlUrlMetadata } from '../../downloader-core/src/gallery-dl-json-run.js'
export const runGalleryDlJson = (binary: string, args: string[], signal: AbortSignal, label: string, onLine?: (line: string) => void) => runLegacyPromise(mapperRuntime, nativeRun(binary, args, signal, label, onLine === undefined ? undefined : line => Effect.sync(() => onLine(line))), argumentError)
