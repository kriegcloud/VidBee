import type { SourceAdmission } from '@vidbee/task-queue-legacy/source-admission'
import { mapFacebookProfile } from './facebook-profile-map'
import type { GalleryDlExecutorOptions } from './gallery-dl-executor'
import type { GalleryDlProfileMapRuntime } from './gallery-dl-json-run'
import type { MappedProfilePlatform } from './mapped-profile-source'
import { mapPinterestProfile } from './pinterest-profile-map'
import { mapRedGifsProfile } from './redgifs-profile-service'
import { mapSnapchatProfile } from './snapchat-profile-map'
import {
  mapSocialMediaProfile,
  type ProfileMapOptions,
  type SocialMappedItem,
  type SocialMappedProfile,
  SocialMappedProfileSchema,
} from './social-media-service'
import { mapThreadsProfile } from './threads-profile-map'
import type { DownloadRuntimeSettings } from './types'
import { mapVscoProfile } from './vsco-profile-map'

import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as NodePath from '@effect/platform-node/NodePath'
import * as Scheduler from 'effect/Scheduler'
import { runLegacySync, runLegacyPromise } from '@vidbee/task-queue-legacy/runtime'
import { DownloadFilesLegacy } from './DownloadFiles.layer.js'
import { DownloadHostLegacy } from './DownloadHost.layer.js'
import { argumentError } from './arguments-runtime.js'
import { DownloadTiming } from '../../downloader-core/src/DownloadTiming.service.js'
import { HostFailure } from '../../downloader-core/src/Downloader.errors.js'
import { SocialInventoryCodec } from '../../downloader-core/src/SocialInventoryCodec.service.js'
import { SocialTraversal } from '../../downloader-core/src/SocialTraversal.service.js'
import { SocialProfileManager as NativeManager, socialProfileManagerLayer } from '../../downloader-core/src/social-profile-manager.js'
export interface SocialProfileManagerOptions {
  storageDir: string
  runtime: Omit<GalleryDlExecutorOptions, 'defaultDownloadDir'> & { admission?: SourceAdmission }
  resolveYtDlpPath: () => string
}


function runtimeFor(options: SocialProfileManagerOptions) {
  /** Each platform's traversal; all of them stream post references only. */
  const startMapping = (
    platform: MappedProfilePlatform,
    url: string,
    category: string,
    owner: string,
    runtime: GalleryDlProfileMapRuntime,
    settings: DownloadRuntimeSettings | undefined,
    signal: AbortSignal,
    onItem: (item: SocialMappedItem) => void,
    mapOptions: ProfileMapOptions
  ): Promise<{ complete: boolean; error?: string; authRequired?: boolean }> => {
    if (platform === 'facebook') {
      return mapFacebookProfile(
        url,
        category as 'photos' | 'albums' | 'reels',
        owner,
        runtime,
        settings,
        signal,
        onItem
      )
    }
    if (platform === 'pinterest') {
      return mapPinterestProfile(url, owner, runtime, settings, signal, onItem)
    }
    if (platform === 'vsco') {
      return mapVscoProfile(url, owner, runtime, settings, signal, onItem)
    }
    if (platform === 'threads') {
      return mapThreadsProfile(url, owner, runtime, settings, signal, onItem, mapOptions)
    }
    if (platform === 'snapchat') {
      return mapSnapchatProfile(
        owner,
        category === 'spotlight' ? 'spotlight' : 'stories',
        runtime,
        settings,
        signal,
        onItem
      )
    }
    if (platform === 'redgifs') {
      return mapRedGifsProfile(
        url,
        options.resolveYtDlpPath,
        options.runtime.admission,
        signal,
        onItem
      )
    }
    return mapSocialMediaProfile(url, options.runtime, settings, signal, onItem, mapOptions)
  }


  const dependencies = Layer.mergeAll(DownloadFilesLegacy, DownloadHostLegacy, NodePath.layer,
    Layer.succeed(Scheduler.PreventSchedulerYield, true),
    Layer.succeed(DownloadTiming, { turn: () => Effect.promise(() => Promise.resolve()), sleep: milliseconds => Effect.promise(() => new Promise(resolve => setTimeout(resolve, milliseconds))) }),
    Layer.succeed(SocialInventoryCodec, { decode: text => Effect.try({ try: () => SocialMappedProfileSchema.parse(JSON.parse(text)), catch: cause => HostFailure.make({ operation: 'social.read', legacyMessage: cause instanceof Error ? cause.message : String(cause), cause }) }) }),
    Layer.succeed(SocialTraversal, { map: (request, onItem) => Effect.tryPromise({ try: () => startMapping(request.platform, request.url, request.category, request.owner, { admission: options.runtime.admission, resolveGalleryDlPath: options.runtime.resolveBinaryPath, resolveYtDlpPath: options.resolveYtDlpPath, resolveGalleryDlArgs: options.runtime.resolveExtraArgs }, request.settings, request.signal, item => runLegacySync(runtime, onItem(item), argumentError), { knownIds: request.knownIds }), catch: cause => HostFailure.make({ operation: 'social.map', legacyMessage: cause instanceof Error ? cause.message : String(cause), cause }) }) })
  )
  const runtime = ManagedRuntime.make(socialProfileManagerLayer({ storageDir: options.storageDir }).pipe(Layer.provide(dependencies)))
  runtime.runSync(Effect.void)
  return runtime
}
export class SocialProfileManager {
  private readonly runtime: ReturnType<typeof runtimeFor>
  constructor(options: SocialProfileManagerOptions) { this.runtime = runtimeFor(options) }
  get(url: string): SocialMappedProfile { return runLegacySync(this.runtime, Effect.flatMap(NativeManager, manager => manager.get(url)), argumentError) }
  list(): SocialMappedProfile[] { return runLegacySync(this.runtime, Effect.flatMap(NativeManager, manager => manager.list), argumentError) }
  stop(url: string): Promise<SocialMappedProfile> { return runLegacyPromise(this.runtime, Effect.flatMap(NativeManager, manager => manager.stop(url)), argumentError) }
  map(url: string, category: string, settings?: DownloadRuntimeSettings, options: { incremental?: boolean } = {}): SocialMappedProfile { return runLegacySync(this.runtime, Effect.flatMap(NativeManager, manager => manager.map(url, category, settings, options)), argumentError) }
  mapAndWait(url: string, category: string, settings?: DownloadRuntimeSettings, options: { incremental?: boolean; signal?: AbortSignal } = {}): Promise<SocialMappedProfile> { return runLegacyPromise(this.runtime, Effect.flatMap(NativeManager, manager => manager.mapAndWait(url, category, settings, options)), argumentError) }
}
