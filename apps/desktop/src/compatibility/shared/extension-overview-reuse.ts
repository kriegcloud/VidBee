// Retain the old constant import's eager authored-skill initialization.
import '../../shared/ai-prompts'

import * as Native from '../../shared/extension-overview-reuse'
import {
  type ExtensionOverviewTarget as ReexportExtensionOverviewTarget,
  isReusableOverviewSnapshot as ReexportisReusableOverviewSnapshot,
  type OverviewDownloadMatch as ReexportOverviewDownloadMatch,
  type OverviewSourceLookup as ReexportOverviewSourceLookup,
  resolveExtensionOverviewTarget as ReexportresolveExtensionOverviewTarget,
  snapshotFromOverviewThread as ReexportsnapshotFromOverviewThread
} from '../../shared/extension-overview-reuse'

export {
  type ReexportExtensionOverviewTarget as ExtensionOverviewTarget,
  ReexportisReusableOverviewSnapshot as isReusableOverviewSnapshot,
  type ReexportOverviewDownloadMatch as OverviewDownloadMatch,
  type ReexportOverviewSourceLookup as OverviewSourceLookup,
  ReexportresolveExtensionOverviewTarget as resolveExtensionOverviewTarget,
  ReexportsnapshotFromOverviewThread as snapshotFromOverviewThread
}
export const findDownloadIdForSourceUrl = (
  sourceUrl: string,
  tasks: readonly Native.OverviewDownloadMatch[],
  hasReusableOverview: (id: string) => boolean = () => false
): string | null =>
  Native.findDownloadIdForSourceUrl({
    sourceUrl,
    tasks,
    hasReusableOverview
  })
