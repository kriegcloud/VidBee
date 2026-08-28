/**
 * Open a media picker and import the selected files.
 *
 * @param input File-dialog and import callbacks.
 * @returns Whether any files were imported.
 */
export const pickAndImportLocalMedia = async (input: {
  importMediaPaths: (paths: string[]) => Promise<void>
  selectMediaFiles: () => Promise<string[]>
}): Promise<boolean> => {
  const paths = await input.selectMediaFiles()
  if (paths.length === 0) {
    return false
  }
  await input.importMediaPaths(paths)
  return true
}
