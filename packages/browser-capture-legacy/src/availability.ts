import * as Effect from 'effect/Effect'
import { runLegacyPromise, runLegacySync } from '@vidbee/task-queue-legacy/runtime'
import { CaptureHost } from '../../browser-capture/src/CaptureHost.service.js'
import { waitForDisplay as wait } from '../../browser-capture/src/availability.js'
import { platformRuntime } from './PlatformHost.adapter.js'
import { captureError } from './errors.js'
export { DEFAULT_CAPTURE_SIZE } from '../../browser-capture/src/availability.js'
export const isBrowserCaptureAvailable = (): boolean => runLegacySync(platformRuntime, Effect.flatMap(CaptureHost, host => host.available), captureError)
export const resolveXvfbPath = (): string | null => runLegacySync(platformRuntime, Effect.flatMap(CaptureHost, host => host.xvfb), captureError)
export const resolvePactlPath = (): string | null => runLegacySync(platformRuntime, Effect.flatMap(CaptureHost, host => host.pactl), captureError)
export const resolveBrowserExecutable = (preference?: string): string | null => runLegacySync(platformRuntime, Effect.flatMap(CaptureHost, host => host.browser(preference)), captureError)
export const pickDisplayNumber = (): number => runLegacySync(platformRuntime, Effect.flatMap(CaptureHost, host => host.displayNumber), captureError)
export const userHomeDir = (): string => runLegacySync(platformRuntime, Effect.map(Effect.flatMap(CaptureHost, host => host.snapshot), snapshot => snapshot.home), captureError)
export const waitForDisplay = (display: string, timeoutMs = 5000): Promise<void> => runLegacyPromise(platformRuntime, wait(display, timeoutMs), captureError)
