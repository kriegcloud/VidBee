import * as NodePath from '@effect/platform-node/NodePath'
import * as Effect from 'effect/Effect'
import * as Scheduler from 'effect/Scheduler'
import * as Cause from 'effect/Cause'
import * as Option from 'effect/Option'
import { InvalidDownload, BinaryUnavailable, MetadataFailure, ProfileUnavailable, ProfileBusy, ProfileIdentityMismatch, BoundaryDecodeError, HostFailure } from '../../downloader-core/src/Downloader.errors.js'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import { DownloadFilesLegacy } from './DownloadFiles.layer.js'
import { DownloadHostLegacy } from './DownloadHost.layer.js'

export const argumentsRuntime = ManagedRuntime.make(Layer.mergeAll(DownloadFilesLegacy, DownloadHostLegacy, NodePath.layer, Layer.succeed(Scheduler.PreventSchedulerYield, true)))
argumentsRuntime.runSync(Effect.void)

export const argumentError = (cause: Cause.Cause<unknown>): unknown => {
  const failure = Cause.findErrorOption(cause)
  if (Option.isNone(failure)) return Cause.squash(cause)
  const error = failure.value
  if (error instanceof MetadataFailure && error.jsonInput !== undefined) {
    try { JSON.parse(error.jsonInput) } catch (syntax) { return syntax }
  }
  if (error instanceof InvalidDownload || error instanceof BinaryUnavailable || error instanceof MetadataFailure || error instanceof ProfileUnavailable || error instanceof ProfileBusy || error instanceof ProfileIdentityMismatch || error instanceof BoundaryDecodeError || error instanceof HostFailure) {
    if ('cause' in error) return error.cause
    return new Error(String(error.legacyMessage))
  }
  return error
}
