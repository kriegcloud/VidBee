import type { AiProviderPresetId } from '@shared/ai-types'
import { Sparkles } from 'lucide-react'
import type { ComponentType } from 'react'
import LobeAnthropic from '~icons/lobehub/anthropic'
import LobeAzureColor from '~icons/lobehub/azure-color'
import LobeDeepseekColor from '~icons/lobehub/deepseek-color'
import LobeGoogleColor from '~icons/lobehub/google-color'
import LobeGroq from '~icons/lobehub/groq'
import LobeHuggingfaceColor from '~icons/lobehub/huggingface-color'
import LobeLmstudio from '~icons/lobehub/lmstudio'
import LobeOllama from '~icons/lobehub/ollama'
import LobeOpenai from '~icons/lobehub/openai'
import LobeOpenrouter from '~icons/lobehub/openrouter'
import LobeXai from '~icons/lobehub/xai'

const PRESET_ICON: Partial<Record<AiProviderPresetId, ComponentType<{ className?: string }>>> = {
  anthropic: LobeAnthropic,
  azure: LobeAzureColor,
  deepseek: LobeDeepseekColor,
  google: LobeGoogleColor,
  groq: LobeGroq,
  huggingface: LobeHuggingfaceColor,
  lmstudio: LobeLmstudio,
  ollama: LobeOllama,
  openai: LobeOpenai,
  openrouter: LobeOpenrouter,
  xai: LobeXai
}

/**
 * Render the brand mark for a built-in AI provider.
 *
 * @param props.presetId Catalog provider id.
 */
export const AiProviderIcon = ({ presetId }: { presetId: AiProviderPresetId }) => {
  const Icon = PRESET_ICON[presetId]
  if (!Icon) {
    return <Sparkles aria-hidden className="size-4" />
  }
  return <Icon aria-hidden className="size-4" />
}
