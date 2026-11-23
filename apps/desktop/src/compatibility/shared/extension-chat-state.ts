import type { ExtensionChatEvent, ExtensionChatState } from '../../shared/extension-chat'
import * as Native from '../../shared/extension-chat-state'
export const applyExtensionChatEvent = (
  current: ExtensionChatState,
  incoming: ExtensionChatEvent
): {
  state: ExtensionChatState
  gap: boolean
} =>
  Native.applyExtensionChatEvent({
    current,
    incoming
  })
