import * as S from 'effect/Schema'
import { DesktopLogEntry } from '../../shared/logging/DesktopLog.model'
import { YtDlpKernelStatus } from '../../shared/types/ytdlp-kernel'
import { foundationEvents, foundationHosts } from './foundation-runtime'
export const publishFoundationSettings = (contents: { readonly id: number }): void => {
  try {
    foundationEvents.settings.publish(String(contents.id), undefined)
  } catch (error) {
    foundationHosts.logging.emit(
      DesktopLogEntry.make({
        level: 'error',
        scope: 'system',
        args: ['Failed to publish foundation settings change:', error]
      })
    )
  }
}
export const publishFoundationKernel = (
  contents: { readonly id: number },
  status: unknown
): void => {
  if (!S.is(YtDlpKernelStatus)(status)) {
    return
  }
  try {
    foundationEvents.kernel.publish(String(contents.id), status)
  } catch (error) {
    foundationHosts.logging.emit(
      DesktopLogEntry.make({
        level: 'error',
        scope: 'system',
        args: ['Failed to publish foundation kernel status:', error]
      })
    )
  }
}
export const publishFoundationHome = (contents: { readonly id: number }): void => {
  try {
    foundationEvents.home.publish(String(contents.id), undefined)
  } catch (error) {
    foundationHosts.logging.emit(
      DesktopLogEntry.make({
        level: 'error',
        scope: 'system',
        args: ['Failed to publish foundation show-home:', error]
      })
    )
  }
}
