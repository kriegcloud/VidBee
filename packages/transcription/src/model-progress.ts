import * as P from "effect/Predicate";
import type { ModelPrepStatus } from "./Model.model.js";

export type { ModelPrepStatus } from "./Model.model.js";

import * as Arr from "effect/Array";
import type { ModelStatus } from "./types.js";

/**
 * Map on-disk files plus the active download into a 0-100 prep percentage.
 *
 * @param status Model manager status for the boot (minimal) catalog slice.
 */
export const modelFillPercent = (status: Pick<ModelStatus, "downloads" | "files" | "ready">): number => {
  if (status.ready) {
    return 100;
  }
  const totalFiles = status.files.length;
  if (totalFiles === 0) {
    return 0;
  }
  const present = Arr.filter(status.files, (file) => file.present).length;
  const active = status.downloads[0];
  const current =
    P.isTruthy(active?.total) && active !== undefined && active.total !== null && active.total > 0
      ? Math.min(1, Math.max(0, active.received / active.total))
      : 0;
  return Math.min(99, Math.round(((present + current) / totalFiles) * 100));
};

/**
 * Compact prep snapshot used by the desktop banner and IPC.
 *
 * @param status Model manager status for the boot (minimal) catalog slice.
 */
export const toModelPrepStatus = (status: Pick<ModelStatus, "downloads" | "files" | "ready">): ModelPrepStatus => ({
  downloading: status.downloads.length > 0,
  ready: status.ready,
  percent: modelFillPercent(status),
});
