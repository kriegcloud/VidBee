import * as Native from '../../shared/transcript-export'
import {
  type BuildExportUnitsInput as ReexportBuildExportUnitsInput,
  type BuildTranscriptExportFileNameInput as ReexportBuildTranscriptExportFileNameInput,
  type BuildTranscriptExportInput as ReexportBuildTranscriptExportInput,
  type BuildVideoSubtitleExportFileNameInput as ReexportBuildVideoSubtitleExportFileNameInput,
  buildTranscriptExportText as ReexportbuildTranscriptExportText,
  formatExportClock as ReexportformatExportClock,
  type TranscriptExportFileExtension as ReexportTranscriptExportFileExtension,
  type TranscriptExportFormat as ReexportTranscriptExportFormat,
  type TranscriptExportGrouping as ReexportTranscriptExportGrouping,
  type TranscriptExportSegment as ReexportTranscriptExportSegment,
  type TranscriptExportStyle as ReexportTranscriptExportStyle,
  type TranscriptExportUnit as ReexportTranscriptExportUnit,
  type TranscriptVideoEncode as ReexportTranscriptVideoEncode,
  videoEncodeExtension as ReexportvideoEncodeExtension
} from '../../shared/transcript-export'

export {
  type ReexportBuildExportUnitsInput as BuildExportUnitsInput,
  type ReexportBuildTranscriptExportFileNameInput as BuildTranscriptExportFileNameInput,
  type ReexportBuildTranscriptExportInput as BuildTranscriptExportInput,
  type ReexportBuildVideoSubtitleExportFileNameInput as BuildVideoSubtitleExportFileNameInput,
  ReexportbuildTranscriptExportText as buildTranscriptExportText,
  ReexportformatExportClock as formatExportClock,
  type ReexportTranscriptExportFileExtension as TranscriptExportFileExtension,
  type ReexportTranscriptExportFormat as TranscriptExportFormat,
  type ReexportTranscriptExportGrouping as TranscriptExportGrouping,
  type ReexportTranscriptExportSegment as TranscriptExportSegment,
  type ReexportTranscriptExportStyle as TranscriptExportStyle,
  type ReexportTranscriptExportUnit as TranscriptExportUnit,
  type ReexportTranscriptVideoEncode as TranscriptVideoEncode,
  ReexportvideoEncodeExtension as videoEncodeExtension
}

import type {
  TranscriptExportFileExtension,
  TranscriptExportGrouping,
  TranscriptExportSegment,
  TranscriptExportUnit,
  TranscriptVideoEncode
} from '../../shared/transcript-export'
export function buildExportUnits(
  segments: TranscriptExportSegment[],
  grouping: TranscriptExportGrouping
): TranscriptExportUnit[] {
  return Native.buildExportUnits({
    segments,
    grouping
  })
}
export function buildTranscriptExportFileName(
  title: string,
  format: TranscriptExportFileExtension = 'txt',
  viaVidBee = false
): string {
  return Native.buildTranscriptExportFileName({
    title,
    format,
    viaVidBee
  })
}
export function buildVideoSubtitleExportFileName(
  title: string,
  mode: TranscriptVideoEncode
): string {
  return Native.buildVideoSubtitleExportFileName({
    title,
    mode
  })
}
