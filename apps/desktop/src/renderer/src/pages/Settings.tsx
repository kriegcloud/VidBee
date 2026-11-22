import '../legacy/SettingsPanels'
import { settingsPanels } from '../legacy/SettingsPanels'
import { SettingsScreen } from './SettingsScreen'

/** Keep capability and route composition outside the preference view. */
export function Settings() {
  return <SettingsScreen panels={settingsPanels} />
}
