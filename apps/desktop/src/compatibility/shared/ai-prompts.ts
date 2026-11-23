import * as Native from '../../shared/ai-prompts'
import {
  type AgentChatPromptInput as ReexportAgentChatPromptInput,
  AI_CHAT_PROMPT_ID as ReexportAI_CHAT_PROMPT_ID,
  AI_OVERVIEW_PROMPT_ID as ReexportAI_OVERVIEW_PROMPT_ID,
  AI_PROMPT_PRESETS as ReexportAI_PROMPT_PRESETS,
  AI_PROMPT_UI_LANGUAGE_TOKEN as ReexportAI_PROMPT_UI_LANGUAGE_TOKEN,
  type AiPromptDescriptionInput as ReexportAiPromptDescriptionInput,
  type AiPromptLabelInput as ReexportAiPromptLabelInput,
  aiPromptUiLanguageName as ReexportaiPromptUiLanguageName,
  type CanonicalizeAiPromptContentInput as ReexportCanonicalizeAiPromptContentInput,
  isAiPromptPresetName as ReexportisAiPromptPresetName,
  isTranscriptSkillSidebarEnabled as ReexportisTranscriptSkillSidebarEnabled,
  isTranscriptSkillVisible as ReexportisTranscriptSkillVisible,
  type MergeDefaultAiPromptsInput as ReexportMergeDefaultAiPromptsInput,
  partitionTranscriptPromptTabs as ReexportpartitionTranscriptPromptTabs,
  type ResolveAiPromptContentInput as ReexportResolveAiPromptContentInput
} from '../../shared/ai-prompts'

export {
  type ReexportAgentChatPromptInput as AgentChatPromptInput,
  ReexportAI_CHAT_PROMPT_ID as AI_CHAT_PROMPT_ID,
  ReexportAI_OVERVIEW_PROMPT_ID as AI_OVERVIEW_PROMPT_ID,
  ReexportAI_PROMPT_PRESETS as AI_PROMPT_PRESETS,
  ReexportAI_PROMPT_UI_LANGUAGE_TOKEN as AI_PROMPT_UI_LANGUAGE_TOKEN,
  type ReexportAiPromptDescriptionInput as AiPromptDescriptionInput,
  type ReexportAiPromptLabelInput as AiPromptLabelInput,
  ReexportaiPromptUiLanguageName as aiPromptUiLanguageName,
  type ReexportCanonicalizeAiPromptContentInput as CanonicalizeAiPromptContentInput,
  ReexportisAiPromptPresetName as isAiPromptPresetName,
  ReexportisTranscriptSkillSidebarEnabled as isTranscriptSkillSidebarEnabled,
  ReexportisTranscriptSkillVisible as isTranscriptSkillVisible,
  type ReexportMergeDefaultAiPromptsInput as MergeDefaultAiPromptsInput,
  ReexportpartitionTranscriptPromptTabs as partitionTranscriptPromptTabs,
  type ReexportResolveAiPromptContentInput as ResolveAiPromptContentInput
}

import type { AiPrompt } from '../../shared/ai-types'
export function agentChatPrompt(now: number = Date.now(), hasSource = true): AiPrompt {
  return Native.agentChatPrompt({
    now,
    hasSource
  })
}
export function resolveAiPromptContent(content: string, languageCode: string): string {
  return Native.resolveAiPromptContent({
    content,
    languageCode
  })
}
export function canonicalizeAiPromptContent(promptId: string, content: string): string {
  return Native.canonicalizeAiPromptContent({
    promptId,
    content
  })
}
export function aiPromptLabel(
  prompt: Pick<AiPrompt, 'name' | 'isPreset' | 'description'>,
  translate?: (key: string) => string
): string {
  return Native.aiPromptLabel({
    prompt,
    translate
  })
}
export function aiPromptDescription(
  prompt: Pick<AiPrompt, 'name' | 'isPreset' | 'description'>,
  translate?: (key: string) => string
): string {
  return Native.aiPromptDescription({
    prompt,
    translate
  })
}
export function mergeDefaultAiPrompts(existing: AiPrompt[], now: number = Date.now()): AiPrompt[] {
  return Native.mergeDefaultAiPrompts({
    existing,
    now
  })
}
export function createDefaultAiPrompts(now: number = Date.now()): AiPrompt[] {
  return Native.createDefaultAiPrompts(now)
}
