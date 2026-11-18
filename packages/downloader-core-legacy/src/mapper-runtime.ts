import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as NodePath from '@effect/platform-node/NodePath'
import * as Scheduler from 'effect/Scheduler'
import { DownloadProcess } from '../../downloader-core/src/DownloadProcess.service.js'
import { DownloadHost } from '../../downloader-core/src/DownloadHost.service.js'
import { DownloadFiles } from '../../downloader-core/src/DownloadFiles.service.js'
import { AsyncDownloadFilesLegacy } from './AsyncDownloadFiles.layer.js'
import { DownloadTiming } from '../../downloader-core/src/DownloadTiming.service.js'
import { DownloadHostLegacy } from './DownloadHost.layer.js'
import { makeProcessLayer } from './Process.layer.js'
import { argumentError } from './arguments-runtime.js'
import type { Path } from 'effect/Path'

export const mapperRuntime: ManagedRuntime.ManagedRuntime<DownloadProcess | DownloadHost | DownloadFiles | DownloadTiming | Path, never> = ManagedRuntime.make(Layer.mergeAll(AsyncDownloadFilesLegacy, Layer.succeed(DownloadTiming, {turn: () => Effect.promise(() => Promise.resolve()), sleep: milliseconds => Effect.promise(() => new Promise<void>(resolve => setTimeout(resolve, milliseconds)))}), DownloadHostLegacy, NodePath.layer, makeProcessLayer(() => mapperRuntime, argumentError), Layer.succeed(Scheduler.PreventSchedulerYield, true)))
mapperRuntime.runSync(Effect.void)
