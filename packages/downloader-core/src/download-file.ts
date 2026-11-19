import * as A from "effect/Array";
import * as Str from "effect/String";
export const normalizeSavedFileName = (fileName?: string): string | undefined => {
  const hasName = Boolean(fileName);
  if (fileName === undefined || !hasName) {
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

export const buildFileNameCandidates = (options: {
  readonly title: string;
  readonly format: string;
  readonly savedFileName?: string | undefined;
}): string[] => {
  const { title, format, savedFileName } = options;
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
};

export const buildFilePathCandidates = (options: {
  readonly downloadPath: string;
  readonly title: string;
  readonly format: string;
  readonly savedFileName?: string | undefined;
}): string[] => {
  const { downloadPath, title, format, savedFileName } = options;
  const normalizedDownloadPath = Str.replace(/\\/g, "/")(downloadPath);
  const candidateFileNames = buildFileNameCandidates({ title, format, savedFileName });

  return A.dedupe(A.map(candidateFileNames, (fileName) => `${normalizedDownloadPath}/${fileName}`));
};
