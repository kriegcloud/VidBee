import { $DesktopId } from "@vidbee/identity/packages";
import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as S from "effect/Schema";

const $I = $DesktopId.create("shared/App.model");
/** Readiness of both legacy download tools.
 *
 * **Example** (Inspect readiness fields)
 *
 * ```ts
 * import { DownloaderStatus } from './App.model.js'
 * DownloaderStatus.make({ffmpegReady: false, ytdlpReady: true}).ytdlpReady // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const DownloaderStatus = S.Struct({ ffmpegReady: S.Boolean, ytdlpReady: S.Boolean }).pipe(
  $I.annoteSchema("DownloaderStatus", { description: "Readiness of ffmpeg and yt-dlp." })
);
/** Serializable Electron message box options, including explicit undefined optional keys. Native image and AbortSignal options remain exclusive to legacy calls.
 *
 * **Example** (Validate required dialog content)
 *
 * ```ts
 * import { MessageBoxOptions } from './App.model.js'
 * import * as S from 'effect/Schema'
 * S.is(MessageBoxOptions)({message:'Continue?', buttons:['Continue', 'Cancel']}) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const MessageBoxOptions = S.Struct({
  message: S.String,
  type: LiteralKit(["none", "info", "error", "question", "warning"]).pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  buttons: S.Array(S.String).pipe(S.mutable, S.UndefinedOr, S.optionalKey, S.mutableKey),
  defaultId: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  textWidth: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  cancelId: S.Finite.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  title: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  detail: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  checkboxLabel: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  checkboxChecked: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  noLink: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  normalizeAccessKeys: S.Boolean.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  icon: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
}).pipe($I.annoteSchema("MessageBoxOptions", { description: "Complete serializable Electron message box options." }));
/** Electron dialog response and checkbox state.
 *
 * **Example** (Construct a dismissed dialog result)
 *
 * ```ts
 * import { MessageBoxResult } from './App.model.js'
 * MessageBoxResult.make({response:1,checkboxChecked:false}).response // => 1
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const MessageBoxResult = S.Struct({ response: S.Finite, checkboxChecked: S.Boolean }).pipe(
  $I.annoteSchema("MessageBoxResult", { description: "Electron message box completion." })
);
/** Decoded DownloaderStatus value.
 * @category type-level
 * @since 0.0.0
 */
export type DownloaderStatus = typeof DownloaderStatus.Type;
/** Decoded MessageBoxOptions value.
 * @category type-level
 * @since 0.0.0
 */
export type MessageBoxOptions = typeof MessageBoxOptions.Type;
/** Decoded MessageBoxResult value.
 * @category type-level
 * @since 0.0.0
 */
export type MessageBoxResult = typeof MessageBoxResult.Type;

/** Stable About metadata, with empty strings before hydration or after its historically cached failure.
 * **Example** (Construct provisional About metadata)
 * ```ts
 * import { AppInformation } from './App.model.js'
 * AppInformation.make({appVersion:'',osVersion:''}).appVersion // => ''
 * ```
 * @category schemas
 * @since 0.0.0
 */
export const AppInformation = S.Struct({ appVersion: S.String, osVersion: S.String }).pipe(
  $I.annoteSchema("AppInformation", { description: "Stable application and OS metadata for About and feedback." })
);
/** Decoded stable About metadata.
 * @category type-level
 * @since 0.0.0
 */
export type AppInformation = typeof AppInformation.Type;
