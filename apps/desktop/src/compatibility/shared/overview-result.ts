import * as Native from '../../shared/overview-result'
import {
  hasOverviewStructure as ReexporthasOverviewStructure,
  type OverviewChapter as ReexportOverviewChapter,
  type OverviewPlayhead as ReexportOverviewPlayhead,
  type OverviewPlayheadInput as ReexportOverviewPlayheadInput,
  type OverviewQuote as ReexportOverviewQuote,
  type ParsedOverview as ReexportParsedOverview,
  parseOverviewMarkdown as ReexportparseOverviewMarkdown
} from '../../shared/overview-result'

export {
  ReexporthasOverviewStructure as hasOverviewStructure,
  type ReexportOverviewChapter as OverviewChapter,
  type ReexportOverviewPlayhead as OverviewPlayhead,
  type ReexportOverviewPlayheadInput as OverviewPlayheadInput,
  type ReexportOverviewQuote as OverviewQuote,
  type ReexportParsedOverview as ParsedOverview,
  ReexportparseOverviewMarkdown as parseOverviewMarkdown
}

import type { OverviewChapter, OverviewPlayhead } from '../../shared/overview-result'
export function overviewPlayhead(
  chapters: readonly OverviewChapter[],
  currentSeconds: number,
  durationSeconds = 0
): OverviewPlayhead {
  return Native.overviewPlayhead({
    chapters,
    currentSeconds,
    durationSeconds
  })
}
