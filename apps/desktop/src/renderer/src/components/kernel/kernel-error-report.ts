import * as A from "effect/Array";
import { dual } from "effect/Function";
import * as Str from "effect/String";
import type { AppInformation } from "../../../../shared/App.model.js";
import type { YtDlpKernelStatus } from "../../../../shared/types/index.js";

/** Title shared by the copyable report's issue link.
 * **Example** (Use the existing bug title)
 * ```ts
 * import { KERNEL_PREPARATION_ISSUE_TITLE } from './kernel-error-report.js'
 * export const title: string = KERNEL_PREPARATION_ISSUE_TITLE
 * ```
 * @category constants
 * @since 0.0.0
 */
export const KERNEL_PREPARATION_ISSUE_TITLE = "[Bug]: Download engine unavailable";

const GITHUB_ISSUE_BASE = "https://github.com/nexmoe/VidBee/issues/new";
const GITHUB_ISSUE_TEMPLATE = "bug_report.yml";
const MAX_LOGS_CHARS = 4000;
const UNKNOWN_VALUE = "Unknown";
const known = (value: string): string => (value.length > 0 ? value : UNKNOWN_VALUE);

/** Metadata fields from the foundation's schema-backed application information.
 * @category models
 * @since 0.0.0
 */
export type KernelErrorAppInfo = AppInformation;

/** Normalize the diagnostic before the compatibility clock is consulted.
 * **Example** (Preserve the missing-error fallback)
 * ```ts
 * import { normalizeKernelError } from './kernel-error-report.js'
 * export const missing = normalizeKernelError(undefined)
 * // => 'No detailed error was recorded.'
 * ```
 * @category formatting
 * @since 0.0.0
 */
export function normalizeKernelError(error: string | null | undefined): string {
  const value = Str.trim(error ?? "");
  return value.length > 0 ? value : "No detailed error was recorded.";
}

/**
 * Truncate diagnostic text so the GitHub issue URL stays within browser limits.
 */
function truncateLogs(value: string): string {
  if (value.length <= MAX_LOGS_CHARS) {
    return value;
  }
  return `${Str.slice(0, MAX_LOGS_CHARS)(value)}\n…(truncated)`;
}

/**
 * Build a copyable report with an explicitly supplied clock observation and normalized error.
 * **Example** (Build a deterministic report)
 * ```ts
 * import { buildKernelErrorReport } from './kernel-error-report.js'
 * export const report = (status: Parameters<typeof buildKernelErrorReport>[0]) => buildKernelErrorReport(status,
 *   { appVersion: '1.0', osVersion: 'Linux' }, '2026-01-01T00:00:00.000Z', 'Download failed')
 * ```
 * @category formatting
 * @since 0.0.0
 */
export const buildKernelErrorReport: {
  (appInfo: KernelErrorAppInfo, timestamp: string, errorText: string): (status: YtDlpKernelStatus) => string;
  (status: YtDlpKernelStatus, appInfo: KernelErrorAppInfo, timestamp: string, errorText: string): string;
} = dual(4, (status: YtDlpKernelStatus, appInfo: KernelErrorAppInfo, timestamp: string, errorText: string): string =>
  A.join(
    [
      "=== VidBeep download engine error ===",
      `Timestamp: ${timestamp}`,
      `App version: ${known(Str.trim(appInfo.appVersion))}`,
      `OS: ${known(Str.trim(appInfo.osVersion))}`,
      `State: ${status.state}`,
      `Source: ${status.source ?? "none"}`,
      `yt-dlp: ${status.ytDlpVersion ?? "unknown"}`,
      `Node: ${status.nodeVersion ?? "unknown"}`,
      "",
      "--- Error ---",
      errorText,
      "",
      "=== End of report ===",
    ],
    "\n"
  )
);

/**
 * Build a prefilled GitHub bug-report URL for a kernel preparation failure.
 * **Example** (Encode a report for the existing issue template)
 * ```ts
 * import { buildKernelIssueUrl } from './kernel-error-report.js'
 * export const url = buildKernelIssueUrl('Download failed', { appVersion: '1.0', osVersion: 'Linux' })
 * // The logs query contains the report, capped at 4,000 characters.
 * ```
 * @category formatting
 * @since 0.0.0
 */
export const buildKernelIssueUrl: {
  (appInfo: KernelErrorAppInfo): (report: string) => string;
  (report: string, appInfo: KernelErrorAppInfo): string;
} = dual(2, (report: string, appInfo: KernelErrorAppInfo): string => {
  const issueParams = new URLSearchParams({
    template: GITHUB_ISSUE_TEMPLATE,
    title: KERNEL_PREPARATION_ISSUE_TITLE,
    actual: "VidBeep could not prepare a working download engine. Diagnostic details are in the logs field.",
    logs: truncateLogs(report),
    app_version: Str.trim(appInfo.appVersion).length > 0 ? `VidBeep v${Str.trim(appInfo.appVersion)}` : UNKNOWN_VALUE,
    os_version: known(Str.trim(appInfo.osVersion)),
  });
  return `${GITHUB_ISSUE_BASE}?${issueParams.toString()}`;
});
