export {
  checkUpgrade,
  checkUpgradeFiles,
  compareSemver,
  defaultCachePath,
  fetchRegistry,
  REGISTRY_URL,
} from "./upgrade.js";
export { readCliVersion, readVersionFiles } from "./version.js";
export type { UpgradeCheckInput, UpgradeCheckResult } from "./upgrade.js";
export type { CliVersionInfo } from "./version.js";
