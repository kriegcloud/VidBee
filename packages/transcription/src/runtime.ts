import { dual } from "effect/Function";
import * as Str from "effect/String";
import type { WorkerRuntime } from "./Runtime.model.js";

export type { WorkerRuntime } from "./Runtime.model.js";
export const nodeBinaryName = (platform: string): string => (platform === "win32" ? "node.exe" : "node");
export const MIN_NODE_MAJOR = 18;
export const DEFAULT_MAX_WORKER_RESTARTS = 2;
export const isElectronBinary = (bin: string): boolean => /Electron/i.test(bin);
const nodeVersionMeetsBaselineDataFirst = (version: string, minMajor = MIN_NODE_MAJOR): boolean => {
  const major = Number.parseInt(Str.split(".")(version)[0] ?? "", 10);
  return Number.isFinite(major) && major >= minMajor;
};
export const nodeVersionMeetsBaseline: {
  (version: string, minMajor?: number): boolean;
  (minMajor?: number): (version: string) => boolean;
} = dual((args) => args.length >= 2 || typeof args[0] === "string", nodeVersionMeetsBaselineDataFirst);
const formatRuntimeLogDataFirst = (runtime: WorkerRuntime, restarts = 0): string[] => [
  `runtime.path=${runtime.execPath}`,
  `runtime.version=${runtime.version}`,
  `runtime.layer=${runtime.layer}`,
  `runtime.restarts=${restarts}`,
];
export const formatRuntimeLog: {
  (runtime: WorkerRuntime, restarts?: number): string[];
  (restarts?: number): (runtime: WorkerRuntime) => string[];
} = dual((args) => args.length >= 2 || (args.length === 1 && typeof args[0] !== "number"), formatRuntimeLogDataFirst);
