import * as Native from "@vidbee/downloader-core/download-file";
export { normalizeSavedFileName } from "@vidbee/downloader-core/download-file";
export const buildFileNameCandidates = (title: string, format: string, savedFileName?: string): string[] =>
  Native.buildFileNameCandidates({ title, format, savedFileName });
export const buildFilePathCandidates = (downloadPath: string, title: string, format: string, savedFileName?: string): string[] =>
  Native.buildFilePathCandidates({ downloadPath, title, format, savedFileName });
