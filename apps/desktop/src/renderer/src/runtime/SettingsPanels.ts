import type { AsrTierId } from "@vidbee/transcription/asr";
import type * as React from "react";
import type { AppSettings } from "../../../shared/types/Desktop.model.js";

/** Capability panel slots injected by legacy composition. The settings view owns preference state and callbacks; capability implementations remain with their later port phases.
 * **Example** (Name a cookies panel slot)
 * ```ts
 * import type { SettingsPanels } from './SettingsPanels.js'
 * export type CookiesSlot=SettingsPanels['CookiesSetupPanel']
 * // A slot receives the platform value without importing the cookies capability.
 * ```
 * @category type-level
 * @since 0.0.0
 */
export interface SettingsPanels {
  readonly AccountPanel: React.ComponentType;
  readonly AiPromptsPanel: React.ComponentType;
  readonly AiProvidersPanel: React.ComponentType;
  readonly AsrModelPicker: React.ComponentType<{
    readonly activeTier: AsrTierId;
    readonly autoTranscribe: boolean;
    readonly concurrency: number;
    readonly onChangeConcurrency: (value: number) => Promise<void>;
    readonly onSelectTier: (tier: AsrTierId) => Promise<void>;
    readonly onToggleAutoTranscribe: () => Promise<void>;
    readonly showModels: boolean;
  }>;
  readonly CloudTranscriptionSettings: React.ComponentType<{
    readonly settings: AppSettings;
    readonly onChange: (key: keyof AppSettings, value: AppSettings[keyof AppSettings]) => Promise<void>;
    readonly onOpenAccount: () => void;
  }>;
  readonly CookiesSetupPanel: React.ComponentType<{ readonly platform: string }>;
  readonly McpPanel: React.ComponentType;
}
