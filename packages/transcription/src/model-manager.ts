import { dual } from "effect/Function";

const modelPartPathDataFirst = (dest: string, pid: number): string => `${dest}.part.${pid}`;
export const modelPartPath: {
  (dest: string, pid: number): string;
  (pid: number): (dest: string) => string;
} = dual(2, modelPartPathDataFirst);
export const MODEL_DOWNLOAD_CANCELLED = "download cancelled";

export const isModelDownloadCancelled = (error: unknown): boolean => {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  return name === "AbortError" || /download cancelled|operation was aborted/i.test(message);
};
