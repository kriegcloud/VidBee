import * as Native from '../../../shared/types/share-card'
import {
  isShareCaptureHash as ReexportisShareCaptureHash,
  SHARE_CAPTURE_HASH as ReexportSHARE_CAPTURE_HASH,
  SHARE_CAPTURE_READY_CHANNEL as ReexportSHARE_CAPTURE_READY_CHANNEL,
  SHARE_CAPTURE_RENDER_CHANNEL as ReexportSHARE_CAPTURE_RENDER_CHANNEL,
  SHARE_CARD_WIDTH as ReexportSHARE_CARD_WIDTH,
  type ShareBylineInput as ReexportShareBylineInput,
  type ShareCaptionCardPayload as ReexportShareCaptionCardPayload,
  type ShareCaptionQuote as ReexportShareCaptionQuote,
  type ShareCaptureReadyMessage as ReexportShareCaptureReadyMessage,
  type ShareCaptureRenderMessage as ReexportShareCaptureRenderMessage,
  type ShareCardPayload as ReexportShareCardPayload,
  type ShareImageLayout as ReexportShareImageLayout,
  type SharePromptCardPayload as ReexportSharePromptCardPayload,
  type SharePromptUserInput as ReexportSharePromptUserInput
} from '../../../shared/types/share-card'

export {
  ReexportisShareCaptureHash as isShareCaptureHash,
  ReexportSHARE_CAPTURE_HASH as SHARE_CAPTURE_HASH,
  ReexportSHARE_CAPTURE_READY_CHANNEL as SHARE_CAPTURE_READY_CHANNEL,
  ReexportSHARE_CAPTURE_RENDER_CHANNEL as SHARE_CAPTURE_RENDER_CHANNEL,
  ReexportSHARE_CARD_WIDTH as SHARE_CARD_WIDTH,
  type ReexportShareBylineInput as ShareBylineInput,
  type ReexportShareCaptionCardPayload as ShareCaptionCardPayload,
  type ReexportShareCaptionQuote as ShareCaptionQuote,
  type ReexportShareCaptureReadyMessage as ShareCaptureReadyMessage,
  type ReexportShareCaptureRenderMessage as ShareCaptureRenderMessage,
  type ReexportShareCardPayload as ShareCardPayload,
  type ReexportShareImageLayout as ShareImageLayout,
  type ReexportSharePromptCardPayload as SharePromptCardPayload,
  type ReexportSharePromptUserInput as SharePromptUserInput
}
export const shareCardSourceByline = (platform?: string | null, channel?: string | null): string =>
  Native.shareCardSourceByline({
    platform,
    channel
  })
export const sharePromptUserText = (
  messages: Array<{
    id: string
    parentId: string | null
    role: string
    text: string
  }>,
  assistantId: string,
  promptTitle?: string | null,
  promptName?: string | null
): string | undefined =>
  Native.sharePromptUserText({
    messages,
    assistantId,
    promptTitle,
    promptName
  })
