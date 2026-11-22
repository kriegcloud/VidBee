import { AccountPanel } from '@renderer/components/settings/AccountPanel'
import { AiPromptsPanel } from '@renderer/components/settings/AiPromptsPanel'
import { AiProvidersPanel } from '@renderer/components/settings/AiProvidersPanel'
import { AsrModelPicker } from '@renderer/components/settings/AsrModelPicker'
import { CloudTranscriptionSettings } from '@renderer/components/settings/CloudTranscriptionSettings'
import { CookiesSetupPanel } from '@renderer/components/settings/CookiesSetupPanel'
import { McpPanel } from '@renderer/components/settings/McpPanel'
import type { SettingsPanels } from '../runtime/SettingsPanels'

/** Later-capability panels are installed only by the legacy composition shell. */
export const settingsPanels: SettingsPanels = {
  AccountPanel,
  AiPromptsPanel,
  AiProvidersPanel,
  AsrModelPicker,
  CloudTranscriptionSettings,
  CookiesSetupPanel,
  McpPanel
}
