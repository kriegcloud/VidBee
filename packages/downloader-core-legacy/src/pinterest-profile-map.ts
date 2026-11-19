import * as Effect from 'effect/Effect';
import { runLegacyPromise } from '@vidbee/task-queue-legacy/runtime';
import { mapPinterestProfile as nativeMap } from '../../downloader-core/src/pinterest-profile-map.js';
import { mapperRuntime } from './mapper-runtime.js';
import { nativeProfileRuntime } from './profile-mapper-runtime.js';
import { argumentError } from './arguments-runtime.js';
import type { GalleryDlProfileMapRuntime } from './gallery-dl-json-run.js';
import type { SocialMappedItem } from './social-media-service';
import type { DownloadRuntimeSettings } from './types';

export const mapPinterestProfile = (url: string, owner: string, runtime: GalleryDlProfileMapRuntime, settings: DownloadRuntimeSettings | undefined, signal: AbortSignal, onItem: (item: SocialMappedItem) => void) => runLegacyPromise(mapperRuntime, nativeMap(url, owner, nativeProfileRuntime(runtime), settings, signal, item => Effect.sync(() => onItem(item))), argumentError);
