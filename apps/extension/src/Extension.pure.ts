import * as P from "effect/Predicate";
import * as Str from "effect/String";
import type { VideoFormat } from "./Extension.model.js";
export const isValidHttpUrl = (value?: string): boolean => {
  if (!P.isTruthy(value)) {
    return false;
  }
  return Str.startsWith("http://")(value ?? "") || Str.startsWith("https://")(value ?? "");
};

export const formatDuration = (value?: number): string => {
  if (value === undefined || !P.isTruthy(value) || value <= 0) {
    return "Unknown";
  }
  const totalSeconds = Math.round(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const paddedMinutes = hours > 0 ? Str.padStart(2, "0")(String(minutes)) : String(minutes);
  const paddedSeconds = Str.padStart(2, "0")(String(seconds));
  return hours > 0 ? `${hours}:${paddedMinutes}:${paddedSeconds}` : `${minutes}:${paddedSeconds}`;
};

export const formatBytes = (value?: number): string => {
  if (value === undefined || !P.isTruthy(value) || value <= 0) {
    return "-";
  }
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 100 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

export const isVideoFormat = (format: VideoFormat): boolean => {
  if (P.isTruthy(format.vcodec) && format.vcodec !== "none") {
    return true;
  }
  return P.isTruthy(format.resolution || format.width || format.height);
};

export const isAudioFormat = (format: VideoFormat): boolean =>
  P.isTruthy(format.acodec && format.acodec !== "none" && !isVideoFormat(format));

export const sanitizeError = (error: string): string => {
  const message = Str.toLowerCase(error);
  if (
    Str.includes("localhost")(message) ||
    Str.includes("fetch")(message) ||
    Str.includes("network")(message) ||
    Str.includes("connect")(message) ||
    Str.includes("failed to request")(message)
  ) {
    return "Client connection failed";
  }
  return error;
};

// The old request catch classified Error messages after every operation in its try block.
// A scalar rejection keeps the separate application fallback.
export const requestFailureMessage = (cause: unknown): string => {
  if (cause instanceof DOMException && cause.name === "AbortError") return "Request timed out.";
  if (!(cause instanceof Error)) return "Failed to fetch video info.";
  if (Str.includes("signal is aborted")(cause.message)) return "Request timed out.";
  if (Str.includes("Failed to fetch")(cause.message)) return "VidBeep app not responding on this port.";
  return cause.message;
};
