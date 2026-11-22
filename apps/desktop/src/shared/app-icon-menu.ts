import { $DesktopId } from '@vidbee/identity/packages'
import { LiteralKit } from '@vidbee/schema/LiteralKit'
import { dual } from 'effect/Function'
import * as S from 'effect/Schema'

const $I = $DesktopId.create('shared/app-icon-menu')

/** APP_ICON_MENU_COMMAND_CHANNEL shared contract.
 * @category utilities
 * @since 0.0.0
 * @example APP_ICON_MENU_COMMAND_CHANNEL
 */
export const APP_ICON_MENU_COMMAND_CHANNEL = 'playback:icon-menu'
/** APP_ICON_SHOW_HOME_CHANNEL shared contract.
 * @category utilities
 * @since 0.0.0
 * @example APP_ICON_SHOW_HOME_CHANNEL
 */
export const APP_ICON_SHOW_HOME_CHANNEL = 'app:show-home'

/** Playback commands from the dock or tray.
 *
 * **Example** (Construct AppIconMenuCommand)
 *
 * ```ts
 * import { AppIconMenuCommand } from './app-icon-menu.js'
 * const value = AppIconMenuCommand.make("next")
 * value // => "next"
 * ```
 *
 * @category schemas
 * @since 0.0.0
 * structural for legacy construction.
 */
export const AppIconMenuCommand = LiteralKit(['next', 'previous', 'toggle']).pipe(
  $I.annoteSchema('AppIconMenuCommand', { description: 'Dock or tray playback command.' })
)
/** AppIconMenuCommand shared contract.
 * @category utilities
 * @since 0.0.0
 * @example AppIconMenuCommand
 */
export type AppIconMenuCommand = typeof AppIconMenuCommand.Type

/** Mutable playback availability shared by the tray and dock.
 *
 * **Example** (Construct AppIconMenuState)
 *
 * ```ts
 * import { AppIconMenuState } from './app-icon-menu.js'
 * const value = AppIconMenuState.make({canNext: false, canPrevious: false, canToggle: false, playing: false})
 * value.playing // => false
 * ```
 *
 * @category schemas
 * @since 0.0.0
 * structural for legacy construction.
 */
export const AppIconMenuState = S.Struct({
  canNext: S.Boolean.pipe(S.mutableKey),
  canPrevious: S.Boolean.pipe(S.mutableKey),
  canToggle: S.Boolean.pipe(S.mutableKey),
  playing: S.Boolean.pipe(S.mutableKey)
}).pipe(
  $I.annoteSchema('AppIconMenuState', {
    description: 'Playback availability displayed by the application icon menu.'
  })
)
/** AppIconMenuState shared contract.
 * @category utilities
 * @since 0.0.0
 * @example AppIconMenuState
 */
export type AppIconMenuState = typeof AppIconMenuState.Type

/** EMPTY_APP_ICON_MENU_STATE shared contract.
 * @category utilities
 * @since 0.0.0
 * @example EMPTY_APP_ICON_MENU_STATE
 */
export const EMPTY_APP_ICON_MENU_STATE: AppIconMenuState = {
  canNext: false,
  canPrevious: false,
  canToggle: false,
  playing: false
}

/**
 * Derive dock/tray playback actions from the current session and playlist.
 * @example buildAppIconMenuState
 * @category utilities
 * @since 0.0.0
 */
export const buildAppIconMenuState = (input: {
  playlistCount: number
  playing: boolean
  sessionId: string | null
}): AppIconMenuState => {
  const hasSession = Boolean(input.sessionId)
  return {
    canNext: hasSession && input.playlistCount > 1,
    canPrevious: hasSession,
    canToggle: hasSession || input.playlistCount > 0,
    playing: hasSession && input.playing
  }
}

/**
 * True when two icon-menu snapshots would render the same items.
 * @example sameAppIconMenuState
 * @category utilities
 * @since 0.0.0
 */
export const sameAppIconMenuState: {
  (right: AppIconMenuState): (left: AppIconMenuState) => boolean
  (left: AppIconMenuState, right: AppIconMenuState): boolean
} = dual(
  2,
  (left: AppIconMenuState, right: AppIconMenuState): boolean =>
    left.canNext === right.canNext &&
    left.canPrevious === right.canPrevious &&
    left.canToggle === right.canToggle &&
    left.playing === right.playing
)

/**
 * Narrow a renderer IPC payload to a known icon-menu command.
 * @example isAppIconMenuCommand
 * @category utilities
 * @since 0.0.0
 */
export const isAppIconMenuCommand = S.is(AppIconMenuCommand)
