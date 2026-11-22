import * as Native from '../../shared/extension-transcript'
import {
  type CaptionSidecarFormat as ReexportCaptionSidecarFormat,
  captionCuesFromPayload as ReexportcaptionCuesFromPayload,
  classifyCaptionExtractError as ReexportclassifyCaptionExtractError,
  type ExtensionTranscriptErrorCode as ReexportExtensionTranscriptErrorCode,
  type ExtensionTranscriptInput as ReexportExtensionTranscriptInput,
  type ExtensionTranscriptJob as ReexportExtensionTranscriptJob,
  type ExtensionTranscriptSegment as ReexportExtensionTranscriptSegment,
  type ExtensionTranscriptSnapshot as ReexportExtensionTranscriptSnapshot,
  type ExtensionTranscriptStatus as ReexportExtensionTranscriptStatus,
  type ExtensionTranscriptTrack as ReexportExtensionTranscriptTrack,
  parseCaptionSidecarName as ReexportparseCaptionSidecarName
} from '../../shared/extension-transcript'

export {
  type ReexportCaptionSidecarFormat as CaptionSidecarFormat,
  ReexportcaptionCuesFromPayload as captionCuesFromPayload,
  ReexportclassifyCaptionExtractError as classifyCaptionExtractError,
  type ReexportExtensionTranscriptErrorCode as ExtensionTranscriptErrorCode,
  type ReexportExtensionTranscriptInput as ExtensionTranscriptInput,
  type ReexportExtensionTranscriptJob as ExtensionTranscriptJob,
  type ReexportExtensionTranscriptSegment as ExtensionTranscriptSegment,
  type ReexportExtensionTranscriptSnapshot as ExtensionTranscriptSnapshot,
  type ReexportExtensionTranscriptStatus as ExtensionTranscriptStatus,
  type ReexportExtensionTranscriptTrack as ExtensionTranscriptTrack,
  ReexportparseCaptionSidecarName as parseCaptionSidecarName
}
export const pickExtensionCaptionTrack = <
  T extends {
    auto: boolean
    id: string
    language: string
  }
>(
  tracks: T[],
  requested?: string
): T | undefined =>
  Native.pickExtensionCaptionTrack({
    tracks,
    requested
  })
