import * as Effect from 'effect/Effect'
import { HostFailure } from '../../downloader-core/src/Downloader.errors.js'
import type { GalleryDlProfileMapRuntime as NativeRuntime } from '../../downloader-core/src/gallery-dl-json-run.js'
import type { GalleryDlProfileMapRuntime } from './gallery-dl-json-run.js'

/** Preserve the host's admission lease while native mapping owns the traversal. */
export const nativeProfileRuntime = (runtime: GalleryDlProfileMapRuntime): NativeRuntime => ({
  resolveGalleryDlPath: runtime.resolveGalleryDlPath,
  resolveYtDlpPath: runtime.resolveYtDlpPath,
  resolveGalleryDlArgs: runtime.resolveGalleryDlArgs,
  admission: runtime.admission === undefined ? undefined : {
    acquire: (url, signal) => Effect.tryPromise({
      try: () => runtime.admission!.acquire(url, signal),
      catch: cause => HostFailure.make({operation: 'profile.admission', legacyMessage: cause instanceof Error ? cause.message : String(cause), cause})
    }).pipe(Effect.map(release => release == null ? undefined : Effect.sync(release)))
  }
})
