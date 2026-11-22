import type { YtDlpKernelStatus } from '@shared/types'
import {
  type KernelErrorAppInfo as AppInfo,
  buildKernelErrorReport as format,
  KERNEL_PREPARATION_ISSUE_TITLE as issueTitle,
  buildKernelIssueUrl as issueUrl,
  normalizeKernelError
} from '../components/kernel/kernel-error-report'

export type KernelErrorAppInfo = AppInfo
export const buildKernelIssueUrl = issueUrl
export const KERNEL_PREPARATION_ISSUE_TITLE = issueTitle

// Keep error normalization before the native clock and all subsequent metadata reads.
export function buildKernelErrorReport(
  status: YtDlpKernelStatus,
  appInfo: KernelErrorAppInfo
): string {
  const errorText = normalizeKernelError(status.error)
  const timestamp = new Date().toISOString()
  return format(status, appInfo, timestamp, errorText)
}
