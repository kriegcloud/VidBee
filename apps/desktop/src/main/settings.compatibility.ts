// Preserve the synchronous native initialization at this historical import slot.
import {
  settingsManager as legacyManager,
  runSettings as runLegacySettings
} from './legacy/settings'

export const settingsManager = legacyManager
export const runSettings = runLegacySettings
