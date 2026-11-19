export declare const DOWNLOAD_MIRROR_IDS: readonly ['auto', 'cn', 'global'];
export type DownloadMirror = (typeof DOWNLOAD_MIRROR_IDS)[number];
export declare const DEFAULT_DOWNLOAD_MIRROR: DownloadMirror;
/** GitHub release/API proxies that work from mainland China. Keep in sync with desktop scripts/github-mirrors.js. */
export declare const GITHUB_MIRROR_PREFIXES: readonly ['https://ghfast.top/', 'https://gh-proxy.com/'];
export interface MirrorDecisionInput {
    countryCode?: string;
    env?: NodeJS.ProcessEnv;
    language?: string;
    locales?: readonly string[];
    mirror?: string;
    timeZone?: string;
}
export interface ModelDownloadSpec {
    fileName: string;
    url: string;
}
/**
 * Return true when the value is a known download-mirror setting.
 */
export declare const isDownloadMirror: (value: unknown) => value is DownloadMirror;
/**
 * Coerce an unknown setting/env value to a download-mirror id.
 */
export declare const parseDownloadMirror: (value: unknown, fallback?: DownloadMirror) => DownloadMirror;
/**
 * True when mainland-China mirrors should be tried first.
 *
 * Uses the same system-language + timezone profile as first-run UI language.
 */
export declare const preferChinaMirrors: (input?: MirrorDecisionInput) => boolean;
/**
 * True when the URL is a GitHub release, API, or user-content download.
 */
export declare const isGithubDownloadUrl: (url: string) => boolean;
/**
 * Official URL plus GitHub proxies. China-first when `preferChina` is set.
 */
export declare const githubDownloadUrls: (url: string, preferChina?: boolean) => string[];
/**
 * ModelScope resolve URL for one extracted sherpa-onnx file, when a mapping exists.
 */
export declare const modelScopeFileUrl: (spec: ModelDownloadSpec) => string | null;
/**
 * Ordered download candidates for one catalog file: ModelScope and/or GitHub mirrors.
 */
export declare const modelDownloadUrls: (spec: ModelDownloadSpec, preferChina?: boolean) => string[];
/**
 * Fetch the first URL that returns an OK response. User abort is not retried.
 */
export declare const fetchFirstOk: (urls: readonly string[], fetchImpl: typeof fetch, init?: RequestInit, timeoutMs?: number) => Promise<{
    response: Response;
    url: string;
}>;
/**
 * Wrap `fetch` so GitHub URLs automatically try China-friendly mirrors.
 */
export declare const createGithubMirrorFetch: (fetchImpl: typeof fetch, preferChina: () => boolean, timeoutMs?: number) => typeof fetch;
