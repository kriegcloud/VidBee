import { type IpcContext, IpcMethod, IpcService } from 'electron-ipc-decorator'
import { AI_PROVIDER_PRESETS } from '../../../shared/ai-presets'
import type {
  AiPrompt,
  AiPromptRunInput,
  AiPromptRunSnapshot,
  AiPromptWriteInput,
  AiProviderPreset,
  AiProviderTestResult,
  AiProviderWriteInput,
  AiSettingsSnapshot
} from '../../../shared/ai-types'
import { getPromptRunSnapshot, startPromptRun, stopPromptRun } from '../../lib/ai-prompt-runner'
import { testProviderConnection } from '../../lib/ai-provider-test'
import { aiStore } from '../../lib/ai-store'
import { settingsManager } from '../../settings'

class AiService extends IpcService {
  static readonly groupName = 'ai'

  /**
   * Return configured providers, the active provider, and prompts. API keys are omitted.
   */
  @IpcMethod()
  getSnapshot(_context: IpcContext): AiSettingsSnapshot {
    return aiStore.getSnapshot()
  }

  /**
   * Return the built-in provider catalog for the settings grid.
   */
  @IpcMethod()
  listPresets(_context: IpcContext): AiProviderPreset[] {
    return [...AI_PROVIDER_PRESETS]
  }

  /**
   * Create or update a provider from the shared dialog.
   *
   * @param input Dialog values, including an optional API key.
   */
  @IpcMethod()
  upsertProvider(_context: IpcContext, input: AiProviderWriteInput): AiSettingsSnapshot {
    aiStore.upsertProvider(input)
    return aiStore.getSnapshot()
  }

  /**
   * Delete a configured provider.
   *
   * @param id Provider id.
   */
  @IpcMethod()
  deleteProvider(_context: IpcContext, id: string): AiSettingsSnapshot {
    return aiStore.deleteProvider(id)
  }

  /**
   * Enable the provider used for transcript prompts.
   *
   * @param id Provider id, or null to clear.
   */
  @IpcMethod()
  setActiveProvider(_context: IpcContext, id: string | null): AiSettingsSnapshot {
    return aiStore.setActiveProvider(id)
  }

  /**
   * Create or update a prompt.
   *
   * @param input Dialog values.
   */
  @IpcMethod()
  upsertPrompt(_context: IpcContext, input: AiPromptWriteInput): AiPrompt {
    return aiStore.upsertPrompt(input)
  }

  /**
   * Delete a prompt.
   *
   * @param id Prompt id.
   */
  @IpcMethod()
  deletePrompt(_context: IpcContext, id: string): AiSettingsSnapshot {
    return aiStore.deletePrompt(id)
  }

  /**
   * Re-insert any missing built-in prompts.
   */
  @IpcMethod()
  restoreDefaultPrompts(_context: IpcContext): AiSettingsSnapshot {
    return aiStore.restoreDefaultPrompts()
  }

  /**
   * Start a prompt run in the main process. Returns immediately; tokens arrive on `ai:prompt-run`.
   *
   * @param input Transcript text plus ids.
   */
  @IpcMethod()
  startPrompt(_context: IpcContext, input: AiPromptRunInput): AiPromptRunSnapshot {
    return startPromptRun({
      ...input,
      uiLanguage: input.uiLanguage || String(settingsManager.get('language') ?? 'en')
    })
  }

  /**
   * Abort an in-flight prompt. Leaving the transcript page does not abort it.
   *
   * @param input Download and prompt ids.
   */
  @IpcMethod()
  stopPrompt(
    _context: IpcContext,
    input: { downloadId: string; promptId: string }
  ): AiPromptRunSnapshot {
    return stopPromptRun(input.downloadId, input.promptId)
  }

  /**
   * Restore a run after the renderer remounts.
   *
   * @param input Download and prompt ids.
   */
  @IpcMethod()
  getPromptRun(
    _context: IpcContext,
    input: { downloadId: string; promptId: string }
  ): AiPromptRunSnapshot {
    return getPromptRunSnapshot(input.downloadId, input.promptId)
  }

  /**
   * Send a short ping with the dialog values so the user can check the model.
   *
   * @param input Dialog values, including an optional API key.
   */
  @IpcMethod()
  async testProvider(
    _context: IpcContext,
    input: AiProviderWriteInput
  ): Promise<AiProviderTestResult> {
    return testProviderConnection(input)
  }
}

export { AiService }
