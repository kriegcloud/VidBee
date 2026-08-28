export const HISTORY_MIGRATED_META_KEY = 'desktop_history_migrated'

/**
 * Import legacy `download_history` only on the first empty-tasks boot.
 * Re-running after the user deleted a task would resurrect it via INSERT OR IGNORE.
 */
export const shouldImportLegacyHistory = (input: {
  historyMigrated: boolean
  tasksCount: number
}): boolean => !input.historyMigrated && input.tasksCount === 0
