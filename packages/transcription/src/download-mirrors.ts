import * as Arr from "effect/Array";
import * as Fn from "effect/Function";
import * as HashSet from "effect/HashSet";
import * as Str from "effect/String";
import { DownloadMirror } from "./Mirror.model.js";
import type { ModelDownloadSpec } from "./Mirror.model.js";

export type { DownloadMirror, MirrorDecisionInput, ModelDownloadSpec } from "./Mirror.model.js";
export const DOWNLOAD_MIRROR_IDS = DownloadMirror.literals;
export const DEFAULT_DOWNLOAD_MIRROR: DownloadMirror = "auto";
/** GitHub release/API proxies that work from mainland China. Keep in sync with desktop scripts/github-mirrors.js. */
export const GITHUB_MIRROR_PREFIXES = ["https://ghfast.top/", "https://gh-proxy.com/"] as const;
const MODELSCOPE_RESOLVE = "https://www.modelscope.cn/models";
/**
 * Official sherpa-onnx files mirrored on ModelScope as extracted files (not the GitHub tar).
 * Keys are the on-disk model directory, or the bare file name for single-file assets.
 */
const MODELSCOPE_DIR_REPOS: Readonly<Record<string, string>> = {
  "sherpa-onnx-whisper-tiny": "pengzhendong/sherpa-onnx-whisper-tiny",
  "sherpa-onnx-whisper-base": "pengzhendong/sherpa-onnx-whisper-base",
  "sherpa-onnx-whisper-small": "pengzhendong/sherpa-onnx-whisper-small",
  "sherpa-onnx-whisper-medium": "pengzhendong/sherpa-onnx-whisper-medium",
  "sherpa-onnx-whisper-turbo": "pengzhendong/sherpa-onnx-whisper-turbo",
  "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17": "pengzhendong/sherpa-onnx-sense-voice-zh-en-ja-ko-yue",
  "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09":
    "aistoy/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09",
  "sherpa-onnx-pyannote-segmentation-3-0": "pengzhendong/sherpa-onnx-pyannote-segmentation-3-0",
  "sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25": "jkman2023/sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25",
  "sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8": "liaowenbin/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8",
};
const MODELSCOPE_FILE_REPOS: Readonly<Record<string, string>> = {
  "silero_vad.onnx": "liaowenbin/silero_vad",
  "3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx":
    "liaowenbin/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k",
};
/**
 * Return true when the value is a known download-mirror setting.
 */
export const isDownloadMirror = (value: unknown): value is DownloadMirror =>
  typeof value === "string" && (DOWNLOAD_MIRROR_IDS as readonly string[]).includes(value);
/**
 * Coerce an unknown setting/env value to a download-mirror id.
 */
export const parseDownloadMirror = (
  value: unknown,
  fallback: DownloadMirror = DEFAULT_DOWNLOAD_MIRROR
): DownloadMirror => (isDownloadMirror(value) ? value : fallback);
/**
 * True when the URL is a GitHub release, API, or user-content download.
 */
export const isGithubDownloadUrl = (url: string): boolean => {
  try {
    const host = new URL(url).hostname;
    return host === "github.com" || host === "api.github.com" || Str.endsWith(".githubusercontent.com")(host);
  } catch {
    return false;
  }
};
/**
 * Official URL plus GitHub proxies. China-first when `preferChina` is set.
 */
const githubDownloadUrlsDataFirst = (url: string, preference: boolean | undefined): string[] => {
  const preferChina = preference ?? false;
  if (!isGithubDownloadUrl(url)) {
    return [url];
  }
  const mirrors = Arr.map(GITHUB_MIRROR_PREFIXES, (prefix) => `${prefix}${url}`);
  return uniqueUrls(preferChina ? [...mirrors, url] : [url, ...mirrors]);
};
export const githubDownloadUrls: {
  (url: string, preferChina?: boolean): string[];
  (preferChina?: boolean): (url: string) => string[];
} = Fn.dual((args) => typeof args[0] === "string", githubDownloadUrlsDataFirst);
/**
 * ModelScope resolve URL for one extracted sherpa-onnx file, when a mapping exists.
 */
export const modelScopeFileUrl = (spec: ModelDownloadSpec): string | null => {
  const parts = Arr.filter(Str.split(/[/\\]/)(spec.fileName), Boolean);
  const baseName = parts.at(-1);
  if (baseName === undefined || !Str.includes(".")(baseName) || baseName === "tokenizer") {
    return null;
  }
  const fileRepo = MODELSCOPE_FILE_REPOS[baseName];
  if (fileRepo !== undefined && fileRepo !== "") {
    return `${MODELSCOPE_RESOLVE}/${fileRepo}/resolve/master/${encodeURIComponent(baseName)}`;
  }
  const dir = parts.length > 1 ? parts[0] : null;
  const dirRepo = dir != null && dir !== "" ? MODELSCOPE_DIR_REPOS[dir] : null;
  if (dirRepo == null || dirRepo === "") {
    return null;
  }
  return `${MODELSCOPE_RESOLVE}/${dirRepo}/resolve/master/${encodeURIComponent(baseName)}`;
};
/**
 * Ordered download candidates for one catalog file: ModelScope and/or GitHub mirrors.
 */
export const modelDownloadUrls: {
  (spec: ModelDownloadSpec, preferChina?: boolean): string[];
  (preferChina?: boolean): (spec: ModelDownloadSpec) => string[];
} = Fn.dual(
  (args) => args.length > 0 && typeof args[0] !== "boolean",
  (spec: ModelDownloadSpec, preference: boolean | undefined): string[] => {
    const preferChina = preference ?? false;
    const modelscope = modelScopeFileUrl(spec);
    const github = githubDownloadUrlsDataFirst(spec.url, preferChina);
    return uniqueUrls(preferChina ? [modelscope, ...github] : [...github, modelscope]);
  }
);
/**
 * Drop nulls and keep the first occurrence of each URL.
 */
const uniqueUrls = (urls: Array<string | null | undefined>): string[] => {
  let seen = HashSet.empty<string>();
  const out: string[] = [];
  for (const url of urls) {
    const hasUrl = Boolean(url);
    if (url == null || !hasUrl || HashSet.has(seen, url)) {
      continue;
    }
    seen = HashSet.add(seen, url);
    out.push(url);
  }
  return out;
};
