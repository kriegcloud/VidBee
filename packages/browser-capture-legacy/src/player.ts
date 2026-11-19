import * as Effect from 'effect/Effect'
import { runLegacyPromise } from '@vidbee/task-queue-legacy/runtime'
import { Playback } from '../../browser-capture/src/Playback.service.js'
import type { PlaybackInput } from '../../browser-capture/src/Playback.service.js'
import type { MediaClock, Playing } from '../../browser-capture/src/Playback.model.js'
import { waitUntilPlaybackAdvances as advances } from '../../browser-capture/src/player.js'
import { HostFailure } from '../../browser-capture/src/Capture.errors.js'
import { playbackError, playbackRuntime } from './PlaybackHost.adapter.js'
export { playbackHasAdvanced } from '../../browser-capture/src/player.js'
export type { MediaClock } from '../../browser-capture/src/Playback.model.js'
export interface PlaybackSession {
  mediaId: string | null
  waitUntilPlaying: () => Promise<Playing>
  waitUntilEnded: (onProgress: (state: {currentTime: number; duration: number}) => void) => Promise<void>
  close: () => Promise<void>
}
const promise = <A>(operation: string, body: () => Promise<A>) => Effect.callback<A, HostFailure>(resume => {
  try { body().then(value => resume(Effect.succeed(value)), cause => resume(Effect.fail(HostFailure.make({operation, legacyMessage: cause instanceof Error ? cause.message : String(cause), cause})))) }
  catch (cause) { resume(Effect.fail(HostFailure.make({operation, legacyMessage: cause instanceof Error ? cause.message : String(cause), cause}))) }
})
const callback = (operation: string, body: () => void) => Effect.try({try: body, catch: cause => HostFailure.make({operation, legacyMessage: cause instanceof Error ? cause.message : String(cause), cause})})
export const waitUntilPlaybackAdvances = (read: () => Promise<MediaClock | null>, input: {timeoutMs: number; signal: AbortSignal; sleep: (ms: number) => Promise<void>}): Promise<MediaClock> =>
  runLegacyPromise(playbackRuntime, advances(() => promise('readMediaState', read), { ...input, now: Effect.sync(() => Date.now()), sleep: ms => promise('sleep', () => input.sleep(ms)) }), playbackError)
type LegacyPlaybackInput = { -readonly [K in keyof PlaybackInput]: PlaybackInput[K] }
export const startPlayback = (input: LegacyPlaybackInput & {onLog?: (message: string) => void}): Promise<PlaybackSession> =>
  runLegacyPromise(playbackRuntime, Effect.gen(function* () {
    const playback = yield* Playback
    const session = yield* playback.start(input, {log: message => callback('onLog', () => input.onLog?.(message))})
    return {
      mediaId: session.mediaId,
      waitUntilPlaying: () => runLegacyPromise(playbackRuntime, session.waitUntilPlaying, playbackError),
      waitUntilEnded: onProgress => runLegacyPromise(playbackRuntime, session.waitUntilEnded(state => callback('onProgress', () => onProgress(state))), playbackError),
      close: () => runLegacyPromise(playbackRuntime, session.close, playbackError)
    }
  }), playbackError)
