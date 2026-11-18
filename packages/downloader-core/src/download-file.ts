import * as A from "effect/Array";
import { dual } from "effect/Function";
import * as Str from "effect/String";
export const normalizeSavedFileName = (fileName?: string): string | undefined => {
  if (!(fileName !== undefined && fileName !== null && fileName !== "")) {
    return undefined;
  }

  const trimmed = Str.trim(fileName);
  if (!(trimmed !== undefined && trimmed !== null && trimmed !== "")) {
    return undefined;
  }

  // Remove yt-dlp format identifiers before the final extension, for example:
  // - .f123
  // - .fhls-audio-128000-Audio
  // - .fwebm-video-only
  return Str.replace(/\.f[a-z0-9-]+(?=\.[^.]+$)/gi, "")(trimmed);
};

export const buildFileNameCandidates: {
  (format: string, savedFileName?: string): (title: string) => string[];
  (title: string, format: string, savedFileName?: string): string[];
} = dual(
  (args) => args.length >= 2,
  (title: string, format: string, savedFileName?: string): string[] => {
    const safeTitle = Str.trim(title) || "Unknown";

    const savedNameCandidates: string[] = [];
    const trimmedSavedFileName =
      savedFileName === undefined || savedFileName === null ? undefined : Str.trim(savedFileName);
    if (trimmedSavedFileName !== undefined && trimmedSavedFileName !== null && trimmedSavedFileName !== "") {
      const normalized = normalizeSavedFileName(trimmedSavedFileName);
      if (normalized !== undefined && normalized !== null && normalized !== "") {
        savedNameCandidates.push(normalized);
      }
      if (
        !(normalized !== undefined && normalized !== null && normalized !== "") ||
        normalized !== trimmedSavedFileName
      ) {
        savedNameCandidates.push(trimmedSavedFileName);
      }
    }

    return savedNameCandidates.length > 0
      ? savedNameCandidates
      : [`${safeTitle} via VidBeep.${format}`, `${safeTitle} via VidBee.${format}`, `${safeTitle}.${format}`];
  }
);

export const buildFilePathCandidates: {
  (title: string, format: string, savedFileName?: string): (downloadPath: string) => string[];
  (downloadPath: string, title: string, format: string, savedFileName?: string): string[];
} = dual(
  (args) => args.length >= 3,
  (downloadPath: string, title: string, format: string, savedFileName?: string): string[] => {
    const normalizedDownloadPath = Str.replace(/\\/g, "/")(downloadPath);
    const candidateFileNames = buildFileNameCandidates(title, format, savedFileName);

    return A.dedupe(A.map(candidateFileNames, (fileName) => `${normalizedDownloadPath}/${fileName}`));
  }
);
