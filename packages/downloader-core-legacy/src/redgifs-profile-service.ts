import * as Effect from 'effect/Effect'
import type { SourceAdmission } from '@vidbee/task-queue-legacy/source-admission'
import { runLegacyPromise } from '@vidbee/task-queue-legacy/runtime'
import { mapRedGifsProfile as nativeMap } from '../../downloader-core/src/redgifs-profile-service.js'
import { HostFailure } from '../../downloader-core/src/Downloader.errors.js'
import type { SocialMappedItem } from './social-media-service.js'
import { mapperRuntime } from './mapper-runtime.js'
import { argumentError } from './arguments-runtime.js'
export const mapRedGifsProfile = (url: string, resolveYtDlpPath: () => string, admission: SourceAdmission | undefined, signal: AbortSignal, onItem: (item: SocialMappedItem) => void) => runLegacyPromise(mapperRuntime, nativeMap(url, resolveYtDlpPath, admission === undefined ? undefined : { acquire: (url, signal) => Effect.tryPromise({ try: async () => { const release = await admission.acquire(url, signal); return release === null ? undefined : Effect.sync(release) }, catch: cause => HostFailure.make({ operation: 'redgifs.admission', legacyMessage: cause instanceof Error ? cause.message : String(cause), cause }) }) }, signal, item => Effect.sync(() => onItem(item))), argumentError)
