import * as Native from '../../../shared/utils/download-file'
export const normalizeSavedFileName = Native.normalizeSavedFileName
export const normalizeFilenameKey = Native.normalizeFilenameKey
export const buildFilenameKey = Native.buildFilenameKey
export const buildFileNameCandidates = (
  title: string,
  format: string,
  savedFileName?: string
): string[] =>
  Native.buildFileNameCandidates({
    title,
    format,
    savedFileName
  })
export const buildFilePathCandidates = (
  downloadPath: string,
  title: string,
  format: string,
  savedFileName?: string,
  filePath?: string
): string[] =>
  Native.buildFilePathCandidates({
    downloadPath,
    title,
    format,
    savedFileName,
    filePath
  })
